"""密码哈希与登录令牌（08 §2.6 安全边界）。"""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from . import config


def hash_password(password: str) -> str:
    """加盐慢哈希（bcrypt）；不存明文、不可逆（08 §2.6）。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: str, token_version: int) -> str:
    """有时效令牌（08 §2.6 [TBD-18]：当前 7 天）；携带 token_version 使登出即刻作废。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "tv": token_version,
        "iat": now,
        "exp": now + timedelta(days=config.JWT_EXPIRE_DAYS),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """校验令牌签名与有效期；失败返回 None。token_version 由调用方比对（登出作废）。"""
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
