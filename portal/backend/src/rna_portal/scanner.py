"""Sync the catalog with the data root: one molecule per top-level folder.

Each molecule is synced in its own transaction, so one bad folder can't fail the others. A root
that can't be listed, or lists no folders, stops the scan before anything is deleted: a Drive
outage must never look like every molecule being removed.
"""
import logging
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from rna_portal import config, db, parsers
from rna_portal.classify import classify
from rna_portal.models import Kind, Molecule, MoleculeFile, Source
from rna_portal.render import render_thumbnail

log = logging.getLogger("rna_portal.scanner")

Renderer = Callable[[Path, Path], None]
# (kind, source, size, mtime) for each cataloged file, by path relative to the root.
Found = dict[str, tuple[Kind, Source, int, datetime]]


class RootUnavailable(RuntimeError):
    pass


@dataclass
class ScanResult:
    added: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


def scan(engine: Engine, root: Path, thumbnails: Path, render: Renderer = render_thumbnail) -> ScanResult:
    try:
        folders = sorted(e.name for e in root.iterdir() if e.is_dir() and not e.name.startswith("."))
    except OSError as exc:
        raise RootUnavailable(f"can't list {root}: {exc}") from exc
    if not folders:
        raise RootUnavailable(f"{root} has no molecule folders")

    result = ScanResult()
    for folder in folders:
        try:
            with Session(engine) as session, session.begin():
                status = _sync_molecule(session, root, thumbnails, folder, render)
            getattr(result, status).append(folder)
        except Exception:
            log.exception("scan failed for %s", folder)
            result.failed.append(folder)

    with Session(engine) as session, session.begin():
        gone = session.scalars(
            select(Molecule.id).where(Molecule.id.not_in(folders)).order_by(Molecule.id)
        ).all()
        # Their files go too: ON DELETE CASCADE.
        session.execute(delete(Molecule).where(Molecule.id.in_(gone)))
    result.deleted = list(gone)
    return result


def _walk(root: Path, folder: str) -> Found:
    found: Found = {}
    for path in sorted((root / folder).rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        classified = classify(rel)
        if classified is None:
            continue
        st = path.stat()
        found[rel] = (*classified, st.st_size, datetime.fromtimestamp(st.st_mtime, timezone.utc))
    return found


def _sync_molecule(session: Session, root: Path, thumbnails: Path, folder: str, render: Renderer) -> str:
    """Sync one molecule's rows with its folder. Returns "added", "updated", or "unchanged"."""
    found = _walk(root, folder)
    molecule = session.get(Molecule, folder)
    changed = molecule is None
    if molecule is None:
        molecule = Molecule(id=folder, name=parsers.molecule_name(folder))
        session.add(molecule)
    status = "added" if changed else "updated"

    existing = {f.path: f for f in molecule.files}
    for path, row in existing.items():
        if path not in found:
            molecule.files.remove(row)  # delete-orphan
            changed = True
    for path, (kind, source, size, mtime) in found.items():
        row = existing.get(path)
        if row is None:
            molecule.files.append(MoleculeFile(path=path, kind=kind, source=source, size=size, mtime=mtime))
            changed = True
        elif (row.kind, row.source, row.size, row.mtime) != (kind, source, size, mtime):
            row.kind, row.source, row.size, row.mtime = kind, source, size, mtime
            changed = True

    if changed:
        molecule.name = parsers.molecule_name(folder)
        deposited = [root / p for p, (k, s, *_) in found.items() if k == Kind.MODEL and s == Source.DEPOSITED]
        molecule.pdb_id = next((i for i in map(parsers.pdb_id, deposited) if i), None)
        resolutions = [
            r for r in (parsers.resolution_a(root / p) for p, (k, *_) in found.items() if k == Kind.LOG)
            if r is not None
        ]
        molecule.resolution_a = min(resolutions) if resolutions else None
        molecule.scanned_at = datetime.now(timezone.utc)

    thumbnail_missing = molecule.thumbnail_path is None or not (thumbnails / molecule.thumbnail_path).is_file()
    if changed or thumbnail_missing:
        molecule.thumbnail_path = _thumbnail(root, thumbnails, folder, found, render)
    return status if changed else "unchanged"


def _thumbnail(root: Path, thumbnails: Path, folder: str, found: Found, render: Renderer) -> str | None:
    """Render the molecule's thumbnail from its first model: deposited, then predicted, then
    other. None if it has no model or the render fails; a failed render doesn't fail the scan."""
    order = {Source.DEPOSITED: 0, Source.PREDICTED: 1, Source.EXPERIMENTAL: 2, Source.OTHER: 3}
    models = sorted((order[s], p) for p, (k, s, *_) in found.items() if k == Kind.MODEL)
    if not models:
        return None
    source = models[0][1]
    name = f"{folder}.png"
    try:
        render(root / source, thumbnails / name)
    except Exception:
        log.exception("thumbnail failed for %s (%s)", folder, source)
        return None
    return name


# What the molecule page loads. Maps are left out: they're big, and rclone's cache is capped.
WARM_KINDS = (Kind.MODEL, Kind.PLOT, Kind.MICROGRAPH)


def warm(engine: Engine, root: Path) -> list[str]:
    """Read every file the molecule page loads, so rclone's disk cache holds it before the first
    visitor asks: a cold read from Drive takes seconds. Returns the paths read. A file that can't
    be read is logged and skipped; warming never fails the scan."""
    with Session(engine) as session:
        paths = session.scalars(
            select(MoleculeFile.path).where(MoleculeFile.kind.in_(WARM_KINDS)).order_by(MoleculeFile.path)
        ).all()
    read = []
    for path in paths:
        try:
            with open(root / path, "rb") as f:
                while f.read(1 << 20):
                    pass
        except OSError:
            log.warning("couldn't warm %s", path, exc_info=True)
            continue
        read.append(path)
    return read


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    db.migrate()
    try:
        r = scan(db.engine(), config.data_root(), config.thumbnail_dir())
    except RootUnavailable as exc:
        log.error("%s; catalog left unchanged", exc)
        return 1
    log.info(
        "scan complete: added=%d updated=%d unchanged=%d deleted=%d failed=%d",
        len(r.added), len(r.updated), len(r.unchanged), len(r.deleted), len(r.failed),
    )
    log.info("warmed %d files", len(warm(db.engine(), config.data_root())))
    if r.failed:
        log.error("failed molecules: %s", ", ".join(r.failed))
    return 1 if r.failed else 0


if __name__ == "__main__":
    sys.exit(main())
