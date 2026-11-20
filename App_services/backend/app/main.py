# app/main.py

import asyncio
import hmac
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config.settings import settings
from app.control.service_manager import manager
from app.database.connection import check_db, close_pool
from app.database.migrations import init_db
from app.routers.config_router import router as config_router
from app.routers.docker_router import router as docker_router
from app.routers.health_router import router as health_router
from app.routers.project_router import router as project_router
from app.routers.service_router import router as service_router
from app.schemas.service_schema import ok
from app.utils.config_loader import bootstrap_from_file
from app.utils.errors import ApiError
from app.utils.logger import get_logger, setup_logging

setup_logging()
log = get_logger("main")


async def _init_database() -> None:
    last = None
    for attempt in range(1, 6):
        try:
            await init_db()
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
            log.warning("Database not ready (attempt %d/5): %s", attempt, type(exc).__name__)
            await asyncio.sleep(2)
    raise RuntimeError(f"PostgreSQL is unavailable ({type(last).__name__}). Check DB_* in backend/.env.")


async def _reconcile_safely() -> None:
    await asyncio.sleep(2)
    try:
        result = await manager.reconcile()
        log.info("Reconcile finished: docker=%s candidates=%s", result["docker"], result["candidates"])
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        log.exception("Reconcile failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s (projects root: %s)", settings.APP_NAME, settings.PROJECTS_ROOT)
    await _init_database()
    await bootstrap_from_file()

    background = [asyncio.create_task(manager.monitor_loop())]
    if settings.RECONCILE_ON_START:
        background.append(asyncio.create_task(_reconcile_safely()))

    yield

    for task in background:
        task.cancel()
    await asyncio.gather(*background, return_exceptions=True)
    await close_pool()


app = FastAPI(title="DJ Application Services", lifespan=lifespan)


def _fail(status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "message": message,
                 "error": {"code": code, "message": message, "details": details}},
    )


@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError):
    return _fail(exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    details = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
    return _fail(422, "validation_error", "The request is invalid.", details)


@app.exception_handler(StarletteHTTPException)
async def _http_error(_: Request, exc: StarletteHTTPException):
    return _fail(exc.status_code, "http_error", str(exc.detail))


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return _fail(500, "internal_error", "An unexpected error occurred. See the DJ Services log for details.")


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    """Local CSRF defence: browsers send Origin on cross-site requests. curl and other clients send none."""
    origin = request.headers.get("origin")
    if (
        origin
        and request.method in ("POST", "PUT", "PATCH", "DELETE")
        and request.url.path.startswith("/api/")
        and origin not in settings.CORS_ORIGINS
    ):
        return _fail(403, "forbidden_origin", "Cross-site requests are not allowed.")
    return await call_next(request)


@app.middleware("http")
async def admin_token_guard(request: Request, call_next):
    if (
        # settings.ADMIN_TOKEN
        request.method != "OPTIONS"
        and request.url.path.startswith("/api/")
        and request.url.path != "/api/health"
    ):
        supplied = request.headers.get("x-admin-token", "")
        if not hmac.compare_digest(supplied.encode(), settings.ADMIN_TOKEN.encode()):
            return _fail(401, "unauthorized", "A valid admin token is required (X-Admin-Token).")
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(service_router)
app.include_router(project_router)
app.include_router(docker_router)
app.include_router(health_router)
app.include_router(config_router)


@app.get("/api/health")
async def health():
    db_ok, db_error = await check_db()
    return ok(
        {"status": "ok" if db_ok else "degraded", "database": "connected" if db_ok else "unavailable",
         "database_error": db_error, "auth_required": bool(settings.ADMIN_TOKEN)},
        "DJ Services is running." if db_ok else "DJ Services is running without a database.",
    )