"""The portal API. nginx mounts it at /api and strips the prefix.

Files are never read here: /files/{id} looks the file up in the catalog and answers with an
X-Accel-Redirect to nginx's internal /internal/data/ location, so only cataloged files can be
fetched and a 300 MB map never passes through Python. CATALOG_SERVE_FILES=1 (local
development, no nginx) sends the file from here instead.
"""
from collections.abc import Iterator
from datetime import datetime
from enum import StrEnum
from pathlib import PurePosixPath
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from rna_portal import config, db, search
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
    nomask_resolution_a: float | None
    particle_count: int | None
    thumbnail_url: str | None
    n_models: int
    n_maps: int
    scanned_at: datetime


class MoleculePage(BaseModel):
    found: int  # matches across all pages
    molecules: list[MoleculeSummary]
    # Matches per value, among this search's results: {"kinds": {"map": 3, ...}}
    facets: dict[str, dict[str, int]]


SortKey = StrEnum("SortKey", {k: k for k in search.SORT_FIELDS})


class MoleculeDetail(BaseModel):
    id: str
    name: str
    pdb_id: str | None
    resolution_a: float | None
    nomask_resolution_a: float | None
    particle_count: int | None
    thumbnail_url: str | None
    scanned_at: datetime
    files: list[FileOut]


def _thumbnail_url(thumbnail_path: str | None) -> str | None:
    return f"/api/thumbnails/{quote(thumbnail_path)}" if thumbnail_path else None


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


@app.get("/molecules", response_model=MoleculePage)
def list_molecules(
    q: Annotated[str | None, Query(max_length=200)] = None,
    kind: Annotated[list[Kind], Query()] = [],
    max_resolution: Annotated[float | None, Query(gt=0, allow_inf_nan=False)] = None,
    max_nomask_resolution: Annotated[float | None, Query(gt=0, allow_inf_nan=False)] = None,
    min_particles: Annotated[int | None, Query(ge=1)] = None,
    sort: SortKey | None = None,
    order: Literal["asc", "desc"] = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=250)] = 10,
):
    """Search the molecules: q matches name, id, or PDB ID; each filter narrows the results.
    Without a sort, the best text matches come first, then names A to Z."""
    try:
        r = search.search(
            q=q, kinds=kind, max_resolution=max_resolution,
            max_nomask_resolution=max_nomask_resolution, min_particles=min_particles,
            sort=sort, order=order, page=page, per_page=per_page,
        )
    except search.SearchUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"search unavailable: {exc}")
    return MoleculePage(
        found=r["found"],
        molecules=[
            MoleculeSummary(
                id=d["molecule_id"], name=d["name"], pdb_id=d.get("pdb_id"),
                resolution_a=d.get("resolution_a"), nomask_resolution_a=d.get("nomask_resolution_a"),
                particle_count=d.get("particle_count"), thumbnail_url=_thumbnail_url(d.get("thumbnail_path")),
                n_models=d["n_models"], n_maps=d["n_maps"], scanned_at=d["scanned_at"],
            )
            for d in (hit["document"] for hit in r["hits"])
        ],
        facets={f["field_name"]: {c["value"]: c["count"] for c in f["counts"]} for f in r["facet_counts"]},
    )


@app.get("/molecules/{molecule_id}", response_model=MoleculeDetail)
def get_molecule(molecule_id: str, session: Session = Depends(get_session)):
    m = session.get(Molecule, molecule_id)
    if m is None:
        raise HTTPException(status_code=404, detail="molecule not found")
    return MoleculeDetail(
        id=m.id, name=m.name, pdb_id=m.pdb_id, resolution_a=m.resolution_a,
        nomask_resolution_a=m.nomask_resolution_a, particle_count=m.particle_count,
        thumbnail_url=_thumbnail_url(m.thumbnail_path), scanned_at=m.scanned_at,
        files=[_file_out(f) for f in m.files],
    )


@app.get("/files/{file_id}")
def get_file(file_id: int, session: Session = Depends(get_session)):
    f = session.get(MoleculeFile, file_id)
    if f is None:
        raise HTTPException(status_code=404, detail="file not found")
    name = PurePosixPath(f.path).name
    disposition = "attachment" if f.kind == Kind.MAP else "inline"
    media_type = _MEDIA_TYPES.get(PurePosixPath(name).suffix.lower(), "application/octet-stream")
    headers = {"Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(name)}"}
    if config.serve_files():
        return FileResponse(config.data_root() / f.path, media_type=media_type, headers=headers)
    # Percent-encoded: nginx decodes it, and a raw "#" or "?" would cut the path short.
    headers["X-Accel-Redirect"] = "/internal/data/" + quote(f.path)
    return Response(media_type=media_type, headers=headers)


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
