"""Render an atomic model (.pdb or .cif) to a PNG thumbnail with OVITO.

Adapted from ai-cryoet's catalog/imaging/_pdb_render.py (branch worktree-nucleosome-templates):
render_thumbnail runs THIS file in a subprocess, so OVITO's Qt stack never loads into the scanner
and a crash or hang can't take it down. gemmi reads both formats. Heavy atoms in one colour,
camera along the smallest principal axis.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

_TIMEOUT_S = 120
_COLOR = (0.85, 0.45, 0.10)
_RADIUS = 1.8


def heavy_atom_positions(path: Path) -> list[tuple[float, float, float]]:
    import gemmi

    structure = gemmi.read_structure(str(path))
    structure.remove_hydrogens()
    return [
        (atom.pos.x, atom.pos.y, atom.pos.z)
        for chain in structure[0]
        for residue in chain
        for atom in residue
    ]


def _subprocess_env() -> dict[str, str]:
    """Headless Qt, plus the Qt libraries OVITO's PySide6 wheel ships (as in ai-cryoet)."""
    env = {**os.environ, "QT_QPA_PLATFORM": "offscreen"}
    pyver = f"python{sys.version_info.major}.{sys.version_info.minor}"
    qt_lib = Path(sys.prefix) / f"lib/{pyver}/site-packages/PySide6/Qt/lib"
    if qt_lib.is_dir():
        env["LD_LIBRARY_PATH"] = ":".join(filter(None, [str(qt_lib), env.get("LD_LIBRARY_PATH")]))
    return env


def render_thumbnail(model: Path, out: Path, size: int = 512) -> None:
    """Render `model` to `out` (PNG) through a temp file and a rename. Raises RuntimeError."""
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp.png")  # OVITO picks the format from the extension
    payload = json.dumps({"model": str(model), "out": str(tmp), "size": size})
    try:
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), payload],
            capture_output=True,
            text=True,
            env=_subprocess_env(),
            timeout=_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"render timed out after {_TIMEOUT_S}s: {model}") from exc
    if result.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"render failed for {model}: {result.stderr[-2000:]}")
    tmp.replace(out)


def _render(args: dict) -> None:
    import numpy as np
    from ovito.data import DataCollection
    from ovito.pipeline import Pipeline, StaticSource
    from ovito.vis import TachyonRenderer, Viewport

    positions = heavy_atom_positions(Path(args["model"]))
    if not positions:
        raise SystemExit(f"no atoms in {args['model']}")
    pos = np.asarray(positions)
    data = DataCollection()
    particles = data.create_particles(count=len(pos))
    particles.create_property("Position", data=pos)
    particles.create_property("Color", data=np.tile(_COLOR, (len(pos), 1)))
    particles.vis.radius = _RADIUS
    pipeline = Pipeline(source=StaticSource(data=data))
    pipeline.add_to_scene()

    size = (args["size"], args["size"])
    _, eigenvectors = np.linalg.eigh(np.cov((pos - pos.mean(axis=0)).T))
    viewport = Viewport(type=Viewport.Type.Ortho, camera_dir=tuple(eigenvectors[:, 0]))
    viewport.zoom_all(size=size)
    viewport.render_image(
        size=size,
        filename=args["out"],
        background=(1, 1, 1),
        renderer=TachyonRenderer(ambient_occlusion=True, antialiasing_samples=8),
    )
    pipeline.remove_from_scene()


if __name__ == "__main__":
    _render(json.loads(sys.argv[1]))
