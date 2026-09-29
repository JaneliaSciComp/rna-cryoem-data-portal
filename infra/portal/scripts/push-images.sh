#!/usr/bin/env bash
# Usage: push-images.sh <workspace> <tag> <cognito-client-id>
#
# Copies ghcr.io/ai-cryoet/ai-cryoet-{api,frontend,scanner}:<tag> into this workspace's ECR
# repos, and builds and pushes the portal nginx image under the same tag. Needs AWS credentials
# and `docker login ghcr.io` (the ai-cryoet images are private).
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: $0 <workspace> <tag> <cognito-client-id>" >&2; exit 2; }
ws=$1 tag=$2 client_id=$3
region=${AWS_REGION:-us-east-2}
registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$region.amazonaws.com
repo=$registry/rna-portal-$ws

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"

for name in api frontend scanner; do
  src=ghcr.io/ai-cryoet/ai-cryoet-$name:$tag
  docker pull --platform linux/amd64 "$src"
  docker tag "$src" "$repo/$name:$tag"
  docker push "$repo/$name:$tag"
done

# The scanner task wraps the image's command in flock (compute.tf); fail here, not at 3 a.m.
docker run --rm --platform linux/amd64 --entrypoint flock "$repo/scanner:$tag" --version

docker build --platform linux/amd64 --build-arg COGNITO_CLIENT_ID="$client_id" \
  -t "$repo/nginx:$tag" "$(dirname "$0")/../nginx"
docker push "$repo/nginx:$tag"
