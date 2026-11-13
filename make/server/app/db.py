"""SQLAlchemy 引擎与会话。"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from . import config


class Base(DeclarativeBase):
    pass


# SQLite 需要关闭同线程检查（仅开发/测试）；内存库用 StaticPool 保证多连接共享同一库
_engine_kwargs: dict = {}
if config.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
    if ":memory:" in config.DATABASE_URL:
        _engine_kwargs["poolclass"] = StaticPool

engine = create_engine(config.DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """建表（幂等）。生产迁移工具的引入 [TBD-19]，当前以 create_all 起步。"""
    from . import models  # noqa: F401  确保模型已注册

    Base.metadata.create_all(engine)


def get_db():
    """FastAPI 依赖：每个请求一个会话。"""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
