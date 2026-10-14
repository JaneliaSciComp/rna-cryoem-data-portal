from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from rna_portal import search
from rna_portal.api import app, get_session
from rna_portal.models import Molecule, MoleculeFile

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def f(path, kind, source, size=10):
    return MoleculeFile(path=path, kind=kind, source=source, size=size, mtime=NOW)


@pytest.fixture
def client(engine, typesense, tmp_path, monkeypatch):
    thumbs = tmp_path / "thumbnails"
    thumbs.mkdir()
    (thumbs / "Mol9_gRNAde.png").write_bytes(b"\x89PNG fake")
    (tmp_path / "secret.png").write_bytes(b"outside")
    (thumbs / "notes.txt").write_text("not a png")
    monkeypatch.setenv("CATALOG_THUMBNAIL_DIR", str(thumbs))
    monkeypatch.delenv("CATALOG_SERVE_FILES", raising=False)  # portal/.env sets it for local runs

    with Session(engine) as s:
        s.add_all([
            Molecule(
                id="Mol9_gRNAde", name="gRNAde", pdb_id="10ZT", resolution_a=2.97, nomask_resolution_a=3.5,
                thumbnail_path="Mol9_gRNAde.png", scanned_at=NOW,
                files=[
                    f("Mol9_gRNAde/PDB_deposit/10ZT.pdb", "model", "deposited"),
                    f("Mol9_gRNAde/AlphaFold/model_0.cif", "model", "predicted"),
                    f("Mol9_gRNAde/CryoEM/Maps/a b#c%.mrc", "map", "experimental", 300_000_000),
                ],
            ),
            Molecule(id="Mol 9", name="Mol 9", scanned_at=NOW),
            Molecule(
                id="Mol2_alpha", name="alpha", resolution_a=3.5, scanned_at=NOW,
                files=[f("Mol2_alpha/AlphaFold/a.cif", "model", "predicted"), f("Mol2_alpha/m/b.png", "micrograph", "other")],
            ),
        ])
        s.commit()
    search.reindex(engine)

    def session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = session
    yield TestClient(app)
    app.dependency_overrides.clear()


def file_id(client, name):
    files = client.get("/molecules/Mol9_gRNAde").json()["files"]
    return next(x["id"] for x in files if x["name"] == name)


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def ids(client, **params):
    r = client.get("/molecules", params=params)
    assert r.status_code == 200, r.text
    return [m["id"] for m in r.json()["molecules"]]


def test_list_molecules(client):
    body = client.get("/molecules").json()
    assert body["found"] == 3
    # Names A to Z, ignoring case.
    assert [r["id"] for r in body["molecules"]] == ["Mol2_alpha", "Mol9_gRNAde", "Mol 9"]
    mol9 = body["molecules"][1]
    assert (mol9["name"], mol9["pdb_id"], mol9["resolution_a"]) == ("gRNAde", "10ZT", 2.97)
    assert (mol9["n_models"], mol9["n_maps"]) == (2, 1)
    assert mol9["thumbnail_url"] == "/api/thumbnails/Mol9_gRNAde.png"
    assert mol9["scanned_at"] == "2026-10-01T00:00:00Z"
    assert body["molecules"][2]["thumbnail_url"] is None
    assert body["facets"]["kinds"] == {"model": 2, "map": 1, "micrograph": 1}


@pytest.mark.parametrize("q, expected", [
    ("grna", ["Mol9_gRNAde"]),
    ("RNAde", ["Mol9_gRNAde"]),  # infix
    ("10zt", ["Mol9_gRNAde"]),
    ("Mol2", ["Mol2_alpha"]),
    ("nothing", []),
])
def test_search_text(client, q, expected):
    assert ids(client, q=q) == expected


@pytest.mark.parametrize("params, expected", [
    ({"kind": "map"}, ["Mol9_gRNAde"]),
    ({"kind": ["model", "micrograph"]}, ["Mol2_alpha"]),  # every listed kind
    ({"max_resolution": 3}, ["Mol9_gRNAde"]),  # no resolution: excluded
    ({"kind": "model", "max_resolution": 3}, ["Mol9_gRNAde"]),
])
def test_filters(client, params, expected):
    assert ids(client, **params) == expected


def test_facets_count_within_the_results(client):
    facets = client.get("/molecules", params={"kind": "micrograph"}).json()["facets"]
    assert facets["kinds"] == {"model": 1, "micrograph": 1}


@pytest.mark.parametrize("sort, order, expected", [
    ("resolution_a", "asc", ["Mol9_gRNAde", "Mol2_alpha", "Mol 9"]),
    ("resolution_a", "desc", ["Mol2_alpha", "Mol9_gRNAde", "Mol 9"]),  # blanks stay last
    ("pdb_id", "asc", ["Mol9_gRNAde", "Mol2_alpha", "Mol 9"]),
    ("n_models", "desc", ["Mol9_gRNAde", "Mol2_alpha", "Mol 9"]),
    ("name", "desc", ["Mol 9", "Mol9_gRNAde", "Mol2_alpha"]),
])
def test_sort(client, sort, order, expected):
    assert ids(client, sort=sort, order=order) == expected


def test_pages(client):
    assert ids(client, per_page=2) == ["Mol2_alpha", "Mol9_gRNAde"]
    body = client.get("/molecules", params={"per_page": 2, "page": 2}).json()
    assert ([m["id"] for m in body["molecules"]], body["found"]) == (["Mol 9"], 3)


@pytest.mark.parametrize("params", [
    {"kind": "nope"}, {"sort": "path"}, {"max_resolution": "inf"}, {"max_resolution": 0},
    {"per_page": 251}, {"page": 0}, {"q": "x" * 201},
])
def test_bad_params_are_422(client, params):
    assert client.get("/molecules", params=params).status_code == 422


def test_search_unavailable_is_503(client, monkeypatch):
    monkeypatch.setenv("CATALOG_TYPESENSE_URL", "http://127.0.0.1:9")
    search.client.cache_clear()
    assert client.get("/molecules").status_code == 503


def test_molecule_detail(client):
    body = client.get("/molecules/Mol9_gRNAde").json()
    assert body["nomask_resolution_a"] == 3.5
    by_name = {x["name"]: x for x in body["files"]}
    pdb = by_name["10ZT.pdb"]
    assert (pdb["kind"], pdb["source"], pdb["path"]) == ("model", "deposited", "Mol9_gRNAde/PDB_deposit/10ZT.pdb")
    assert pdb["url"] == f"/api/files/{pdb['id']}"
    assert by_name["a b#c%.mrc"]["size"] == 300_000_000


def test_molecule_id_with_space(client):
    r = client.get("/molecules/Mol%209")
    assert r.status_code == 200 and r.json()["files"] == []


def test_unknown_molecule_is_404(client):
    assert client.get("/molecules/Nope").status_code == 404


def test_file_redirect_encodes_path(client):
    r = client.get(f"/files/{file_id(client, 'a b#c%.mrc')}")
    assert r.status_code == 200
    assert r.headers["x-accel-redirect"] == "/internal/data/Mol9_gRNAde/CryoEM/Maps/a%20b%23c%25.mrc"
    assert r.headers["content-disposition"].startswith("attachment;")  # maps download
    assert r.content == b""


def test_model_file_is_inline(client):
    r = client.get(f"/files/{file_id(client, '10ZT.pdb')}")
    assert r.headers["x-accel-redirect"] == "/internal/data/Mol9_gRNAde/PDB_deposit/10ZT.pdb"
    assert r.headers["content-disposition"].startswith("inline;")
    assert r.headers["content-type"].startswith("chemical/x-pdb")


def test_serve_files_sends_the_body(client, tmp_path, monkeypatch):
    model = tmp_path / "data/Mol9_gRNAde/PDB_deposit/10ZT.pdb"
    model.parent.mkdir(parents=True)
    model.write_text("HEADER\n")
    monkeypatch.setenv("CATALOG_DATA_ROOT", str(tmp_path / "data"))
    monkeypatch.setenv("CATALOG_SERVE_FILES", "1")
    r = client.get(f"/files/{file_id(client, '10ZT.pdb')}")
    assert r.content == b"HEADER\n"
    assert "x-accel-redirect" not in r.headers
    assert r.headers["content-disposition"].startswith("inline;")


def test_unknown_file_is_404(client):
    assert client.get("/files/999999").status_code == 404


def test_thumbnail(client):
    r = client.get("/thumbnails/Mol9_gRNAde.png")
    assert r.status_code == 200 and r.content == b"\x89PNG fake"
    assert r.headers["content-type"] == "image/png"


@pytest.mark.parametrize("path", ["../secret.png", "notes.txt", "missing.png"])
def test_thumbnail_rejects_other_paths(client, path):
    assert client.get(f"/thumbnails/{path}").status_code == 404
