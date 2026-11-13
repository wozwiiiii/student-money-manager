"""账号路由（08 §9.1 注册与登录、§9.3 登录态与登出、§9.4 注销）。"""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .db import get_db
from .models import SyncRecord, User
from .security import create_token, decode_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 密码至少 8 位、不限制字符类型（08 §9.1 [TBD-20]）
PASSWORD_MIN = 8
IDENTIFIER_MAX = 254


class RegisterIn(BaseModel):
    # 密码长度在路由内校验并统一报 400（不在 pydantic 层报 422，防注册语义泄漏）
    identifier: str = Field(max_length=IDENTIFIER_MAX)
    password: str


class LoginIn(BaseModel):
    identifier: str
    password: str


class TokenOut(BaseModel):
    token: str
    identifier: str


def _norm_identifier(identifier: str) -> str:
    return identifier.strip()


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    identifier = _norm_identifier(body.identifier)
    # 防账号枚举（08 §9.1）：统一报错文案，不区分"已存在"与"格式问题"
    generic = HTTPException(status_code=400, detail="注册信息不符合要求")
    if not identifier:
        raise generic
    if len(body.password) < PASSWORD_MIN:
        raise generic
    if db.query(User).filter(User.identifier == identifier).first():
        raise generic
    user = User(
        id=str(uuid.uuid4()),
        identifier=identifier,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    return TokenOut(token=create_token(user.id, user.token_version), identifier=user.identifier)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    identifier = _norm_identifier(body.identifier)
    # 统一失败文案"登录标识或密码错误"（08 §9.1）
    unauthorized = HTTPException(status_code=401, detail="登录标识或密码错误")
    user = db.query(User).filter(User.identifier == identifier).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise unauthorized
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return TokenOut(token=create_token(user.id, user.token_version), identifier=user.identifier)


def get_current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    """鉴权依赖：Bearer 令牌 + token_version 比对（登出即刻作废，08 §2.6）。"""
    unauthorized = HTTPException(status_code=401, detail="未登录或登录已过期")
    if not authorization.startswith("Bearer "):
        raise unauthorized
    payload = decode_token(authorization.removeprefix("Bearer ").strip())
    if payload is None:
        raise unauthorized
    user = db.get(User, payload.get("sub"))
    if user is None or user.token_version != payload.get("tv"):
        raise unauthorized
    return user


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """登出：令牌版本号递增，旧令牌即刻作废；本地数据由前端保留（08 §9.3）。"""
    user.token_version += 1
    db.commit()
    return {"ok": True}


@router.delete("/me")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """注销（08 §9.4）：删除账号信息 A1 与云端数据副本 A2；本机数据由前端保留。"""
    db.query(SyncRecord).filter(SyncRecord.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}
