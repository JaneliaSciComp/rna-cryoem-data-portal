# RNA AI CryoEM Data Portal on AWS — Design

Date: 2026-09-24
Status: proposed

## Goal

Deploy a data portal for the RNA AI CryoEM project on AWS, starting with a
proof of concept (POC) against a small Google Drive folder, without adopting an
architecture that must be replaced when the full multi-terabyte dataset
arrives. Reuse the existing `ai-cryoet` containers (nginx, FastAPI API,
TanStack Start frontend, scanner, mrc-ng-server) with minimal edits. Gate the
portal with the shared Cognito user pool that already backs RNAnix
(`rna_atlas_inference/terraform/auth`), enforced at the CloudFront edge.

## Scope

This spec covers two deliverables, both owned by this repo's author:

1. **Deploy the data portal on AWS.** Terraform under `infra/`, including a
   reusable `edge_auth` module that enforces Cognito sign-in and group
   membership at CloudFront.
2. **PRs to `rna_atlas_inference` and `rnanix_server_frontend`** extending the
   existing Cognito setup so the portal can use it: a portal app client, site
   groups, and deletion protection in the pool; an ID-token cookie and
   `?next=` support in the shared `auth.js`; and, before real portal users are
   invited, per-site invite emails.

The `edge_auth` module is written so the `rna-atlas.org` site can adopt it
later in place of its passcode gate. That adoption is **not** in scope here. It
is described in the "Handoff: rna-atlas.org" section for the site owner and
requires no changes to anything built under this spec.

## Non-goals

- Rewriting the frontend as a static SPA or replacing the API with static JSON.
- Migrating raw data out of Google Drive. Drive remains the canonical store.
- Neuroglancer in the POC. mrc-ng-server is designed in but deployed later.
- Anything beyond group-based site access (no fine-grained permissions).
- A new Cognito user pool or a Hosted UI. The pool exists; the login page exists.
- Modifying `rna_atlas_website` or its CloudFront distribution.
- Schema and frontend field revisions for the RNA project. Separate spec.

## Existing systems this builds on

### Shared Cognito pool (`rna_atlas_inference/terraform/auth`)

- One invitation-only user pool, `us-east-2`, own Terraform state, deliberately
  separate from any site so a second site can share it. `allow_admin_create_user_only`,
  `username_attributes = ["email"]`, password policy, no custom schema attributes.
- One app client per consuming site (pattern already established: `web`, `mcp`).
  Clients use `USER_PASSWORD_AUTH` + `REFRESH_TOKEN_AUTH`, no secret, no Hosted UI.
- Login is a static page, `rnanix_server_frontend/login.html` + `auth.js`,
  calling Cognito's JSON API directly. Handles invite (`NEW_PASSWORD_REQUIRED`),
  sign-in, silent refresh.
- Users invited with `scripts/invite_user.sh`; invite email links to the RNAnix
  login page (known gap: one static link per pool).
- Backend enforcement today: API Gateway JWT authorizer on the RNAnix API.
- State backend is `local`. No `deletion_protection`, no `prevent_destroy`, no groups.

### rna-atlas.org (`rna_atlas_website`)

Documented for context only; not modified by this spec.

- Static site. Bucket `s3://rnanix/atlas_explorer/` (private, Origin Access
  Control), CloudFront distribution `E2CV6KWMNI7AQP`, domain `rna-atlas.org`.
- Not Terraform-managed. Deployed by `deploy.sh` (`aws s3 cp` + invalidation).
- Gate today: a CloudFront Function on viewer-request that requires
  `?t=<passcode>` on `/data/`, `/structs/`, `/react/`. The shell
  (`index.html`, `app.js`, `config.js`, `lib/`, `inference/`) is ungated so the
  passcode screen can render. The passcode is the emailed token.
- `/inference/` subpage lives in the same bucket; RNAnix replaces it.

### ai-cryoet (`deploy/`)

- nginx edge proxy, FastAPI API, TanStack Start SSR frontend, scanner CronJob,
  Postgres StatefulSet, mrc-ng-server. All read data and caches from a POSIX tree.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Orchestration | ECS on EC2 (Auto Scaling Group of 1, ECS-optimized AMI) | Existing containers read data and caches from a filesystem. EC2 permits FUSE mounts (`rclone mount`, Mountpoint for S3). Fargate does not, forcing EFS (~$0.30/GB/mo) or code changes. |
| IaC | Terraform, plain HCL | Cognito pool is Terraform. Consistency with collaborators. |
| Identity | Reuse the existing RNAnix pool. Add: portal app client, two groups, `deletion_protection`. | Shared invite list, one admin flow, no second pool to keep in sync. |
| Login UX | Portal's own `login.html` with portal branding, on top of an unmodified copy of RNAnix's `auth.js`, `USER_PASSWORD_AUTH` | `auth.js` holds all the Cognito logic with no branding or dependencies. RNAnix's `login.html` is RNAnix-branded and loads RNAnix's `style.css` and `app.js`, so the portal doesn't copy it. No Hosted UI or Cognito domain. |
| Enforcement | Lambda@Edge on CloudFront viewer-request: verify ID-token cookie with `aws-jwt-verify`, check `cognito:groups` | Works for any origin (ALB here, S3 for a static site). CloudFront Functions cannot verify RS256 JWTs. |
| Site scoping | Cognito groups `data-portal` and `rna-atlas`, checked at the edge | Runs on every request. A Pre-Authentication trigger is not a reliable gate because sign-in state is shared across app clients. |
| Drive access | Service account (in a Janelia Google Cloud project) + `rclone mount`, read-only | API keys reach only public files. rclone implements the Drive API. Mount is on-demand fetch, not a copy. |
| Derived caches | S3 bucket via Mountpoint for S3 on the host | Same filesystem paths the containers use. $0.023/GB. |
| Catalog DB | RDS Postgres, `db.t4g.micro` | Same `CATALOG_DB_URL` contract. |

## Architecture

```
Browser
  |
  v
CloudFront (portal)  --viewer-request-->  Lambda@Edge (gated_paths=["/*"], required_group=data-portal)
  |                                          |  no/invalid cookie: 302 /login.html?next=<uri>
  |                                          |  group missing: 403
  v
ALB (ingress only from CloudFront managed prefix list)
  |
  v
ECS task "portal" on EC2 (3 containers, localhost networking)
  nginx:8080  --/api/*-->  api:8000 (FastAPI)  --reads-->  RDS Postgres
              --/login.html, /auth.js--> served by nginx from a small static dir
              --/-------->  frontend:3000 (TanStack Start SSR)
  api reads thumbnails / MD previews from /caches  (Mountpoint for S3, bind-mounted)
  api and scanner read data tree from /data       (rclone mount of Drive, bind-mounted, ro)

ECS scheduled task "scanner" (EventBridge, hourly prod / nightly dev)
  reads /data, writes RDS Postgres and /caches

[later] ECS service "mrc-ng-server"
  reads /data (MRC scale 0) and /caches/pyramid; reached via nginx /mrc-ng-server/

Cognito user pool (existing, us-east-2): groups, app client per site
Google Drive (canonical raw data)   S3 bucket (derived caches: PNG, MD previews, pyramids)
```

## Deliverable 1: data portal (`infra/`)

### Module `modules/edge_auth`

Inputs: `name`, `required_group`, `user_pool_id`, `issuer`, `client_ids`
(list), `gated_paths` (list of prefixes, `["/*"]` for everything), `login_path`
(default `/login.html`), `public_paths` (login page assets, always allowed).

Creates:

- `aws_lambda_function` in `us-east-1` (provider alias), Node.js, `publish = true`,
  bundling `aws-jwt-verify`. Handler:
  1. If URI matches `public_paths` or `login_path`, or does not match
     `gated_paths`, pass through.
  2. Read `id_token` cookie. Missing or fails verification (issuer, one of
     `client_ids` as audience, `token_use=id`, expiry): 302 to
     `login_path?next=<uri>`. Verification uses the JWKS, cached across invocations.
  3. `cognito:groups` lacks `required_group`: 403 with a short "no access,
     contact admin" body.
  4. Otherwise pass through.
- Outputs: `qualified_arn` for `lambda_function_association`.

The module does not create a distribution. Callers attach the ARN to their own.
`gated_paths` and `client_ids` are lists so a static site can gate only its
data prefixes and accept more than one app client.

### Portal stack (`infra/portal`)

- Inputs from the auth state: `user_pool_id`, `issuer`, `data_portal_client_id`,
  as tfvars. The auth stack keeps local state by design (the repo stays
  applicable into any AWS account), so `terraform_remote_state` isn't available.
- VPC: two public subnets (ALB), two private subnets (EC2, RDS). For the POC,
  place the instance in a public subnet with no inbound rules to avoid NAT cost.
- ECS cluster on EC2: launch template with ECS-optimized AMI, ASG min 1 max 1,
  `t3.medium` for the POC. User data installs `rclone` and `mount-s3`, writes
  rclone config from Secrets Manager (service account JSON), and mounts:
  - `/mnt/drive`: `rclone mount drive: /mnt/drive --read-only --vfs-cache-mode full --vfs-cache-max-size 50G --allow-other`
  - `/mnt/caches`: `mount-s3 <cache-bucket> /mnt/caches --allow-other --allow-delete`
  Both as systemd units ordered before the ECS agent. Bind-mounted into tasks.
- ALB: HTTPS listener, target group to nginx. Security group ingress only from
  the `com.amazonaws.global.cloudfront.origin-facing` managed prefix list.
- RDS Postgres `db.t4g.micro`, private subnets, credentials in Secrets Manager,
  injected as `CATALOG_DB_URL`.
- S3 bucket for derived caches: `thumbnails/`, `md-previews/`, `pyramid/`.
- ECS task `portal`: containers `nginx`, `api`, `frontend` from ECR mirrors of
  the existing images. Environment mirrors `deploy/k8s/base/*.yaml`:
  `CATALOG_DATA_ROOT=/data`, `CATALOG_THUMBNAIL_DIR=/caches/thumbnails`,
  `CATALOG_MD_PREVIEW_DIR=/caches/md-previews`, `CRYOET_API_BASE_URL=http://127.0.0.1:8000`.
- ECS scheduled task `scanner`: existing scanner image, EventBridge rule, same
  mounts and DB URL.
- CloudFront distribution with ALB origin, caching disabled, all cookies and
  headers forwarded, `module "edge_auth"` with `gated_paths = ["/*"]`,
  `public_paths = ["/login.html", "/auth.js", "/favicon.ico"]`,
  `required_group = "data-portal"`, `client_ids = [data_portal_client_id]`.
- Workspaces `dev` and `prod`, mirroring the kustomize overlays.

### Required changes to ai-cryoet artifacts

1. `deploy/nginx.conf` (AWS copy): upstreams become `127.0.0.1:8000` and
   `127.0.0.1:3000`. Add `location = /login.html` and `/auth.js` served from a
   static dir baked into the nginx image: the portal's own `login.html` and an
   unmodified copy of `auth.js`, with the portal client id set in the page. Add the `/mrc-ng-server/` location when that service ships.
2. Scanner, API, frontend images: no change. rclone runs on the host.
3. Janelia-specific frontend settings (`VITE_FILEGLANCER_URL`, `/api/viewer/`
   proxy) stay for the POC; removed with the RNA schema revision.

### Data flow

1. Scientists drop data and metadata in the Google Drive folder, shared with
   the service account.
2. Scanner walks `/data` (Drive mount), gated by mtime in `scan_state`, writes
   rows to RDS and PNGs to `/caches` (S3).
3. API reads RDS and `/caches`. Frontend SSR calls the API on localhost;
   browser calls `/api/*` through nginx.
4. Every browser request passes CloudFront, where Lambda@Edge enforces the
   cookie and group before anything reaches the ALB.

## Deliverable 2: PR to `rna_atlas_inference`

All changes are additive and in-place. No pool replacement.

### `terraform/auth`

- `aws_cognito_user_group` `data-portal` and `rna-atlas`. The second is created
  now so the group model is complete; nothing enforces it until the site owner
  adopts `edge_auth`.
- `aws_cognito_user_pool_client` `data_portal`: same shape as `web`
  (`generate_secret = false`, `ALLOW_USER_PASSWORD_AUTH`,
  `ALLOW_REFRESH_TOKEN_AUTH`, `prevent_user_existence_errors = "ENABLED"`,
  12 h tokens). Output `data_portal_client_id`.
- `deletion_protection = "ACTIVE"` on the pool and
  `lifecycle { prevent_destroy = true }`.
- State stays `backend "local"`. The owner keeps it local on purpose so the
  repo stays applicable into any AWS account (`terraform/main.tf`). The portal
  takes the auth outputs as tfvars.
- Branch from `v2-chat-copilot` (open PR #7), where `terraform/auth` lives. It
  isn't on `master` yet.
- README: add the portal to the list of consuming sites and document the groups.
- A plan that shows `forces replacement` on the pool must not be applied.

### `rnanix_server_frontend/auth.js`

Separate PR, from a fork (no push access upstream). Merging to `main` deploys
RNAnix through GitHub Pages. Changes to `auth.js` only; `login.html` is
unchanged.

- After a successful sign-in or refresh, in addition to current storage, set
  `id_token=<token>; Path=/; Secure; SameSite=Lax; Max-Age=<token lifetime>`.
  `Max-Age` comes from the auth result's `ExpiresIn`, so the cookie never
  outlives its token. Clear it on logout.
- `nextUrl()`: the `?next=` path to return to after sign-in, or `index.html`.
  Only same-origin targets, so a crafted login link can't open-redirect.
- `resumeSession()`: when `?next=` is present and the refresh token is still
  valid, refresh silently and redirect to `nextUrl()`. A login page calls it on
  load. The cookie expires with the 12 h ID token, and the refresh token lasts
  30 days, so without this portal users would retype their password twice a day.

RNAnix doesn't call the new functions. Its only behavior change is the extra
cookie. Because the cookie is host-scoped, the portal serves its own login page
and copy of `auth.js` on its own domain.

### Per-site invite emails (`rna_atlas_inference`, follow-up PR)

Cognito's built-in invite template has one static link, which points at
RNAnix. Portal invitees must not land on RNAnix's page, so before inviting real
portal users:

- A Custom Message Lambda trigger rewrites the subject, body, and login link
  per site from a map (`site` to name, login URL, subject). With no site, it
  falls back to today's RNAnix email. The message keeps Cognito's `{username}`
  and `{####}` placeholders.
- Invites: `AdminCreateUser` passes `ClientMetadata` to the trigger.
  `invite_user.sh <email> [site]` sets `{"site": "<site>"}`, including on the
  `RESEND` path, and adds the user to that site's group.
- Forgot-password emails: the trigger receives the calling app client id, and
  maps it to a site.
- Terraform: the Lambda and its role, `lambda_config { custom_message }` on the
  pool (in-place), and an `aws_lambda_permission` for Cognito.
- A user who already exists and gains access to another site gets only the
  group. Their password works on every site. No new invite.

## Handoff: rna-atlas.org (not in scope, for the site owner)

The pieces above make this a small change when the owner wants it:

- Attach the `edge_auth` Lambda (`gated_paths = ["/data/*", "/structs/*", "/react/*"]`,
  `required_group = "rna-atlas"`) to distribution `E2CV6KWMNI7AQP` in place of
  the passcode CloudFront Function. Either import the distribution into
  Terraform, or attach once via console or `aws cloudfront update-distribution`.
- Add an `rna_atlas` app client, or reuse `web`; pass the id(s) in `client_ids`.
- Upload a site-branded `login.html` and a copy of `auth.js` to the bucket
  root. The page calls `RNAnixAuth.resumeSession()` on load and redirects to
  `RNAnixAuth.nextUrl()` after sign-in. Add `rna-atlas` to the invite-email
  site map.
- `app.js`: redirect to `/login.html?next=` when a data fetch returns 302 or
  403, and stop appending `?t=`.
- The existing RNAnix API Gateway JWT authorizer stays; API Gateway is a
  separate origin.

## Known ceilings and upgrade paths

- mrc-ng-server serves scale 0 by `pread` on the MRC. Through the Drive mount
  this is slow per chunk. Upgrade: extend `mrc-pyramid` to write scale 0 into
  the S3 cache. Not needed for the POC.
- Drive download quotas. Scanner and pyramid builds read each file once (mtime
  gating). If quotas bite, throttle rclone (`--tpslimit`, `--bwlimit`).
- Single EC2 instance, no HA. ASG replaces a dead instance; RDS and S3 hold state.
- Lambda@Edge iteration is slow (minutes to replicate, logs in the viewer's
  nearest region). Unit-test the handler before deploy.
- One site per invite. A new user's invite email goes to the site that
  invited them. A user later added to a second site's group gets no email from
  Cognito; the admin tells them the URL.
- Cognito pool immutability. No schema or username changes, ever. Pool state
  applied alone, with deletion protection.
- Cookie is per host. A user signed into rna-atlas.org still signs in again on
  the portal domain. Same password, same pool; acceptable.

## Cost estimate (POC, monthly, approximate)

| Item | USD |
|---|---|
| EC2 t3.medium | 30 |
| RDS db.t4g.micro | 12 |
| ALB | 18 |
| CloudFront, Lambda@Edge, S3 (small) | under 5 |
| Cognito | 0 |
| Total | about 65 |

Full scale adds S3 storage for derived data (~$23/TB/mo) and a larger instance.

## Testing

- Terraform: `validate` and `plan` in CI.
- Lambda@Edge handler, unit tests with a locally signed test JWT and stubbed
  JWKS: public path passes; gated path with no cookie 302s to login with
  `next`; valid token wrong group 403s; valid token right group passes;
  expired token 302s; token for a non-listed client id 302s; path outside
  `gated_paths` passes without a cookie.
- Portal smoke test after apply: unauthenticated request redirects to
  `/login.html`; invited user in `data-portal` sees the sample table; user only
  in `rna-atlas` gets 403.
- Auth PR: `terraform plan` shows only additions and in-place updates, no
  replacement. Existing RNAnix login still works after apply.
- Scanner: run the scheduled task once by hand, confirm rows in RDS and PNGs in
  the cache bucket.

## Rollout order

1. PR to `rna_atlas_inference` (`terraform/auth` additions) and PR to
   `rnanix_server_frontend` (`auth.js`). Owner reviews and applies.
2. `modules/edge_auth` with unit tests.
3. `infra/portal` dev workspace, pointed at a small Drive folder. Smoke tests.
   Until the Janelia Google Cloud project exists, mount a copy of the sample
   data from S3 at the same path.
4. Follow-up PR to `rna_atlas_inference`: per-site invite emails. Required
   before inviting real portal users.
5. Prod workspace when the RNA schema revision is ready.
6. Later: mrc-ng-server service and the scale-0 cache change.
7. Independent of the above: site owner adopts `edge_auth` for rna-atlas.org
   per the handoff section, whenever they choose.
