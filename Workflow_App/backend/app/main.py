# app/main.py

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.graph_router import router as graph_router
from app.routers.flow_router import router as flow_router
from app.routers.local_files_router import router as local_files_router
from app.routers.bot_router import router as bot_router
from app.routers.provider_router import router as provider_router
from app.routers.variable_router import router as variable_router
from app.routers.converter_router import router as converter_router
from app.routers.time_router import router as time_router
from app.routers.python_files_router import router as python_files_router
from app.routers.hitl_router import router as hitl_router
from app.routers.files_router import router as files_router
from app.database import file_repository
from app import runtime
from app.resume import scheduler_loop
from app import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    runtime.set_loop(asyncio.get_running_loop())
    await db.init_db()
    await file_repository.ensure_tables()
    await db.fail_interrupted_pauses()
    scheduler = asyncio.create_task(scheduler_loop())
    yield
    scheduler.cancel()
    pool = await db.get_pool()
    await pool.close()


app = FastAPI(title="Dynamic LangGraph Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph_router, prefix="/graph")
app.include_router(flow_router)
app.include_router(local_files_router)
app.include_router(bot_router)
app.include_router(provider_router)
app.include_router(variable_router)
app.include_router(converter_router)
app.include_router(time_router)
app.include_router(python_files_router)
app.include_router(hitl_router)
app.include_router(files_router)

@app.get("/")
def root():
    return {"status": "LangGraph Running"}