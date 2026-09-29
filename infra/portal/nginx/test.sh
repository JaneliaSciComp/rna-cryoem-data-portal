#!/usr/bin/env bash
# Builds the portal nginx image and checks the routes that work without the api and frontend
# upstreams. nginx starting at all is part of the check: it refuses to start if a proxy_pass
# host can't be resolved.
set -euo pipefail
cd "$(dirname "$0")"

if docker build -q . >/dev/null 2>&1; then
  echo "FAIL: image built without COGNITO_CLIENT_ID" >&2
  exit 1
fi

docker build -q --build-arg COGNITO_CLIENT_ID=testclient123 -t rna-portal-nginx:test . >/dev/null
id=$(docker run -d -p 18080:8080 rna-portal-nginx:test)
trap 'docker rm -f "$id" >/dev/null' EXIT
base=http://localhost:18080

curl -fsS --retry 10 --retry-all-errors --retry-delay 1 "$base/login.html" \
  | grep -q 'window.COGNITO_CLIENT_ID = "testclient123"'
curl -fsS "$base/auth.js" | grep -q 'window.RNAnixAuth'
# auth.js nextUrl() falls back to "index.html"; the portal's home is "/". The redirect must be
# relative: an absolute one would carry nginx's own port (8080) through CloudFront.
curl -sI "$base/index.html" | tr -d '\r' | grep -qix 'location: /'
# Upstreams aren't running, so proxied routes return 502. That proves the route exists.
test "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/samples")" = 502
test "$(curl -s -o /dev/null -w '%{http_code}' "$base/")" = 502
echo "nginx image OK"
