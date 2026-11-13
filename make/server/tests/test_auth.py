"""账号行为测试（08 §9.1/§9.3/§9.4、§2.6 密码安全）。"""
from fastapi.testclient import TestClient


def test_register_returns_token_and_can_pull(client: TestClient):
    resp = client.post(
        "/api/auth/register",
        json={"identifier": "alice", "password": "password123"},
    )
    assert resp.status_code == 201
    token = resp.json()["token"]
    pull = client.get("/api/sync/pull", headers={"Authorization": f"Bearer {token}"})
    assert pull.status_code == 200
    assert pull.json()["records"] == []


def test_register_duplicate_uses_generic_error(client: TestClient):
    payload = {"identifier": "alice", "password": "password123"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 400
    # 防账号枚举（08 §9.1）：不区分"已存在"
    assert resp.json()["detail"] == "注册信息不符合要求"


def test_register_short_password_rejected(client: TestClient):
    resp = client.post("/api/auth/register", json={"identifier": "bob", "password": "short"})
    assert resp.status_code == 400


def test_password_stored_as_hash_not_plaintext(client: TestClient):
    from app.db import SessionLocal
    from app.models import User

    client.post("/api/auth/register", json={"identifier": "carol", "password": "password123"})
    with SessionLocal() as db:
        user = db.query(User).filter(User.identifier == "carol").first()
        assert user is not None
        assert user.password_hash != "password123"
        assert user.password_hash.startswith("$2")  # bcrypt


def test_login_wrong_password_generic_error(client: TestClient):
    client.post("/api/auth/register", json={"identifier": "dave", "password": "password123"})
    resp = client.post("/api/auth/login", json={"identifier": "dave", "password": "wrong-pass"})
    assert resp.status_code == 401
    # 统一文案"登录标识或密码错误"（08 §9.1）
    assert resp.json()["detail"] == "登录标识或密码错误"
    resp2 = client.post("/api/auth/login", json={"identifier": "no-such-user", "password": "whatever12"})
    assert resp2.status_code == 401
    assert resp2.json()["detail"] == "登录标识或密码错误"


def test_logout_invalidates_token_immediately(client: TestClient, auth_headers: dict):
    assert client.post("/api/auth/logout", headers=auth_headers).status_code == 200
    # 登出后旧令牌即刻作废（08 §2.6）
    assert client.get("/api/sync/pull", headers=auth_headers).status_code == 401


def test_delete_account_removes_cloud_records(client: TestClient, auth_headers: dict):
    client.post(
        "/api/sync/push",
        headers=auth_headers,
        json={
            "records": [
                {
                    "table": "transactions",
                    "recordId": "tx1",
                    "payload": {"id": "tx1", "amountCents": 100},
                    "updatedAt": "2026-11-13T00:00:00.000Z",
                    "deleted": False,
                }
            ]
        },
    )
    assert client.delete("/api/auth/me", headers=auth_headers).status_code == 200
    # 旧令牌失效
    assert client.get("/api/sync/pull", headers=auth_headers).status_code == 401
    # 同名重新注册为全新账号，云端无残留
    resp = client.post(
        "/api/auth/register",
        json={"identifier": "tester@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    pull = client.get(
        "/api/sync/pull",
        headers={"Authorization": f"Bearer {resp.json()['token']}"},
    )
    assert pull.json()["records"] == []
