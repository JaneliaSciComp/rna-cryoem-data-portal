#!/usr/bin/env bash
# Builds the portal nginx image and checks its routes: the pages it serves itself, the proxied
# routes (502 with no upstream running), the internal data location (unreachable from outside),
# and an X-Accel-Redirect download, using a stub API in nginx's network namespace. nginx
# starting at all is part of the check: it refuses to start if a proxy_pass host can't be
# resolved.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
dockerfile=infra/portal/nginx/Dockerfile

if docker build -q -f "$root/$dockerfile" "$root" >/dev/null 2>&1; then
  echo "FAIL: image built without COGNITO_CLIENT_ID" >&2
  exit 1
fi
docker build -q -f "$root/$dockerfile" --build-arg COGNITO_CLIENT_ID=testclient123 \
  -t rna-portal-nginx:test "$root" >/dev/null

# A data tree with a path that needs percent-encoding, mounted where the task mounts the Drive.
data=$(mktemp -d)
mkdir -p "$data/Mol9 x/Maps"
printf 'map bytes' > "$data/Mol9 x/Maps/a b#c.mrc"
chmod -R a+rX "$data"

id=$(docker run -d -p 18080:8080 -v "$data:/data:ro" rna-portal-nginx:test)
stub=""
trap 'docker rm -f "$id" $stub >/dev/null; rm -rf "$data"' EXIT
base=http://localhost:18080
code() { curl -s -o /dev/null -w '%{http_code}' "$base$1"; }

curl -fsS --retry 10 --retry-all-errors --retry-delay 1 "$base/login.html" \
  | grep -q 'window.COGNITO_CLIENT_ID = "testclient123"'
curl -fsS "$base/auth.js" | grep -q 'window.RNAnixAuth'
# auth.js nextUrl() falls back to "index.html"; the portal's home is "/". The redirect must be
# relative: an absolute one would carry nginx's own port (8080) through CloudFront.
curl -sI "$base/index.html" | tr -d '\r' | grep -qix 'location: /'

# The app, including deep links, which fall back to its index.html.
curl -fsS "$base/" | grep -q '<div id="root">'
curl -fsS "$base/molecules/Mol9_gRNAde" | grep -q '<div id="root">'
# Neuroglancer's static build.
curl -fsS "$base/neuroglancer/" | grep -qi '<html'

# No upstreams are running, so proxied routes return 502. That proves the routes exist.
test "$(code /api/molecules)" = 502
test "$(code /healthz)" = 502
test "$(code /mrc-ng-server/omezarr/Mol9/map.mrc/zarr.json)" = 502

# The data tree is reachable only through X-Accel-Redirect.
test "$(code '/internal/data/Mol9%20x/Maps/a%20b%23c.mrc')" = 404

# A stub API on 127.0.0.1:8000 (sharing nginx's network namespace) authorizes a file whose path
# needs percent-encoding, as the real API does. nginx must decode it and serve the file.
stub=$(docker run -d --network "container:$id" python:3.12-alpine python -c '
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("X-Accel-Redirect", "/internal/data/Mol9%20x/Maps/a%20b%23c.mrc")
        self.send_header("Content-Type", "application/octet-stream")
        self.end_headers()
http.server.HTTPServer(("127.0.0.1", 8000), H).serve_forever()
')
test "$(curl -fsS --retry 10 --retry-all-errors --retry-delay 1 "$base/api/files/1")" = "map bytes"
echo "nginx image OK"
