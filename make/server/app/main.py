"""FastAPI 入口（阶段 8：账号与云同步 API；08 §9 为行为权威定义）。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import config
from .auth import router as auth_router
from .db import init_db
from .sync import router as sync_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=config.APP_NAME, lifespan=lifespan)

app.include_router(auth_router)
app.include_router(sync_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "app": config.APP_NAME}
