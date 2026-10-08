#!/usr/bin/env bash
# Builds the backend image and checks what the unit tests can't: the lockfile installs, the
# scanner task's flock wrapper exists, OVITO renders a thumbnail headless (its Qt needs system
# libraries the pixi base image lacks), and the API imports and answers /health.
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -q -f backend/Dockerfile -t rna-portal-api:test . >/dev/null

docker run --rm --entrypoint flock rna-portal-api:test --version >/dev/null

docker run --rm -i rna-portal-api:test pixi run python - <<'PY'
import math
from pathlib import Path
from rna_portal.render import render_thumbnail

lines = []
for i in range(40):  # a short helix of phosphorus atoms
    x, y, z = 10 * math.cos(i / 3), 10 * math.sin(i / 3), 1.5 * i
    lines.append(f"ATOM  {i + 1:5d} P      A A{i + 1:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00           P\n")
Path("/tmp/m.pdb").write_text("".join(lines) + "END\n")
render_thumbnail(Path("/tmp/m.pdb"), Path("/tmp/out/m.png"))
data = Path("/tmp/out/m.png").read_bytes()
assert data.startswith(b"\x89PNG") and len(data) > 1000, len(data)
PY

docker run --rm rna-portal-api:test pixi run python -c '
from fastapi.testclient import TestClient
from rna_portal.api import app
assert TestClient(app).get("/health").json() == {"ok": True}
'
echo "backend image OK"
