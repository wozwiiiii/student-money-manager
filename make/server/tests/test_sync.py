"""云同步行为测试（08 §9.2 记录级 LWW、删除墓碑、账号隔离）。"""
from fastapi.testclient import TestClient


def _push(client: TestClient, headers: dict, records: list[dict]) -> dict:
    resp = client.post("/api/sync/push", headers=headers, json={"records": records})
    assert resp.status_code == 200
    return resp.json()


def _pull(client: TestClient, headers: dict) -> list[dict]:
    resp = client.get("/api/sync/pull", headers=headers)
    assert resp.status_code == 200
    return resp.json()["records"]


def test_push_then_pull_roundtrip(client: TestClient, auth_headers: dict):
    _push(
        client,
        auth_headers,
        [
            {
                "table": "transactions",
                "recordId": "tx1",
                "payload": {"id": "tx1", "amountCents": 1550, "memo": "午饭"},
                "updatedAt": "2026-11-13T02:00:00.000Z",
                "deleted": False,
            }
        ],
    )
    records = _pull(client, auth_headers)
    assert len(records) == 1
    assert records[0]["recordId"] == "tx1"
    assert records[0]["payload"]["amountCents"] == 1550


def test_lww_newer_wins_older_skipped(client: TestClient, auth_headers: dict):
    rec = {
        "table": "goals",
        "recordId": "g1",
        "payload": {"id": "g1", "targetCents": 100},
        "updatedAt": "2026-11-13T02:00:00.000Z",
        "deleted": False,
    }
    _push(client, auth_headers, [rec])
    # 较旧的写入被跳过（最后写入胜出，08 §9.2 [TBD-13]）
    result = _push(
        client,
        auth_headers,
        [{**rec, "payload": {"id": "g1", "targetCents": 50}, "updatedAt": "2026-11-13T01:00:00.000Z"}],
    )
    assert result == {"applied": 0, "skipped": 1}
    assert _pull(client, auth_headers)[0]["payload"]["targetCents"] == 100
    # 较新的写入覆盖
    result = _push(
        client,
        auth_headers,
        [{**rec, "payload": {"id": "g1", "targetCents": 200}, "updatedAt": "2026-11-13T03:00:00.000Z"}],
    )
    assert result == {"applied": 1, "skipped": 0}
    assert _pull(client, auth_headers)[0]["payload"]["targetCents"] == 200


def test_delete_tombstone_syncs(client: TestClient, auth_headers: dict):
    rec = {
        "table": "accounts",
        "recordId": "a1",
        "payload": {"id": "a1"},
        "updatedAt": "2026-11-13T02:00:00.000Z",
        "deleted": False,
    }
    _push(client, auth_headers, [rec])
    _push(
        client,
        auth_headers,
        [{**rec, "updatedAt": "2026-11-13T04:00:00.000Z", "deleted": True}],
    )
    records = _pull(client, auth_headers)
    assert records[0]["deleted"] is True


def test_unknown_table_skipped(client: TestClient, auth_headers: dict):
    result = _push(
        client,
        auth_headers,
        [
            {
                "table": "evil_table",
                "recordId": "x",
                "payload": {},
                "updatedAt": "2026-11-13T02:00:00.000Z",
                "deleted": False,
            }
        ],
    )
    assert result == {"applied": 0, "skipped": 1}


def test_records_isolated_between_accounts(client: TestClient, auth_headers: dict):
    _push(
        client,
        auth_headers,
        [
            {
                "table": "transactions",
                "recordId": "tx1",
                "payload": {"id": "tx1"},
                "updatedAt": "2026-11-13T02:00:00.000Z",
                "deleted": False,
            }
        ],
    )
    other = client.post(
        "/api/auth/register",
        json={"identifier": "other@example.com", "password": "password123"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
    assert _pull(client, other_headers) == []


def test_sync_requires_auth(client: TestClient):
    assert client.get("/api/sync/pull").status_code == 401
    assert client.post("/api/sync/push", json={"records": []}).status_code == 401
