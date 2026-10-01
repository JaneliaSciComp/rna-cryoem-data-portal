"""The database engine and migrations."""
from functools import cache
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine

from rna_portal import config

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


@cache
def engine() -> Engine:
    return create_engine(config.db_url(), pool_pre_ping=True)


def migrate() -> None:
    """Apply pending migrations to the database at CATALOG_DB_URL."""
    command.upgrade(Config(str(_ALEMBIC_INI)), "head")
