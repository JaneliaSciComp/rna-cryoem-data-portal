variable "region" {
  description = "Region for everything except the Lambda@Edge function (always us-east-1). Same as the Cognito pool."
  type        = string
  default     = "us-east-2"
}

variable "user_pool_id" {
  description = "Cognito user pool id (rna_auth_aws_daslab terraform/auth output user_pool_id)."
  type        = string
}

variable "data_portal_client_id" {
  description = "Portal app client id (rna_auth_aws_daslab terraform/auth output data_portal_client_id). Also baked into the nginx image's login page."
  type        = string
}

variable "image_tag" {
  description = "Tag for this stack's images in ECR (for example demo-1). scripts/push-images.sh builds the api and nginx images and mirrors mrc-ng-server under it."
  type        = string
}

variable "scan_schedule" {
  description = "EventBridge schedule expression for the scanner: nightly for dev (cron(0 7 * * ? *)), hourly for prod (rate(1 hour))."
  type        = string
}

variable "instance_type" {
  description = "ECS container instance type. x86_64 only: user data installs the amd64 rclone build."
  type        = string
  default     = "t3.medium"
}

variable "db_instance_class" {
  description = "RDS instance class for the catalog DB."
  type        = string
  default     = "db.t4g.micro"
}

variable "drive_folder_id" {
  description = "Google Drive folder id to mount read-only as the data tree. Empty: mount s3://<bucket>/sample-data/ instead."
  type        = string
  default     = ""
}

variable "drive_service_account_secret_arn" {
  description = "Secrets Manager secret (created outside Terraform, so the key stays out of state) holding the Drive service account JSON key. Required with drive_folder_id."
  type        = string
  default     = ""
}
