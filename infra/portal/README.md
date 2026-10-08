# Data portal on AWS

The molecule portal (`portal/backend` and `portal/frontend` in this repo) on one ECS-on-EC2
instance behind CloudFront. Every request passes `../modules/edge_auth` (Cognito `id_token`
cookie, group `app:data-portal`) before it reaches the internal ALB. Design:
`docs/superpowers/specs/2026-10-01-molecule-portal-demo-design.md`.

```
CloudFront + edge_auth -> VPC origin -> internal ALB -> ECS task (host network)
                                                          nginx:8080 -> api:8000, mrc-ng-server:8001
                                                          (nginx serves the app and Neuroglancer)
EC2 host: /mnt/data   (rclone, read-only: the Drive folder, or s3://<bucket>/sample-data/)
          /mnt/caches (rclone: s3://<bucket>/caches/)
RDS Postgres (CATALOG_DB_URL in Secrets Manager). EventBridge runs the scanner task on a schedule.
```

## Prerequisites

- Terraform >= 1.7, Node 22, Docker, AWS CLI, credentials for the target account.
- The shared Cognito pool from
  [`rna_auth_aws_daslab`](https://github.com/JaneliaSciComp/rna_auth_aws_daslab), applied with
  its `data_portal` client and `app:data-portal` group. Its `terraform/auth` outputs
  `user_pool_id` and `data_portal_client_id` go in the tfvars.
- Docker (push-images.sh builds the api and nginx images and mirrors the public mrc-ng-server image).

## Deploy a workspace

```bash
cd infra/portal
npm --prefix ../modules/edge_auth/function ci && npm --prefix ../modules/edge_auth/function run build
cp dev.tfvars.example dev.tfvars   # fill in
terraform init
terraform workspace new dev        # or: terraform workspace select dev
terraform apply -var-file=dev.tfvars
scripts/push-images.sh dev <image_tag> <data_portal_client_id>
```

The first apply takes about 20 minutes (CloudFront and the VPC origin). The portal service
retries until the images exist. To skip its backoff after pushing:
`aws ecs update-service --cluster rna-portal-dev --service portal --force-new-deployment`.

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

State is local, in `terraform.tfstate.d/<workspace>/`. It holds the DB password. Back it up, and
don't commit it.

## Data source

- **Sample data (default):** upload a small tree in the `CATALOG_DATA_ROOT` layout to
  `s3://$(terraform output -raw bucket)/sample-data/`, one folder per molecule. Set
  drive_folder_id and drive_service_account_secret_arn to mount the team's Drive folder.
- **Google Drive:** share the folder with the service account as Viewer. Store the account's JSON
  key in Secrets Manager (`aws secretsmanager create-secret --name rna-portal/drive-sa
  --secret-string file://key.json`), and set `drive_folder_id` and
  `drive_service_account_secret_arn`. The apply replaces the instance.

## Operating

- Run the scanner now: `aws ecs run-task --cluster $(terraform output -raw cluster) --launch-type EC2 --task-definition $(terraform output -raw scanner_task_definition)`.
- Logs: CloudWatch group `/ecs/rna-portal-<workspace>`. edge_auth logs land in
  `/aws/lambda/us-east-1.rna-portal-<workspace>`, in the region nearest the viewer.
- Shell on the instance: `aws ssm start-session --target <instance-id>`. Mounts:
  `systemctl status rclone-data rclone-caches`.
- New image tag: push it, change `image_tag`, apply.
- New AMI: `terraform apply -replace=aws_launch_template.ecs -var-file=dev.tfvars`.
- `terraform destroy` can fail on the edge Lambda while CloudFront deletes its replicas (up to a
  few hours). Rerun it later.

## Known ceilings

- One instance, no HA. The ASG replaces a dead one; RDS and S3 hold the state.
- The scanner lock is per host (`flock`). It needs a DB lock if the ASG ever grows past 1.
- mrc-ng-server serves maps at full resolution only (no `mrc-pyramid build`).
