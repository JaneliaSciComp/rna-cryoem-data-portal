#!/usr/bin/env bash
# Usage: push-images.sh <workspace> <tag> <cognito-client-id>
#
# Builds the portal backend (api and scanner) and nginx images from this repo, mirrors
# mrc-ng-server, and pushes all three to this workspace's ECR repos under <tag>.
# Needs AWS credentials and Docker.
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: $0 <workspace> <tag> <cognito-client-id>" >&2; exit 2; }
ws=$1 tag=$2 client_id=$3
region=${AWS_REGION:-us-east-2}
mrcng=ghcr.io/janeliascicomp/mrc-ng-server:0.1.8
repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$region.amazonaws.com
repo=$registry/rna-portal-$ws

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"

docker build --platform linux/amd64 -t "$repo/api:$tag" "$repo_root/portal/backend"
# The scanner task wraps the image's command in flock (compute.tf); fail here, not at 3 a.m.
docker run --rm --platform linux/amd64 --entrypoint flock "$repo/api:$tag" --version
docker push "$repo/api:$tag"

docker build --platform linux/amd64 --build-arg COGNITO_CLIENT_ID="$client_id" \
  -f "$repo_root/infra/portal/nginx/Dockerfile" -t "$repo/nginx:$tag" "$repo_root"
docker push "$repo/nginx:$tag"

docker pull --platform linux/amd64 "$mrcng"
docker tag "$mrcng" "$repo/mrc-ng-server:$tag"
docker push "$repo/mrc-ng-server:$tag"
