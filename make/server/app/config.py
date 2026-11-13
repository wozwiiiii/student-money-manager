"""
应用配置。
- DATABASE_URL：生产为 PostgreSQL（08 §2.6 服务端存储；部署方案 [TBD-19]）；
  测试用内存 SQLite。开发默认 SQLite 仅作零依赖起步，联调与生产一律 PostgreSQL。
- JWT_SECRET：令牌签名密钥 [TBD-18]；生产必须通过环境变量注入，禁止使用默认值。
"""
import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./dev.db",  # 开发默认；生产注入 postgresql://... [TBD-19]
)

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-secret-change-me-0123456789abcdef")
JWT_ALGORITHM = "HS256"
# 令牌有效期 [TBD-18]：当前 7 天，登出即刻作废（token_version 机制，08 §2.6）
JWT_EXPIRE_DAYS = 7

APP_NAME = "校园理财管家 API"
