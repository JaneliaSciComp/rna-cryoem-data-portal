"""The portal API. nginx mounts it at /api and strips the prefix.

Files are never read here: /files/{id} looks the file up in the catalog and answers with an
X-Accel-Redirect to nginx's internal /internal/data/ location, so only cataloged files can be
fetched and a 300 MB map never passes through Python.
"""
from collections.abc import Iterator
from datetime import datetime
from pathlib import PurePosixPath
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from rna_portal import config, db
from rna_portal.models import Kind, Molecule, MoleculeFile

app = FastAPI(title="RNA AI CryoEM data portal")

_MEDIA_TYPES = {
    ".pdb": "chemical/x-pdb",
    ".cif": "chemical/x-mmcif",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".log": "text/plain; charset=utf-8",
}


def get_session() -> Iterator[Session]:
    with Session(db.engine()) as session:
        yield session


class FileOut(BaseModel):
    id: int
    name: str
    path: str
    kind: str
    source: str
    size: int
    url: str


class MoleculeSummary(BaseModel):
    id: str
    name: str
    pdb_id: str | None
    resolution_a: float | None
    thumbnail_url: str | None
    n_models: int
    n_maps: int
    scanned_at: datetime


class MoleculeDetail(BaseModel):
    id: str
    name: str
    pdb_id: str | None
    resolution_a: float | None
    thumbnail_url: str | None
    scanned_at: datetime
    files: list[FileOut]


def _thumbnail_url(m: Molecule) -> str | None:
    return f"/api/thumbnails/{quote(m.thumbnail_path)}" if m.thumbnail_path else None


def _file_out(f: MoleculeFile) -> FileOut:
    return FileOut(
        id=f.id, name=PurePosixPath(f.path).name, path=f.path, kind=f.kind,
        source=f.source, size=f.size, url=f"/api/files/{f.id}",
    )


@app.get("/health")
def health() -> dict:
    """The ALB health check (nginx /healthz). Doesn't touch the database, so an RDS hiccup
    doesn't make the ALB pull the only task."""
    return {"ok": True}


@app.get("/molecules", response_model=list[MoleculeSummary])
def list_molecules(session: Session = Depends(get_session)):
    molecules = session.scalars(
        select(Molecule).options(selectinload(Molecule.files)).order_by(Molecule.id)
    ).all()
    return [
        MoleculeSummary(
            id=m.id, name=m.name, pdb_id=m.pdb_id, resolution_a=m.resolution_a,
            thumbnail_url=_thumbnail_url(m),
            n_models=sum(f.kind == Kind.MODEL for f in m.files),
            n_maps=sum(f.kind == Kind.MAP for f in m.files),
            scanned_at=m.scanned_at,
        )
        for m in molecules
    ]


@app.get("/molecules/{molecule_id}", response_model=MoleculeDetail)
def get_molecule(molecule_id: str, session: Session = Depends(get_session)):
    m = session.get(Molecule, molecule_id)
    if m is None:
        raise HTTPException(status_code=404, detail="molecule not found")
    return MoleculeDetail(
        id=m.id, name=m.name, pdb_id=m.pdb_id, resolution_a=m.resolution_a,
        thumbnail_url=_thumbnail_url(m), scanned_at=m.scanned_at,
        files=[_file_out(f) for f in m.files],
    )


@app.get("/files/{file_id}")
def get_file(file_id: int, session: Session = Depends(get_session)):
    f = session.get(MoleculeFile, file_id)
    if f is None:
        raise HTTPException(status_code=404, detail="file not found")
    name = PurePosixPath(f.path).name
    disposition = "attachment" if f.kind == Kind.MAP else "inline"
    return Response(
        media_type=_MEDIA_TYPES.get(PurePosixPath(name).suffix.lower(), "application/octet-stream"),
        headers={
            # Percent-encoded: nginx decodes it, and a raw "#" or "?" would cut the path short.
            "X-Accel-Redirect": "/internal/data/" + quote(f.path),
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(name)}",
        },
    )


@app.get("/thumbnails/{relpath:path}")
def get_thumbnail(relpath: str):
    root = config.thumbnail_dir().resolve()
    try:
        path = (root / relpath).resolve(strict=True)
    except OSError:
        raise HTTPException(status_code=404, detail="thumbnail not found")
    if not path.is_relative_to(root) or path.suffix != ".png":
        raise HTTPException(status_code=404, detail="thumbnail not found")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
