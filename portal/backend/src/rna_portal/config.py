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
