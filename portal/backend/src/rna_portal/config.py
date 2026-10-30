"""Settings from the environment. The names match what infra/portal's task definitions set."""
import os
from pathlib import Path


def db_url() -> str:
    """SQLAlchemy URL, postgresql+psycopg://... (a Secrets Manager secret in ECS)."""
    return os.environ["CATALOG_DB_URL"]


def data_root() -> Path:
    """The Drive mount, read-only."""
    return Path(os.environ.get("CATALOG_DATA_ROOT", "/data"))


def thumbnail_dir() -> Path:
    """Where the scanner writes molecule thumbnails and the API reads them."""
    return Path(os.environ.get("CATALOG_THUMBNAIL_DIR", "/caches/thumbnails"))


def serve_files() -> bool:
    """Local development only: the API sends file bodies itself, because there's no nginx to
    follow its X-Accel-Redirect."""
    return os.environ.get("CATALOG_SERVE_FILES") == "1"


def rclone_socket() -> Path | None:
    """The data mount's rclone remote-control socket. Unset where the data root isn't an rclone
    mount (tests, local runs): nothing to refresh."""
    path = os.environ.get("CATALOG_RCLONE_SOCKET")
    return Path(path) if path else None


def typesense_url() -> str | None:
    """The search server, http://host:8108. Unset: the API's molecule list answers 503 and the
    scanner doesn't index."""
    return os.environ.get("CATALOG_TYPESENSE_URL") or None


def typesense_api_key() -> str:
    """Required once CATALOG_TYPESENSE_URL is set."""
    return os.environ["CATALOG_TYPESENSE_API_KEY"]


def sheet_id() -> str | None:
    """The team's data collection sheet. Unset: the scanner doesn't read it."""
    return os.environ.get("CATALOG_SHEET_ID") or None


def sheet_gid() -> str:
    """The sheet's tab to read (the gid in its URL)."""
    return os.environ.get("CATALOG_SHEET_GID", "0")


def sheet_key() -> str:
    """The service account's JSON key, which the sheet is shared with. Required once
    CATALOG_SHEET_ID is set."""
    return os.environ["CATALOG_SHEET_KEY"]
