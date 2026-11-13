"""pytest 共享夹具：内存 SQLite + FastAPI TestClient（生产为 PostgreSQL，见 config.py）。"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")  # 必须在导入 app 前设置

import pytest
from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app


@pytest.fixture()
def client() -> TestClient:
    # 每个测试清空库（内存库跨测试共享，需重置保证隔离）
    from app.db import Base, engine

    Base.metadata.drop_all(engine)
    init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers(client: TestClient) -> dict:
    """注册一个测试账号并返回鉴权头。"""
    resp = client.post(
        "/api/auth/register",
        json={"identifier": "tester@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['token']}"}
