"""The team's data collection sheet (one tab of a Google Sheet): one row
per grid collected, with the microscope settings. A row belongs to the molecule whose folder name
is its Grid Name; rows for grids that aren't on the portal are kept but match nothing.
"""
import csv
import io
import json

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from rna_portal.models import Molecule, SheetCollection

# The scope the Drive mount's rclone already uses; the export URL needs no Sheets API.
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
# The column that names the molecule folder. Its row is the header: rows above it are a title.
NAME_COLUMN = "Grid Name"


def fetch_csv(sheet_id: str, gid: str, key_json: str) -> str:
    """One tab of the sheet as CSV, read as the service account the sheet is shared with."""
    creds = service_account.Credentials.from_service_account_info(json.loads(key_json), scopes=SCOPES)
    resp = AuthorizedSession(creds).get(
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/export",
        params={"format": "csv", "gid": gid},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content.decode("utf-8")


def collections(text: str) -> dict[str, list[dict[str, str]]]:
    """{grid name: [{column: value, ...}, ...]}, one dict per row in sheet order, blank cells
    left out. Raises ValueError if there's no header row, so a changed layout can't look like an
    empty sheet."""
    rows = list(csv.reader(io.StringIO(text)))
    at = next((i for i, row in enumerate(rows) if NAME_COLUMN in (c.strip() for c in row)), None)
    if at is None:
        raise ValueError(f"no {NAME_COLUMN!r} header row")
    header = [c.strip() for c in rows[at]]
    if dup := {h for h in header if h and header.count(h) > 1}:
        # zip(header, row) would keep only the last column of each.
        raise ValueError(f"duplicate header columns: {sorted(dup)}")
    out: dict[str, list[dict[str, str]]] = {}
    for row in rows[at + 1:]:
        fields = {h: v.strip() for h, v in zip(header, row) if h and v.strip()}
        if name := fields.pop(NAME_COLUMN, None):
            out.setdefault(name, []).append(fields)
    return out


def sync(engine: Engine, collections: dict[str, list[dict[str, str]]]) -> list[str]:
    """Replace the catalog's copy of the sheet with `collections` (see above). Returns the
    molecule folders no row names."""
    with Session(engine) as session, session.begin():
        session.execute(delete(SheetCollection))
        session.add_all(SheetCollection(name=n, fields=f) for n, rows in collections.items() for f in rows)
        folders = session.scalars(select(Molecule.id).order_by(Molecule.id)).all()
    return [f for f in folders if f not in collections]
