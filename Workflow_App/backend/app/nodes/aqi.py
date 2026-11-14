# app/nodes/aqi.py

from app.aqi import exporter, locations
from app.aqi.scraper import AqiError, build_url, prettify, scrape, slugify
from app.expressions import ExpressionError, build_context, has_template, interpolate


def _slug(state, cfg, ctx, key, state_key, label):
    value = state.get(state_key)
    if value in (None, ""):
        value = cfg.get(key)
    if has_template(value):
        try:
            value = interpolate(value, ctx)
        except ExpressionError as exc:
            raise ValueError(f"AQI: {exc}")
    if value in (None, ""):
        return ""
    if isinstance(value, (dict, list)):
        raise ValueError(f"AQI: {label} must be text.")
    return slugify(value)


def aqi_node(state, config):
    cfg = config or {}
    ctx = build_context(state, cfg)

    country = _slug(state, cfg, ctx, "country", "aqi_country", "Country")
    st = _slug(state, cfg, ctx, "state", "aqi_state", "State")
    city = _slug(state, cfg, ctx, "city", "aqi_city", "City / District")

    if not country:
        raise ValueError("AQI: country is required.")
    if country not in locations.COUNTRIES:
        raise ValueError(f"AQI: unsupported country '{country}'.")
    if not st:
        raise ValueError("AQI: state is required.")
    if not locations.is_known_state(country, st):
        raise ValueError(f"AQI: unsupported state '{st}' for {country}.")
    if not city:
        raise ValueError("AQI: city / district is required.")

    enable = bool(cfg.get("enable_download"))
    formats = []
    if enable:
        formats = [str(f).lower() for f in (cfg.get("formats") or [])]
        if not formats:
            raise ValueError("AQI: select at least one download format.")
        bad = [f for f in formats if f not in exporter.FORMATS]
        if bad:
            raise ValueError(f"AQI: unsupported download format(s): {', '.join(bad)}.")

    try:
        url = build_url(country, st, city)
        result = scrape(url)
    except AqiError as exc:
        suffix = f" (HTTP {exc.status})" if exc.status and str(exc.status) not in exc.message else ""
        raise ValueError(f"AQI: {exc.message}{suffix}")

    html = result.pop("html", "")
    result["location"] = {
        "country": {"slug": country, "name": locations.COUNTRIES[country]["name"]},
        "state": {"slug": st, "name": cfg.get("state_name") or prettify(st)},
        "city": {"slug": city, "name": cfg.get("city_name") or prettify(city)},
    }

    if enable:
        try:
            result["download"] = exporter.export(
                result, html, formats, cfg.get("output_folder"), country, st, city
            )
        except ValueError as exc:
            result["download"] = {
                "enabled": True, "status": "failed", "directory": None,
                "files": [], "errors": [{"format": "all", "error": str(exc)}],
            }
    else:
        result["download"] = {"enabled": False, "status": "disabled", "files": [], "errors": []}

    return {
        "current_value": result,
        "data": {**(state.get("data") or {}), "aqi": result},
    }