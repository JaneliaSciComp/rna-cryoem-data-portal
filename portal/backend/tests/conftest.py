"""Tests run against real Postgres and Typesense: `pixi run db-up` locally, service containers in CI."""
import os
import time

import httpx
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


# A test-only variable, never CATALOG_TYPESENSE_URL. The tests may share a local app's Typesense:
# they index under their own alias, so they never touch the app's index.
TEST_TYPESENSE = os.environ.get("TEST_TYPESENSE_URL", "http://localhost:58108")
TEST_TYPESENSE_KEY = os.environ.get("TEST_TYPESENSE_API_KEY", "test")


@pytest.fixture
def typesense(monkeypatch):
    """An empty Typesense: `pixi run db-up` locally, a service container in CI. CATALOG_TYPESENSE_*
    point at it for code under test, and search.ALIAS is test_molecules. Yields an httpx client for it."""
    monkeypatch.setenv("CATALOG_TYPESENSE_URL", TEST_TYPESENSE)
    monkeypatch.setenv("CATALOG_TYPESENSE_API_KEY", TEST_TYPESENSE_KEY)
    from rna_portal import search

    monkeypatch.setattr(search, "ALIAS", "test_molecules")
    search.client.cache_clear()
    c = httpx.Client(base_url=TEST_TYPESENSE, headers={"X-TYPESENSE-API-KEY": TEST_TYPESENSE_KEY})
    deadline = time.monotonic() + 30
    while True:
        try:
            if c.get("/health").json().get("ok"):
                break
        except httpx.HTTPError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError(f"Typesense at {TEST_TYPESENSE} isn't healthy")
        time.sleep(1)
    c.delete(f"/aliases/{search.ALIAS}")
    for coll in c.get("/collections").json():
        if coll["name"].startswith(f"{search.ALIAS}_"):
            c.delete(f"/collections/{coll['name']}")
    yield c
    c.close()
    search.client.cache_clear()
