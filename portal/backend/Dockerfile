# Portal backend: the API (default command) and the scanner (`pixi run scan`), one image.
# Build context: portal/backend/.
FROM ghcr.io/prefix-dev/pixi:0.73.0-bookworm-slim AS deps
WORKDIR /app
COPY pyproject.toml pixi.lock ./
COPY src ./src
RUN pixi install --locked

FROM ghcr.io/prefix-dev/pixi:0.73.0-bookworm-slim
WORKDIR /app
# OVITO's PySide6/Qt6 dlopens these even offscreen; the pixi slim base lacks them. Same list as
# ai-cryoet's deploy/Dockerfile.scanner. flock (the scanner task's lock) is in util-linux, which
# the base image already has.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 libgl1 libopengl0 libegl1 libdbus-1-3 libxkbcommon0 \
      libfontconfig1 libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app /app
COPY alembic.ini ./
ENV HOME=/app
CMD ["pixi", "run", "api"]
