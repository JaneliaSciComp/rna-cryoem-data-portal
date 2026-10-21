from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from rna_portal import scanner, search
from rna_portal.models import Molecule

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def collections(typesense):
    return sorted(c["name"] for c in typesense.get("/collections").json() if c["name"].startswith(f"{search.ALIAS}_"))


def aliased(typesense):
    return typesense.get(f"/aliases/{search.ALIAS}").json()["collection_name"]


def test_reindex_swaps_the_alias_and_drops_the_old_collection(engine, typesense):
    with Session(engine) as s:
        s.add(Molecule(id="Mol1", name="One", scanned_at=NOW))
        s.commit()
    assert search.reindex(engine) == 1
    first = aliased(typesense)
    assert search.reindex(engine) == 1
    assert collections(typesense) == [aliased(typesense)] != [first]


def test_empty_catalog_indexes_nothing(engine, typesense):
    assert search.reindex(engine) == 0
    assert typesense.get(f"/collections/{search.ALIAS}").json()["num_documents"] == 0


def test_failed_reindex_keeps_the_previous_index(engine, typesense, monkeypatch):
    search.reindex(engine)
    before = aliased(typesense)
    monkeypatch.setattr(search, "document", lambda m: {"id": m.id})  # missing required fields
    with Session(engine) as s:
        s.add(Molecule(id="Mol1", name="One", scanned_at=NOW))
        s.commit()
    with pytest.raises(search.SearchUnavailable):
        search.reindex(engine)
    assert collections(typesense) == [before] == [aliased(typesense)]


def test_scanner_reports_a_failed_reindex(engine, typesense, monkeypatch):
    def fail(engine):
        raise search.SearchUnavailable("down")

    monkeypatch.setattr(search, "reindex", fail)
    assert scanner._reindex() is False
    monkeypatch.delenv("CATALOG_TYPESENSE_URL")
    assert scanner._reindex() is True  # not configured: nothing to rebuild
