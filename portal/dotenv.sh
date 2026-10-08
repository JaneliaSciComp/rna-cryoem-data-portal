# Sourced by pixi on activation: exports portal/.env if there is one. There isn't in the image,
# where ECS sets the variables.
if [ -f "$PIXI_PROJECT_ROOT/.env" ]; then
  set -a
  . "$PIXI_PROJECT_ROOT/.env"
  set +a
fi
