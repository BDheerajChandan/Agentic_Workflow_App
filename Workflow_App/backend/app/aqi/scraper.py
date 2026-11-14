# app/aqi/scraper.py
# AQI.in dashboard fetch + extraction (ported from the reference main.py).
# HTTP 403/429 are reported as-is: no bypass, no retry loop, short cooldown to avoid hammering.

import re
import threading
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.aqi.in"
WARMUP_TIMEOUT = 20
PAGE_TIMEOUT = 40
BLOCK_COOLDOWN = 300

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.aqi.in/",
}

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

_LOCK = threading.Lock()
_BLOCKED = {"until": 0.0, "status": None, "message": ""}


class AqiError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.message = message
        self.status = status


class AqiAccessError(AqiError):
    pass


class AqiNotFound(AqiError):
    pass


class AqiContentError(AqiError):
    pass


def slugify(value) -> str:
    s = re.sub(r"[\s_/]+", "-", str(value or "").strip().lower())
    s = re.sub(r"[^a-z0-9-]", "", s)
    return re.sub(r"-{2,}", "-", s).strip("-")


def prettify(slug: str) -> str:
    return str(slug or "").replace("-", " ").title()


def build_url(country, state=None, city=None) -> str:
    parts = [p for p in (country, state, city) if p]
    if not parts or any(not SLUG_RE.match(p) for p in parts):
        raise AqiError("Invalid location: slugs may contain only lowercase letters, digits and hyphens.")
    return f"{BASE_URL}/dashboard/" + "/".join(parts)


def fetch_html(url: str, warm: bool = True):
    with _LOCK:
        if _BLOCKED["until"] > time.time():
            raise AqiAccessError(_BLOCKED["message"], _BLOCKED["status"])

    session = requests.Session()
    session.headers.update(HEADERS)
    if warm:
        try:
            session.get(f"{BASE_URL}/", timeout=WARMUP_TIMEOUT)
        except requests.RequestException:
            pass

    try:
        resp = session.get(url, timeout=PAGE_TIMEOUT)
    except requests.Timeout:
        raise AqiError(f"Request to AQI.in timed out after {PAGE_TIMEOUT}s. URL: {url}")
    except requests.RequestException as exc:
        raise AqiError(f"Network error while contacting AQI.in: {exc}")

    code = resp.status_code
    if code in (403, 429):
        if code == 403:
            msg = (
                "AQI.in is blocking this request (HTTP 403). The website may require "
                f"browser verification or authorized API access. Requested URL: {url}"
            )
        else:
            msg = f"AQI.in rate limit exceeded (HTTP 429). Try again later. Requested URL: {url}"
        with _LOCK:
            _BLOCKED.update(until=time.time() + BLOCK_COOLDOWN, status=code, message=msg)
        raise AqiAccessError(msg, code)
    if code == 404:
        raise AqiNotFound(f"AQI.in has no dashboard at {url} (HTTP 404).", 404)
    if not resp.ok:
        raise AqiError(f"AQI.in returned HTTP {code} for {url}.", code)

    if "charset" not in resp.headers.get("Content-Type", "").lower():
        resp.encoding = "utf-8"
    return resp.text, code


# ─── Extraction ───────────────────────────────────────────────────────────────

PATTERNS = {
    "AQI": r".{0,60}AQI.{0,100}",
    "PM2.5": r".{0,60}PM2\.?5.{0,100}",
    "PM10": r".{0,60}PM10.{0,100}",
    "CO": r".{0,60}Carbon Monoxide.{0,100}",
    "NO2": r".{0,60}Nitrogen Dioxide.{0,100}",
    "SO2": r".{0,60}Sulfur Dioxide.{0,100}",
    "O3": r".{0,60}Ozone.{0,100}",
    "Temperature": r".{0,60}Temperature.{0,100}",
    "Humidity": r".{0,60}Humidity.{0,100}",
    "Wind": r".{0,60}Wind.{0,100}",
}

_UNIT = r"(µg/m³|μg/m³|µg/m3|ug/m3|mg/m³|ppb|ppm)"
_POLLUTANTS = {
    "pm25": r"PM\s*2\.?5",
    "pm10": r"PM\s*10",
    "co": r"(?<![A-Za-z0-9])CO",
    "no2": r"(?<![A-Za-z0-9])NO\s*[2₂]",
    "so2": r"(?<![A-Za-z0-9])SO\s*[2₂]",
    "o3": r"(?<![A-Za-z0-9])O\s*[3₃]",
}
_CATEGORY = (
    r"Air Quality is\s*(Unhealthy for Sensitive Groups|Very Unhealthy|Good|Moderate|"
    r"Poor|Unhealthy|Severe|Hazardous)"
)
_BLOCK_MARKERS = (
    "access denied", "just a moment", "attention required", "captcha",
    "verify you are human", "enable javascript and cookies",
)


def _num(text):
    try:
        v = float(text)
    except (TypeError, ValueError):
        return None
    return int(v) if v.is_integer() else v


def _search(pattern, text, flags=re.I):
    m = re.search(pattern, text, flags)
    return m


def _structured(text):
    m = _search(r"Live\s*AQI\s*(\d{1,4})\s*\(?\s*AQI[\s-]*\(?\s*([A-Za-z]{2,3})?", text) or _search(
        r"(\d{1,4})\s*\(?\s*AQI[\s-]*\(?\s*(US|IN)\b", text
    )
    aqi = _num(m.group(1)) if m else None
    standard = m.group(2).upper() if m and m.group(2) else None

    cat = _search(_CATEGORY, text)
    pollutants = {}
    for key, sym in _POLLUTANTS.items():
        pm = _search(rf"{sym}\s*:\s*(\d+(?:\.\d+)?)\s*{_UNIT}?", text)
        pollutants[key] = (
            {"value": _num(pm.group(1)), "unit": pm.group(2)} if pm else None
        )

    temp = _search(r"(-?\d+(?:\.\d+)?)\s*°\s*C", text)
    hum = _search(r"Humidity\s*:?\s*(\d+(?:\.\d+)?)\s*%", text)
    wind = _search(r"Wind\s*Speed\s*:?\s*(\d+(?:\.\d+)?)\s*(km/h|m/s|mph)", text)
    uv = _search(r"UV\s*Index\s*:?\s*(\d+(?:\.\d+)?)", text)
    upd = _search(
        r"Last Updated:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)", text
    )
    return {
        "aqi": aqi,
        "aqi_standard": standard,
        "category": cat.group(1) if cat else None,
        "pollutants": pollutants,
        "weather": {
            "temperature_c": _num(temp.group(1)) if temp else None,
            "humidity_pct": _num(hum.group(1)) if hum else None,
            "wind_speed": _num(wind.group(1)) if wind else None,
            "wind_speed_unit": wind.group(2) if wind else None,
            "uv_index": _num(uv.group(1)) if uv else None,
        },
        "last_updated": upd.group(1) if upd else None,
    }


def parse_page(html: str, url: str, status: int) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None

    metadata = {}
    for tag in soup.find_all("meta"):
        name = tag.get("name") or tag.get("property")
        content = tag.get("content")
        if name and content:
            metadata[name] = content

    headings = [h.get_text(" ", strip=True) for h in soup.find_all(["h1", "h2", "h3", "h4"])]

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    full_text = soup.get_text(separator="\n", strip=True)

    aqi_matches = {
        name: re.findall(pattern, full_text, flags=re.IGNORECASE)
        for name, pattern in PATTERNS.items()
    }

    tables = []
    for index, table in enumerate(soup.find_all("table")):
        rows = []
        for tr in table.find_all("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.find_all(["th", "td"])]
            if cells:
                rows.append(cells)
        tables.append({"table_number": index + 1, "rows": rows})

    info = _structured(full_text)
    has_data = info["aqi"] is not None or any(info["pollutants"].values())

    if not has_data or not aqi_matches["AQI"]:
        probe = f"{title or ''} {full_text[:2000]}".lower()
        if any(marker in probe for marker in _BLOCK_MARKERS):
            raise AqiAccessError(
                f"AQI.in returned an access-verification page instead of AQI data. URL: {url}",
                status,
            )
        raise AqiContentError(
            f"The page at {url} does not contain recognizable AQI data.", status
        )

    return {
        "success": True,
        "status": "success",
        "url": url,
        "http_status": status,
        "scraped_at": datetime.now().isoformat(),
        "title": title,
        **info,
        "metadata": metadata,
        "headings": headings,
        "full_text": full_text,
        "tables": tables,
        "aqi_matches": aqi_matches,
        "html": html,
    }


def scrape(url: str) -> dict:
    html, status = fetch_html(url)
    return parse_page(html, url, status)