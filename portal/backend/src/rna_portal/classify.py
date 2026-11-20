"""Which files the portal catalogs, and as what.

Every rule about the Drive layout lives here. The team's convention isn't settled, so the rules
find files by extension and use folder names only as hints: a file in a folder they don't know
is still cataloged, as Source.OTHER. When the convention settles, change only this module.
"""
import re
from pathlib import PurePosixPath

from rna_portal.models import Kind, Source

_KIND_BY_EXTENSION = {
    ".pdb": Kind.MODEL,
    ".cif": Kind.MODEL,
    ".mrc": Kind.MAP,
    ".map": Kind.MAP,
    ".pdf": Kind.REPORT,
    ".log": Kind.LOG,
    ".fasta": Kind.SEQUENCE,
    ".fa": Kind.SEQUENCE,
}

# cryoSPARC processing plots carry an iteration number: `iteration_NNN` anywhere (v5), or a bare
# `_NNN` at the end (v4, J300_per_particle_scale_factors_009.png). A bare `_NNN` anywhere would
# also match raw micrograph names (..._b1g4_100_002_jan05_...). `input_mask` plots have no number.
_PLOT_NAME = re.compile(r"iteration_\d+|_\d{3}\.png$|input_mask")


def classify(path: str) -> tuple[Kind, Source] | None:
    """(kind, source) for `path`, relative to the data root, or None if it isn't cataloged."""
    p = PurePosixPath(path)
    if len(p.parts) < 2 or p.name.startswith("."):
        return None  # in the data root itself, or a hidden file such as macOS's ._*
    # The first folder is the molecule; only the folders below it hint at a source.
    subfolders = [f.lower() for f in p.parts[1:-1]]

    extension = p.suffix.lower()
    if extension == ".png":
        if subfolders[-1:] == ["cryoem"]:
            # Pooled layout: micrographs and plots share CryoEM/, so only the name tells them apart.
            kind = Kind.PLOT if _PLOT_NAME.search(p.name.lower()) else Kind.MICROGRAPH
        else:
            kind = Kind.MICROGRAPH if "micrographs" in subfolders else Kind.PLOT
    elif extension == ".json" and p.name.lower().startswith("cryosparc_"):
        kind = Kind.LOG  # newer exports: cryosparc_P58_J291.json, not cryosparc_P93_J300_json.log
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
