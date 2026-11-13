"""云同步路由（08 §9.2：记录级"最后写入胜出" LWW，[TBD-13] 推断性简化待评审确认）。"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import get_current_user
from .db import get_db
from .models import SyncRecord, User

router = APIRouter(prefix="/api/sync", tags=["sync"])

# 允许同步的业务表（08 §2.2 清单 S1～S9，与备份文件 data 的键同源；A1 账号信息不同步）
ALLOWED_TABLES = {
    "accounts",
    "snapshots",
    "transactions",
    "categories",
    "mappingRules",
    "budgets",
    "customCycles",
    "goals",
    "goalEntries",
    "riskProfile",
    "settings",
    "appMeta",
}


class RecordIn(BaseModel):
    table: str
    recordId: str = Field(max_length=64)
    payload: dict
    updatedAt: str
    deleted: bool = False


class PushIn(BaseModel):
    records: list[RecordIn]


class RecordOut(BaseModel):
    table: str
    recordId: str
    payload: dict
    updatedAt: str
    deleted: bool


@router.get("/pull")
def pull(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """拉取该账号云端全部记录（含删除墓碑），客户端按 LWW 合并入本地。"""
    rows = db.query(SyncRecord).filter(SyncRecord.user_id == user.id).all()
    return {
        "records": [
            RecordOut(
                table=r.table_name,
                recordId=r.record_id,
                payload=json.loads(r.payload),
                updatedAt=r.record_updated_at,
                deleted=r.deleted,
            )
            for r in rows
        ]
    }


@router.post("/push")
def push(body: PushIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """推送变更；每条记录按 LWW 决定是否覆盖（较新者胜，08 §9.2 [TBD-13]）。"""
    applied = 0
    skipped = 0
    for rec in body.records:
        if rec.table not in ALLOWED_TABLES:
            skipped += 1
            continue
        row = (
            db.query(SyncRecord)
            .filter(
                SyncRecord.user_id == user.id,
                SyncRecord.table_name == rec.table,
                SyncRecord.record_id == rec.recordId,
            )
            .first()
        )
        if row is not None and row.record_updated_at >= rec.updatedAt:
            # 云端已有同龄或更新的版本：最后写入胜出，跳过
            skipped += 1
            continue
        if row is None:
            row = SyncRecord(
                user_id=user.id,
                table_name=rec.table,
                record_id=rec.recordId,
                payload=json.dumps(rec.payload, ensure_ascii=False),
                record_updated_at=rec.updatedAt,
                deleted=rec.deleted,
            )
            db.add(row)
        else:
            row.payload = json.dumps(rec.payload, ensure_ascii=False)
            row.record_updated_at = rec.updatedAt
            row.deleted = rec.deleted
        applied += 1
    db.commit()
    return {"applied": applied, "skipped": skipped}
