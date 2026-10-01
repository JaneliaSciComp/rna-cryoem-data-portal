from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from rna_portal.api import app, get_session
from rna_portal.models import Molecule, MoleculeFile

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def f(path, kind, source, size=10):
    return MoleculeFile(path=path, kind=kind, source=source, size=size, mtime=NOW)


@pytest.fixture
def client(engine, tmp_path, monkeypatch):
    thumbs = tmp_path / "thumbnails"
    thumbs.mkdir()
    (thumbs / "Mol9_gRNAde.png").write_bytes(b"\x89PNG fake")
    (tmp_path / "secret.png").write_bytes(b"outside")
    (thumbs / "notes.txt").write_text("not a png")
    monkeypatch.setenv("CATALOG_THUMBNAIL_DIR", str(thumbs))

    with Session(engine) as s:
        s.add_all([
            Molecule(
                id="Mol9_gRNAde", name="gRNAde", pdb_id="10ZT", resolution_a=2.97,
                thumbnail_path="Mol9_gRNAde.png", scanned_at=NOW,
                files=[
                    f("Mol9_gRNAde/PDB_deposit/10ZT.pdb", "model", "deposited"),
                    f("Mol9_gRNAde/AlphaFold/model_0.cif", "model", "predicted"),
                    f("Mol9_gRNAde/CryoEM/Maps/a b#c%.mrc", "map", "experimental", 300_000_000),
                ],
            ),
            Molecule(id="Mol 9", name="Mol 9", scanned_at=NOW),
        ])
        s.commit()

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


def test_list_molecules(client):
    rows = client.get("/molecules").json()
    assert [r["id"] for r in rows] == ["Mol 9", "Mol9_gRNAde"]
    mol9 = rows[1]
    assert (mol9["name"], mol9["pdb_id"], mol9["resolution_a"]) == ("gRNAde", "10ZT", 2.97)
    assert (mol9["n_models"], mol9["n_maps"]) == (2, 1)
    assert mol9["thumbnail_url"] == "/api/thumbnails/Mol9_gRNAde.png"
    assert rows[0]["thumbnail_url"] is None


def test_molecule_detail(client):
    body = client.get("/molecules/Mol9_gRNAde").json()
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


def test_unknown_file_is_404(client):
    assert client.get("/files/999999").status_code == 404


def test_thumbnail(client):
    r = client.get("/thumbnails/Mol9_gRNAde.png")
    assert r.status_code == 200 and r.content == b"\x89PNG fake"
    assert r.headers["content-type"] == "image/png"


@pytest.mark.parametrize("path", ["../secret.png", "notes.txt", "missing.png"])
def test_thumbnail_rejects_other_paths(client, path):
    assert client.get(f"/thumbnails/{path}").status_code == 404
