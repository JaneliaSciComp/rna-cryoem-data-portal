"""Tests run against real Postgres: `pixi run db-up` locally, a service container in CI."""
import os
import time

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

TEST_DB = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres:test@localhost:55432/postgres"
)


@pytest.fixture(scope="session")
def _db_ready():
    eng = create_engine(TEST_DB)
    deadline = time.monotonic() + 30
    while True:
        try:
            with eng.connect():
                break
        except OperationalError:
            if time.monotonic() > deadline:
                raise
            time.sleep(1)
    eng.dispose()


@pytest.fixture
def engine(_db_ready, monkeypatch):
    """An empty, migrated database. CATALOG_DB_URL points at it for code under test."""
    monkeypatch.setenv("CATALOG_DB_URL", TEST_DB)
    from rna_portal import db

    db.engine.cache_clear()
    eng = create_engine(TEST_DB)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    db.migrate()
    yield eng
    eng.dispose()
    db.engine.cache_clear()
