# RNA AI CryoEM data portal

A web portal for browsing RNA cryo-EM molecules.

## Repository layout

| Path | What it is |
| --- | --- |
| `portal/backend` | Python package `rna_portal`: the FastAPI API and the catalog scanner, one image |
| `portal/frontend` | React + MUI single-page app (Vite, TanStack Router and Query, Mol*) |
| `infra/portal` | Terraform for the AWS deployment, plus the nginx image that serves the app. See its [README](infra/portal/README.md) |
| `infra/modules/edge_auth` | Terraform module: a Lambda@Edge viewer-request gate that requires a Cognito `id_token` cookie and group membership |
| `.github/workflows` | CI: `app.yml` (backend, frontend), `portal.yml` (nginx, Terraform), `edge-auth.yml` |

## How it works

```
CloudFront + edge_auth -> internal ALB -> ECS task: nginx -> api (FastAPI)
                                                          -> mrc-ng-server (maps for Neuroglancer)
                                        scanner task (EventBridge schedule) -> RDS Postgres
```

- **Scanner** (`rna_portal.scanner`): treats each top-level folder of the data root as one molecule. It catalogs the files it recognizes, reads PDB IDs and cryoSPARC resolutions, renders a thumbnail with OVITO. A root that can't be listed or is empty leaves the catalog unchanged.
- **API** (`rna_portal.api`): serves `/molecules`, `/molecules/{id}`, `/files/{id}`, and `/thumbnails/...`. nginx mounts it at `/api`. File downloads go out through nginx with `X-Accel-Redirect`, so only cataloged files can be fetched.
- **Auth**: users sign in with the shared RNA Atlas Cognito pool from [`rna_auth_aws_daslab`](https://github.com/JaneliaSciComp/rna_auth_aws_daslab). They need the `app:data-portal` group.

### Data layout

The data layout is still actively evolving and the rules for discovering folders and files are flexible to accomodate this. Every rule about the Drive layout lives in `portal/backend/src/rna_portal/classify.py`. Files are found by extension. Folder names below the molecule folder are only hints about where a file came from:

```
<data root>/
  Mol9_gRNAde/            # one molecule; the name drops the Mol<N>_ prefix
    PDB.../10ZT.pdb       # .pdb/.cif = model; a pdb* folder = deposited
    AlphaFold/...cif      # predicted
    CryoEM/...mrc         # .mrc/.map = map; cryoem = experimental
    .../micrographs/*.png # micrograph (other .png = plot)
    ...*.pdf, *.log       # report, cryoSPARC JSON log (resolution)
```

## Local development

Prerequisites: [pixi](https://pixi.sh) and Docker. `portal/pixi.toml` is the one workspace for the backend and the frontend. pixi installs Node for the frontend tasks.

The tests build their own small fixtures and need no data. Running the scanner does: it needs a local copy of some molecule folders from the team's Drive folder (see [Data layout](#data-layout)). The repo doesn't include any.

Settings go in `portal/.env`, which every backend task loads.

```bash
cd portal
cp .env.example .env   # then point CATALOG_DATA_ROOT at your copy of the Drive folders
```

Database setup:

```bash
pixi run db-up  # start the Postgres container in Docker
pixi run scan   # scan the dev data directory to populate the DB
```

To start the api service:

```bash
pixi run api            # http://127.0.0.1:8000
```

In a second terminal, start the frontend:

```bash
pixi run frontend        # http://localhost:5173; runs npm ci first when the lockfile changed
```

Note: Everything works in the frontend except Neuroglancer, which needs mrc-ng-server. Files (gallery images, Mol* models, downloads) work because `.env.example` sets `CATALOG_SERVE_FILES=1`, so the API sends them itself instead of handing them to nginx.

When you're done working, stop Postgres. `pixi run db-up` starts the same container again, catalog intact:

```bash
docker stop rna-portal-testdb
```

To delete it and its data instead (the next `pixi run db-up` starts empty; `pixi run scan` rebuilds the catalog):

```bash
docker rm -f rna-portal-testdb
```

### Running tests in local development

Run backend and frontend tests:

```bash
pixi run db-up  # if the postgres container isn't already running
pixi run test
pixi run test-frontend
```

Image and infrastructure checks, as CI runs them:

```bash
# Note: run these from the repo root
portal/backend/test-image.sh       # backend image: lockfile, OVITO headless render, /health
infra/portal/nginx/test.sh         # nginx image routes
(cd infra/modules/edge_auth/function && npm ci && npm test)   # needs Node 22 on PATH
```

## Configuration

The backend reads these environment variables (`rna_portal/config.py`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CATALOG_DB_URL` | required | SQLAlchemy URL, `postgresql+psycopg://...` |
| `CATALOG_DATA_ROOT` | `/data` | The data mount, read-only |
| `CATALOG_THUMBNAIL_DIR` | `/caches/thumbnails` | Where the scanner writes thumbnails |
| `CATALOG_RCLONE_SOCKET` | unset | rclone remote-control socket; the scanner refreshes listings through it |
| `CATALOG_SERVE_FILES` | unset | `1` for local development: the API sends file bodies itself, since there's no nginx to follow its `X-Accel-Redirect` |

## Deployment

See [`infra/portal/README.md`](infra/portal/README.md) for deploying a workspace, choosing a data source, inviting users, and operating the portal.
