# app/main.py

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.graph_router import router as graph_router
from app.routers.flow_router import router as flow_router
from app.routers.local_files_router import router as local_files_router
from app.routers.bot_router import router as bot_router
from app import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    yield
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


@app.get("/")
def root():
    return {"status": "LangGraph Running"}