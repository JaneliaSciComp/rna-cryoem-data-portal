# Data portal on AWS

The molecule portal (`portal/backend` and `portal/frontend` in this repo) on one ECS-on-EC2
instance behind CloudFront. Every request passes `../modules/edge_auth` (Cognito `id_token`
cookie, group `app:data-portal`) before it reaches the internal ALB.

```
CloudFront + edge_auth -> VPC origin -> internal ALB -> ECS task (host network)
                                                          nginx:8080 -> api:8000, mrc-ng-server:8001
                                                          api, scanner -> typesense:8108 (127.0.0.1)
                                                          (nginx serves the app and Neuroglancer)
EC2 host: /mnt/data   (rclone, read-only: the Drive folder, or s3://<bucket>/sample-data/)
          /mnt/caches (rclone: s3://<bucket>/caches/)
RDS Postgres (CATALOG_DB_URL in Secrets Manager). EventBridge runs the scanner task on a schedule.
```

Each environment is a Terraform workspace (`dev`, `prod`) with its own tfvars file
(`dev.tfvars`, `prod.tfvars`). The commands below take the workspace from `$WS`, so the same
steps deploy either one. Run them all in one shell, so the variables carry from step to step.

## Prerequisites

- Terraform >= 1.7, Node 22, Docker, AWS CLI v2, and the
  [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
  for a shell on the instance.
- The shared Cognito pool from
  [`rna_auth_aws_daslab`](https://github.com/JaneliaSciComp/rna_auth_aws_daslab), applied with
  its `data_portal` client and `app:data-portal` group. Its `terraform/auth` outputs
  `user_pool_id` and `data_portal_client_id` go in the tfvars.

## Sign in to AWS

HHMI accounts use IAM Identity Center (SSO). Set up a profile once:

```bash
aws configure sso
# SSO session name: hhmi
# SSO start URL:    https://hhmi.awsapps.com/start
# SSO region:       us-east-1   (us-east-2 fails with "Invalid start url")
# Account 481088927481, role AWSAdministratorAccess, default client region us-east-2
```

Use that profile for everything below. Either export it in each shell
(`export AWS_PROFILE=<profile-name>`; check the spelling, since a misspelled variable silently
falls back to `[default]`), or make it the `[default]` profile in `~/.aws/config`, so no variable
is needed:

```ini
[default]
sso_session = hhmi
sso_account_id = 481088927481
sso_role_name = AWSAdministratorAccess
region = us-east-2

[sso-session hhmi]
sso_start_url = https://hhmi.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

`aws configure sso` writes the `[sso-session hhmi]` block. Before each deploy, sign in and check
that it worked:

```bash
aws sso login
aws sts get-caller-identity     # prints an AWSAdministratorAccess role in 481088927481
```

## Release an update

Follow these steps for every release, on dev first, then on prod with the same commit.

Database migrations must be additive (new tables, new nullable columns, or columns with a
server default), because step 5 migrates the database while the old code still serves the
portal. A migration that drops or renames something needs two releases: stop using it in one,
drop it in the next.

### 1. Merge to main and set the variables

Merge the release's PRs on GitHub first. Images are tagged with the short SHA of a commit on
`main`, because branch SHAs disappear after a squash merge or a rebase.

`push-images.sh` refuses to run if `git status` shows anything, including untracked files that
aren't gitignored, such as a leftover `key.json`. The tfvars files are gitignored, so editing them
is fine.

```bash
cd "$(git rev-parse --show-toplevel)/infra/portal"
git switch main && git pull
WS=dev                                  # or prod
TAG=$(git rev-parse --short HEAD)
CLIENT_ID=$(sed -n 's/^data_portal_client_id *= *"\([^"]*\)".*/\1/p' $WS.tfvars)
PREV_TAG=$(sed -n 's/^image_tag *= *"\([^"]*\)".*/\1/p' $WS.tfvars)
echo "$WS $TAG $CLIENT_ID $PREV_TAG"    # all four must be non-empty
```

`PREV_TAG` is the version running now. Write it down: it's what [Roll back](#roll-back) returns
to. `sed -i.bak` in step 5 leaves a `$WS.tfvars.bak` copy with that tag, too; it's gitignored.

### 2. Back up the state and select the workspace

State is local, in `terraform.tfstate.d/<workspace>/`, and it holds the DB password.

```bash
cp -r terraform.tfstate.d/$WS ~/rna-portal-tfstate-$WS-$(date +%F-%H%M%S)
npm --prefix ../modules/edge_auth/function ci && npm --prefix ../modules/edge_auth/function run build
terraform init
terraform workspace select $WS
```

### 3. Create any new image repositories

A release can add an ECR repository, as the Typesense release did. `push-images.sh` fails with
`repository ... does not exist` until the repository exists. This step creates any missing
repositories without touching the running service, and it changes nothing when there are none:

```bash
terraform apply -var-file=$WS.tfvars -target=aws_ecr_repository.images
```

Terraform warns that `-target` gives an incomplete plan. That's expected here; step 6 applies the
rest.

### 4. Build and push the images

```bash
scripts/push-images.sh $WS $TAG $CLIENT_ID
```

### 5. Migrate the database

`image_tag` in the tfvars must hold the literal SHA, for example `image_tag = "a676a26"`.
Terraform doesn't expand shell variables in tfvars files. The `sed` command writes the line for
you (`-i.bak` works with both GNU and macOS `sed`).

The targeted apply registers the new scanner task definition and leaves the portal service on the
old code. Running that task with `alembic upgrade head` migrates the database before the new code
starts, so the new API never runs against the old schema. When the release has no migration,
`upgrade head` changes nothing.

```bash
sed -i.bak "s/^image_tag *=.*/image_tag             = \"$TAG\"/" $WS.tfvars
grep image_tag $WS.tfvars
terraform apply -var-file=$WS.tfvars -target=aws_ecs_task_definition.scanner
aws ecs describe-task-definition --task-definition rna-portal-$WS-scanner \
  --query 'taskDefinition.containerDefinitions[0].image' --output text   # must end in :$TAG
SCANNER_TD=$(aws ecs describe-task-definition --task-definition rna-portal-$WS-scanner \
  --query taskDefinition.taskDefinitionArn --output text)
TASK=$(aws ecs run-task --cluster rna-portal-$WS --launch-type EC2 --task-definition $SCANNER_TD \
  --overrides '{"containerOverrides":[{"name":"scanner","command":["pixi","run","alembic","-c","backend/alembic.ini","upgrade","head"]}]}' \
  --query 'tasks[0].taskArn' --output text)
echo "$TASK"                            # an ARN; "None" means ECS couldn't place the task
aws ecs wait tasks-stopped --cluster rna-portal-$WS --tasks $TASK
aws ecs describe-tasks --cluster rna-portal-$WS --tasks $TASK --query 'tasks[0].containers[0].exitCode'
```

The exit code must be `0`. If it isn't, read the task's log (see [Operating](#operating)) and
stop: the portal still runs the old code, and nothing else has changed.

If `$TASK` is `None`, rerun the `run-task` command without `--query` to see the `failures` list.

Until step 6 finishes, the scheduled scan runs the old scanner. If it fires in this window, it fails
on the newer schema. That's harmless: step 7 scans again.

### 6. Deploy the new code

```bash
terraform apply -var-file=$WS.tfvars
```

Read the plan before you type `yes`. A routine release changes the portal task definition and the
portal service. If the plan replaces the instance, the database, or the CloudFront distribution,
stop and find out why.

The portal is down for a minute or two while ECS swaps the task: the service stops the old task
before it starts the new one, because both bind the same host port.

Wait for the service to settle, then check that it runs the new task definition:

```bash
aws ecs wait services-stable --cluster rna-portal-$WS --services portal
aws ecs describe-services --cluster rna-portal-$WS --services portal \
  --query 'services[0].[taskDefinition,deployments[0].rolloutState]' --output text
aws ecs describe-task-definition --task-definition rna-portal-$WS-portal \
  --query taskDefinition.taskDefinitionArn --output text
```

The first command's ARN must match the second one's, and the state must be `COMPLETED`. The
waiter also succeeds when the deployment fails: if the new task never turns healthy, the circuit
breaker rolls the service back to the old task definition and the service settles there. In that
case the ARNs differ. Find the cause in the service events and the `api` and `nginx` logs (see
[Operating](#operating)).

### 7. Run the scanner

The scanner rebuilds the search index. It needs the new portal task, which runs Typesense, so run
it only after step 6. A scanner that starts too early logs `search reindex failed` with
`Connection refused`.

```bash
TASK=$(aws ecs run-task --cluster rna-portal-$WS --launch-type EC2 \
  --task-definition $(terraform output -raw scanner_task_definition) \
  --query 'tasks[0].taskArn' --output text)
echo "$TASK"
aws ecs wait tasks-stopped --cluster rna-portal-$WS --tasks $TASK
aws logs tail /ecs/rna-portal-$WS --since 1h --log-stream-name-prefix scanner/scanner/${TASK##*/}
```

The log should end with `scan complete: ... failed=0`, `indexed <n> molecules for search`, and
`warmed <n> files`.

- **`search reindex failed`:** rerun this step. The catalog part already succeeded, and the next
  scan rebuilds the index.
- **No `scan complete` line:** a scheduled scan held the lock, so this run exited without
  scanning. Wait a few minutes and rerun this step.

### 8. Check the portal

```bash
terraform output -raw portal_url
```

Open the URL, sign in, and check the molecule list and a molecule page. If something's wrong,
see [Operating](#operating) for the logs, or [roll back](#roll-back).

### Roll back

A rollback swaps the images only. The task definitions come from the `.tf` files in your current
checkout, and every container uses the same `image_tag`. So a rollback works only across releases
that changed code, not infrastructure. If a release between the two versions added a container or
an image repository (as the Typesense release did), the old SHA has no image for it, and the task
fails. Roll forward with a fix instead.

Run these in the shell from the release, so `$WS`, `$PREV_TAG`, and `$SCANNER_TD` still hold
their values.

**1. If the release added migrations, downgrade the database first.** Old code runs
`alembic upgrade head` on every scan and fails against a database newer than it knows. The new
scanner task definition (`$SCANNER_TD`, still the current one) has the downgrade code, so run it
before the apply in step 2 replaces it. Find the old code's latest migration:

```bash
git ls-tree --name-only $PREV_TAG ../../portal/backend/src/rna_portal/migrations/versions/
```

Its revision is the number at the start of the last file name, for example `0001`. Then:

```bash
TASK=$(aws ecs run-task --cluster rna-portal-$WS --launch-type EC2 --task-definition $SCANNER_TD \
  --overrides '{"containerOverrides":[{"name":"scanner","command":["pixi","run","alembic","-c","backend/alembic.ini","downgrade","0001"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster rna-portal-$WS --tasks $TASK
aws ecs describe-tasks --cluster rna-portal-$WS --tasks $TASK --query 'tasks[0].containers[0].exitCode'
```

Replace `0001` with the revision you found. The exit code must be `0`. A downgrade drops what the
migration added. Read the migration's `downgrade()` first. The new API may answer errors until
step 2 finishes.

**2. Deploy the old images:**

```bash
TAG=$PREV_TAG
sed -i.bak "s/^image_tag *=.*/image_tag             = \"$TAG\"/" $WS.tfvars
grep image_tag $WS.tfvars
terraform apply -var-file=$WS.tfvars
```

The images for `$PREV_TAG` are still in ECR. Then run steps 6 (from the waiter on) and 7.

## Deploy a new workspace

The first deploy of a workspace, for example `prod`. Sign in first, as in
[Sign in to AWS](#sign-in-to-aws).

```bash
cd "$(git rev-parse --show-toplevel)/infra/portal"
WS=prod
cp dev.tfvars.example $WS.tfvars        # fill in; prod: scan_schedule = "rate(1 hour)"
npm --prefix ../modules/edge_auth/function ci && npm --prefix ../modules/edge_auth/function run build
terraform init
terraform workspace new $WS
terraform apply -var-file=$WS.tfvars
```

The first apply takes about 20 minutes (CloudFront and the VPC origin). The portal service can't
start yet, because no images exist. Then follow [Release an update](#release-an-update) from step
1, with the same `WS`. In step 6, if the plan doesn't change the portal service (the first apply
already used this tag), start the deployment yourself:
`aws ecs update-service --cluster rna-portal-$WS --service portal --force-new-deployment`.

Once the portal is up, invite people from a checkout of `rna_auth_aws_daslab`. Both commands
need Cognito admin credentials for the account that holds the pool:

```bash
scripts/invite_user.sh someone@lab.edu --apps data-portal   # new user
scripts/user_access.sh grant someone@lab.edu data-portal    # existing user, e.g. an RNAnix user
```

An invite whose first `--apps` entry is `data-portal` gets the portal's own email, which links to
this portal's `/login.html`. Any other first app gets the pool's default RNAnix email. The link
comes from `invite_sites` in `rna_auth_aws_daslab`'s `terraform/auth/invite_sites.auto.tfvars`;
update it there if `terraform output -raw portal_url` changes.

## Data source

- **Sample data (default):** upload a small tree in the `CATALOG_DATA_ROOT` layout to
  `s3://$(terraform output -raw bucket)/sample-data/`, one folder per molecule. Set
  drive_folder_id and drive_service_account_secret_arn to mount the team's Drive folder.
- **Google Drive:** share the folder with the service account as Viewer. Store the account's JSON
  key in Secrets Manager (`aws secretsmanager create-secret --name rna-portal/drive-sa
  --secret-string file://key.json`), and set `drive_folder_id` and
  `drive_service_account_secret_arn`. The apply replaces the instance. Delete `key.json`
  afterwards.

## Operating

- Run the scanner now: step 7 of [Release an update](#release-an-update). Do this after the
  instance is replaced, too: until a scan rebuilds the search index, the molecule list answers
  503.
- Logs: CloudWatch group `/ecs/rna-portal-<workspace>`, one stream per container and task
  (`api/api/<task-id>`, `scanner/scanner/<task-id>`). For example:
  `aws logs tail /ecs/rna-portal-$WS --since 1h --log-stream-name-prefix api`. edge_auth logs
  land in `/aws/lambda/us-east-1.rna-portal-<workspace>`, in the region nearest the viewer.
- Portal service events: `aws ecs describe-services --cluster rna-portal-$WS --services portal --query 'services[0].events[:5].message'`.
- Shell on the instance:

  ```bash
  INSTANCE=$(aws ec2 describe-instances \
    --filters Name=tag:Name,Values=rna-portal-$WS Name=instance-state-name,Values=running \
    --query 'Reservations[].Instances[].InstanceId' --output text)
  aws ssm start-session --target $INSTANCE
  ```

  Mounts: `systemctl status rclone-data rclone-caches`.
- New AMI: `terraform apply -replace=aws_launch_template.ecs -var-file=$WS.tfvars`.
- `terraform destroy` can fail on the edge Lambda while CloudFront deletes its replicas (up to a
  few hours). Rerun it later.

## Troubleshooting

| Error | Cause and fix |
|---|---|
| `No valid credential sources found` with `login session has expired` | Terraform used an expired login, usually because `AWS_PROFILE` is unset or misspelled and `[default]` isn't the SSO profile. Run `aws sso login`, check the variable's spelling, and rerun `aws sts get-caller-identity`. |
| `push-images.sh`: `repository ... does not exist` | The release adds a repository. Run step 3. |
| `push-images.sh`: `commit or stash changes first` | `git status` shows changes or untracked files. Commit, stash, or delete them; the tag must name the commit the images come from. |
| Scanner: `Can't locate revision` | The scanner's code is older than the database. Expected for a scheduled scan between steps 5 and 6. After a rollback, see [Roll back](#roll-back), step 1. |
| Scanner: `search reindex failed` with `Connection refused` | Typesense wasn't running yet. Rerun step 7. |
| Molecule list answers 503 | The search index is empty. Run the scanner (step 7). |

## Known ceilings

- One instance, no HA. The ASG replaces a dead one; RDS and S3 hold the state.
- The scanner lock is per host (`flock`). It needs a DB lock if the ASG ever grows past 1.
- mrc-ng-server serves maps at full resolution only (no `mrc-pyramid build`).
- The search index lives on the instance's disk and is rebuilt from scratch after every scan. Fine
  for hundreds of molecules; index incrementally if scans start to drag.
