"""Molecule search, backed by Typesense and spoken to over its REST API with httpx.

The index is derived from the catalog and holds one document per molecule. The scanner rebuilds
it after every scan: it builds a new collection, points the `molecules` alias at it, and drops
the old one. A failed rebuild leaves the previous index searchable, and a schema change needs no
migration, but a search that names a field the live index lacks fails until the next rebuild, so a
release that adds one answers 503 on the molecule list between deploying the API and running the
scanner (infra/portal/README.md, step 7). `python -m rna_portal.search` rebuilds it without scanning.
"""
import json
import logging
import sys
import time
from collections import defaultdict
from functools import cache

import httpx
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, selectinload

from rna_portal import config, db
from rna_portal.models import Molecule, SheetCollection

log = logging.getLogger("rna_portal.search")

ALIAS = "molecules"

FIELDS = [
    {"name": "name", "type": "string", "infix": True, "sort": True},  # sorts ignoring case
    {"name": "molecule_id", "type": "string", "infix": True},
    {"name": "pdb_id", "type": "string", "optional": True, "sort": True},
    {"name": "resolution_a", "type": "float", "optional": True},
    {"name": "nomask_resolution_a", "type": "float", "optional": True},
    {"name": "particle_count", "type": "int32", "optional": True},
    {"name": "movies", "type": "int32", "optional": True},
    {"name": "microscope", "type": "string", "optional": True, "sort": True, "facet": True},
    {"name": "scanned_at", "type": "int64"},  # Unix seconds
    {"name": "thumbnail_path", "type": "string", "optional": True, "index": False},
    {"name": "kinds", "type": "string[]", "facet": True},
]

# Sort keys the API accepts, by the document field they sort on.
SORT_FIELDS = {
    "name": "name", "pdb_id": "pdb_id", "resolution_a": "resolution_a",
    "nomask_resolution_a": "nomask_resolution_a", "particle_count": "particle_count",
    "movies": "movies", "microscope": "microscope", "scanned_at": "scanned_at",
}
_OPTIONAL = {f["name"] for f in FIELDS if f.get("optional")}


class SearchUnavailable(RuntimeError):
    pass


@cache
def client() -> httpx.Client:
    url = config.typesense_url()
    if url is None:
        raise SearchUnavailable("CATALOG_TYPESENSE_URL is not set")
    return httpx.Client(
        base_url=url, headers={"X-TYPESENSE-API-KEY": config.typesense_api_key()}, timeout=10
    )


def document(m: Molecule, sheet_rows: list[dict[str, str]]) -> dict:
    """`sheet_rows`: the data collection sheet's rows for the molecule. Only a single row counts:
    a duplicate is the sheet's mistake (the scan logs it), and picking one would hide it."""
    row = sheet_rows[0] if len(sheet_rows) == 1 else {}
    doc = {
        "id": m.id, "molecule_id": m.id, "name": m.name,
        "pdb_id": m.pdb_id, "resolution_a": m.resolution_a,
        "nomask_resolution_a": m.nomask_resolution_a, "particle_count": m.particle_count,
        "movies": _int(row.get("Movies")), "microscope": row.get("Microscope"),
        "scanned_at": int(m.scanned_at.timestamp()),
        "thumbnail_path": m.thumbnail_path,
        "kinds": sorted({f.kind for f in m.files}),
    }
    # Typesense rejects null in an optional field: leave the key out instead.
    return {k: v for k, v in doc.items() if v is not None}


def _int(v: str | None) -> int | None:
    """A sheet count such as "12,345"; None when blank or not a number."""
    try:
        return int(v.replace(",", ""))
    except (AttributeError, ValueError):
        return None


def reindex(engine: Engine) -> int:
    """Build a fresh index of every molecule and switch the alias to it. Returns the count."""
    with Session(engine) as session:
        rows = defaultdict(list)
        for name, fields in session.execute(select(SheetCollection.name, SheetCollection.fields)):
            rows[name].append(fields)
        molecules = session.scalars(select(Molecule).options(selectinload(Molecule.files)))
        docs = [document(m, rows[m.id]) for m in molecules]
    c = client()
    name = f"{ALIAS}_{time.time_ns()}"
    c.post("/collections", json={"name": name, "fields": FIELDS}).raise_for_status()
    try:
        if docs:
            r = c.post(
                f"/collections/{name}/documents/import", params={"action": "create"},
                content="\n".join(json.dumps(d) for d in docs),
            )
            r.raise_for_status()
            # 200 even when documents fail: each line reports one document.
            errors = [line for line in r.text.splitlines() if not json.loads(line)["success"]]
            if errors:
                raise SearchUnavailable(f"{len(errors)} documents failed to index: {errors[0]}")
        c.put(f"/aliases/{ALIAS}", json={"collection_name": name}).raise_for_status()
    except Exception:
        c.delete(f"/collections/{name}")
        raise
    # Every older collection, including ones a crashed rebuild left behind.
    for coll in c.get("/collections").raise_for_status().json():
        if coll["name"].startswith(f"{ALIAS}_") and coll["name"] != name:
            c.delete(f"/collections/{coll['name']}")
    return len(docs)


def search(
    *, q: str | None, kinds: list[str], max_resolution: float | None,
    max_nomask_resolution: float | None, min_particles: int | None,
    min_movies: int | None, microscopes: list[str],
    sort: str | None, order: str, page: int, per_page: int,
) -> dict:
    """One page of matching molecules. Returns Typesense's response: found, hits, facet_counts.

    Every listed kind must be present (AND), so the facet counts, which Typesense computes
    over the filtered results, stay the number of results a click would leave. A molecule has
    one microscope, so the listed microscopes are alternatives (OR); their counts come from a
    second search without them, or picking one would hide the others.
    Kinds reach filter_by unquoted: the caller passes only Kind enum values. Microscopes are
    backquoted; one holding a backquote, which would end the value, raises ValueError.
    """
    if any("`" in m for m in microscopes):
        raise ValueError("a microscope may not contain a backquote")
    filters = [f"kinds:={k}" for k in kinds]
    if max_resolution is not None:
        filters.append(f"resolution_a:<={max_resolution}")
    if max_nomask_resolution is not None:
        filters.append(f"nomask_resolution_a:<={max_nomask_resolution}")
    if min_particles is not None:
        filters.append(f"particle_count:>={min_particles}")
    if min_movies is not None:
        filters.append(f"movies:>={min_movies}")
    microscope_filter = [f"microscope:=[{','.join(f'`{m}`' for m in microscopes)}]"] if microscopes else []
    if sort is not None:
        field = SORT_FIELDS[sort]
        missing = "(missing_values: last)" if field in _OPTIONAL else ""
        sort_by = f"{field}{missing}:{order},name:asc"
    else:
        sort_by = "_text_match:desc,name:asc" if q else "name:asc"
    params = {
        "q": q or "*", "query_by": "name,molecule_id,pdb_id", "infix": "always,always,off",
        "filter_by": " && ".join(filters + microscope_filter), "sort_by": sort_by,
        "facet_by": "kinds" if microscopes else "kinds,microscope", "max_facet_values": 100,
        "page": page, "per_page": per_page,
    }
    try:
        r = _get(params)
        if microscopes:
            counts = _get({
                **params, "filter_by": " && ".join(filters), "facet_by": "microscope", "page": 1, "per_page": 0,
            })
            r["facet_counts"] += counts["facet_counts"]
    except httpx.HTTPError as exc:
        raise SearchUnavailable(str(exc)) from exc
    return r


def _get(params: dict) -> dict:
    r = client().get(f"/collections/{ALIAS}/documents/search", params=params)
    r.raise_for_status()
    return r.json()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log.info("indexed %d molecules", reindex(db.engine()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
