"""Facts the table shows, read from folder names and files (the Drive has no metadata files)."""
import json
import re
from pathlib import Path

# Bump when a change here would give existing molecules different facts: the next scan then
# re-reads every molecule stamped with an older version, even if its files haven't changed.
PARSER_VERSION = 2

_MOL_PREFIX = re.compile(r"^mol\d+_", re.IGNORECASE)
_PDB_ID = re.compile(r"[0-9][A-Za-z0-9]{3}")
# In a file name, also require a letter, so dates and counters (fold_2026_01_24) don't match.
_PDB_ID_IN_NAME = re.compile(r"(?<![A-Za-z0-9])([0-9](?=[A-Za-z0-9]{0,2}[A-Za-z])[A-Za-z0-9]{3})(?![A-Za-z0-9])")


def molecule_name(folder: str) -> str:
    """The folder name without its Mol<N>_ prefix: Mol9_gRNAde -> gRNAde."""
    return _MOL_PREFIX.sub("", folder) or folder


def pdb_id(path: Path) -> str | None:
    """A deposited model's PDB ID, upper case: the PDB HEADER record (columns 63-66) or the mmCIF
    _entry.id, else a four-character ID in the file name (10ZT.pdb). None if there's none."""
    suffix = path.suffix.lower()
    with path.open(errors="replace") as fh:
        if suffix == ".pdb":
            first = fh.readline()
            if first.startswith("HEADER") and _PDB_ID.fullmatch(first[62:66].strip()):
                return first[62:66].strip().upper()
        elif suffix == ".cif":
            for line in fh:
                if line.startswith("_entry.id"):
                    value = line.split(None, 1)[1].strip().strip("'\"") if " " in line else ""
                    if _PDB_ID.fullmatch(value):
                        return value.upper()
                    break
    m = _PDB_ID_IN_NAME.search(path.stem)
    return m.group(1).upper() if m else None


def resolution_a(log_path: Path) -> float | None:
    """Masked GSFSC resolution in Å from a cryoSPARC job's exported JSON log: the best
    `latest_summary_stats.fsc_info_best` value across its volume output groups. cryoSPARC v4
    calls it `radwn_tightmask_A`; v5 calls it `radwn_final_A` (v4's `radwn_final_A` is another
    curve)."""
    doc = _load(log_path)
    key = "radwn_tightmask_A" if str(doc.get("version", "")).startswith("v4") else "radwn_final_A"
    return _best_fsc(doc, key)


def nomask_resolution_a(log_path: Path) -> float | None:
    """No-mask GSFSC resolution in Å from a cryoSPARC job's exported JSON log: the best
    `latest_summary_stats.fsc_info_best.radwn_nomask_A` across its volume output groups."""
    return _best_fsc(_load(log_path), "radwn_nomask_A")


def _load(log_path: Path) -> dict:
    """The log's JSON, or {} if it can't be read."""
    try:
        doc = json.loads(log_path.read_text(errors="replace"))
    except (OSError, ValueError):
        return {}
    return doc if isinstance(doc, dict) else {}


def _groups(doc: dict, group_type: str) -> list[dict]:
    groups = doc.get("output_result_groups") or []
    return [g for g in groups if isinstance(g, dict) and g.get("type") == group_type]


def _best_fsc(doc: dict, key: str) -> float | None:
    values = []
    for group in _groups(doc, "volume"):
        stats = group.get("latest_summary_stats") or {}
        value = (stats.get("fsc_info_best") or {}).get(key)
        if isinstance(value, (int, float)):
            values.append(float(value))
    return min(values) if values else None
