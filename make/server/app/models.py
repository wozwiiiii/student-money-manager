"""
数据模型（08 §2.2 服务端存储清单）：
- users：账号信息 A1（登录标识、密码哈希、时间戳）——密码不存明文（08 §2.6）
- sync_records：云端数据副本 A2（S1～S9 逐条记录 + 删除墓碑），记录级"最后写入胜出"（08 §9.2 [TBD-13]）
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # 登录标识：用户名或邮箱（08 §9.1），全局唯一；不收集手机号/身份证（08 §2.2）
    identifier: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    # 密码加盐慢哈希（bcrypt），不存明文、不可逆（08 §2.6）
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 登出即刻作废令牌（08 §2.6）：JWT 携带签发时的版本号，登出/注销后版本号递增
    token_version: Mapped[int] = mapped_column(default=0)


class SyncRecord(Base):
    """云端数据副本（A2）：一行 = 用户的一条业务记录（表名 + 记录 id + JSON 载荷）。"""

    __tablename__ = "sync_records"
    __table_args__ = (UniqueConstraint("user_id", "table_name", "record_id", name="uq_user_table_record"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    # 业务表名（对应备份文件 data 的键：accounts/snapshots/...，08 §2.2 S1～S9）
    table_name: Mapped[str] = mapped_column(String(32))
    # 业务记录主键
    record_id: Mapped[str] = mapped_column(String(64))
    # 业务记录内容（JSON 文本；结构与备份文件同源，08 §9.2 同步范围）
    payload: Mapped[str] = mapped_column(Text)
    # 记录最近修改时间（ISO 字符串）：LWW 比较依据（08 §9.2 [TBD-13]）
    record_updated_at: Mapped[str] = mapped_column(String(40), index=True)
    # 删除墓碑：本地删除也同步（删除即一条 deleted=true 的更新，同样走 LWW）
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
