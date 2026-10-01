# The data portal's Cognito user pool: invite only, one app client, one group. It's its own
# stack with its own state because a replaced pool invalidates every invited user.
#
# Copied from rna_atlas_inference/terraform/auth/cognito.tf (branch portal-auth): same pool
# settings and the same data_portal client shape, so moving to that shared pool later only means
# changing infra/portal's tfvars and re-inviting users. The outputs keep his names for that
# reason. See the spec's "Update 2026-09-30".

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 6.0" }
  }
  # Local state, gitignored. Back it up: without it Terraform would try to create a second pool.
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "rna-data-portal" }
  }
  # Accounts with myApplication tagging add this tag out of band; ignore it to avoid drift.
  ignore_tags {
    keys = ["awsApplication"]
  }
}

variable "region" {
  description = "Region for the pool. infra/portal's edge_auth derives the token issuer from the pool id."
  type        = string
  default     = "us-east-2"
}

variable "portal_url" {
  description = "The portal's base URL (infra/portal output portal_url), for the invite email's link. Empty until the portal exists; the email then has no link."
  type        = string
  default     = ""
  validation {
    condition     = var.portal_url == "" || can(regex("^https://[^/]+$", var.portal_url))
    error_message = "portal_url must be https://<host> with no path or trailing slash, or empty."
  }
}

locals {
  # {username} and {####} are Cognito's placeholders (the invited email and the temporary
  # password). The link prefills the login page's email field.
  invite_link = var.portal_url == "" ? "<p>Your administrator will send you the portal's address. Sign in there with the temporary password, then choose your own.</p>" : "<p><a href=\"${var.portal_url}/login.html?email={username}\">Accept your invitation</a>, sign in with the temporary password, then choose your own.</p>"
}

resource "aws_cognito_user_pool" "portal" {
  name = "rna-portal-users"

  # Cognito has no backup or restore. deletion_protection stops a DeleteUserPool call from any
  # tool; prevent_destroy makes Terraform refuse a plan that would destroy or replace the pool.
  deletion_protection = "ACTIVE"
  lifecycle {
    prevent_destroy = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "You're invited to the RNA AI CryoEM Data Portal"
      email_message = <<-EOT
        <p>You've been invited to the <b>RNA AI CryoEM Data Portal</b>.</p>
        <p>Username: <b>{username}</b><br>Temporary password: <b>{####}</b></p>
        ${local.invite_link}
      EOT
      sms_message   = "Your RNA AI CryoEM Data Portal username is {username} and temporary password is {####}"
    }
  }

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
  }

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

# Public client for the portal's login page (infra/portal/nginx/login.html + auth.js), which
# calls Cognito's JSON API directly: no secret, no Hosted UI. edge_auth pins the ID token's
# audience to this client.
resource "aws_cognito_user_pool_client" "data_portal" {
  name         = "rna-portal-data-portal"
  user_pool_id = aws_cognito_user_pool.portal.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  # The id_token cookie expires with the ID token, so this also sets how often the login page
  # silently refreshes.
  access_token_validity  = 12
  id_token_validity      = 12
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# edge_auth lets a signed-in user through only if cognito:groups contains this group.
resource "aws_cognito_user_group" "data_portal" {
  name         = "data-portal"
  user_pool_id = aws_cognito_user_pool.portal.id
  description  = "May access the RNA AI CryoEM data portal."
}

output "user_pool_id" {
  description = "Pool id, for infra/portal's user_pool_id tfvar."
  value       = aws_cognito_user_pool.portal.id
}

output "data_portal_client_id" {
  description = "App client id, for infra/portal's data_portal_client_id tfvar and scripts/push-images.sh."
  value       = aws_cognito_user_pool_client.data_portal.id
}
