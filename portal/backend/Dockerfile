# Portal backend: the API (default command) and the scanner (`pixi run scan`), one image.
# Build context: portal/ (the pixi workspace).
FROM ghcr.io/prefix-dev/pixi:0.73.0-bookworm-slim AS deps
WORKDIR /app
COPY pixi.toml pixi.lock dotenv.sh ./
COPY backend/pyproject.toml ./backend/
COPY backend/src ./backend/src
RUN pixi install --locked -e default

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
COPY backend/alembic.ini ./backend/
ENV HOME=/app
CMD ["pixi", "run", "api"]
