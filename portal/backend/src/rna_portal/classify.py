"""Which files the portal catalogs, and as what.

Every rule about the Drive layout lives here. The team's convention isn't settled, so the rules
find files by extension and use folder names only as hints: a file in a folder they don't know
is still cataloged, as Source.OTHER. When the convention settles, change only this module.
"""
from pathlib import PurePosixPath

from rna_portal.models import Kind, Source

_KIND_BY_EXTENSION = {
    ".pdb": Kind.MODEL,
    ".cif": Kind.MODEL,
    ".mrc": Kind.MAP,
    ".map": Kind.MAP,
    ".pdf": Kind.REPORT,
    ".log": Kind.LOG,
}


def classify(path: str) -> tuple[Kind, Source] | None:
    """(kind, source) for `path`, relative to the data root, or None if it isn't cataloged."""
    p = PurePosixPath(path)
    if len(p.parts) < 2 or p.name.startswith("."):
        return None  # in the data root itself, or a hidden file such as macOS's ._*
    # The first folder is the molecule; only the folders below it hint at a source.
    subfolders = [f.lower() for f in p.parts[1:-1]]

    extension = p.suffix.lower()
    if extension == ".png":
        kind = Kind.MICROGRAPH if "micrographs" in subfolders else Kind.PLOT
    elif extension in _KIND_BY_EXTENSION:
        kind = _KIND_BY_EXTENSION[extension]
    else:
        return None

    if any(f.startswith("pdb") for f in subfolders):
        source = Source.DEPOSITED
    elif "alphafold" in subfolders:
        source = Source.PREDICTED
    elif "cryoem" in subfolders:
        source = Source.EXPERIMENTAL
    else:
        source = Source.OTHER
    return kind, source
