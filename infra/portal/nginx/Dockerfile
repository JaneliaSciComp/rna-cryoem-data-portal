# Portal edge proxy: the stock unprivileged nginx (as in ai-cryoet's k8s deploy) plus the AWS
# config, the login page, the portal's single-page app, and Neuroglancer.
# Build context: the repo root (docker build -f infra/portal/nginx/Dockerfile .).

FROM node:22-bookworm-slim AS app
WORKDIR /src
COPY portal/frontend/package.json portal/frontend/package-lock.json ./
RUN npm ci
COPY portal/frontend/ ./
RUN npm run build

# Neuroglancer's npm package is a library; the app is built from the tagged source.
FROM node:22-bookworm-slim AS neuroglancer
ARG NEUROGLANCER_VERSION=v2.41.2
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$NEUROGLANCER_VERSION" https://github.com/google/neuroglancer.git /ng
WORKDIR /ng
RUN npm ci && npm run build -- --output /ng-out

FROM nginxinc/nginx-unprivileged:1.27-alpine

# The data_portal app client id (rna_auth_aws_daslab terraform/auth output data_portal_client_id). Required.
ARG COGNITO_CLIENT_ID

COPY infra/portal/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/portal/nginx/login.html infra/portal/nginx/auth.js /usr/share/nginx/html/
COPY --from=app /src/dist /usr/share/nginx/app
COPY --from=neuroglancer /ng-out /usr/share/nginx/neuroglancer

USER root
RUN echo "$COGNITO_CLIENT_ID" | grep -Eq '^[a-z0-9]+$' \
    && sed -i "s/__COGNITO_CLIENT_ID__/$COGNITO_CLIENT_ID/" /usr/share/nginx/html/login.html \
    && chmod 644 /usr/share/nginx/html/login.html /usr/share/nginx/html/auth.js
USER 101
