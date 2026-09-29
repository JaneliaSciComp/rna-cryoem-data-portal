# Lambda@Edge viewer-request gate: requires a valid Cognito id_token cookie and membership in
# required_group. Creates no distribution. The caller passes a us-east-1 provider and attaches it:
#
#   module "edge_auth" {
#     source    = "../modules/edge_auth"
#     providers = { aws = aws.us_east_1 }
#     ...
#   }
#   lambda_function_association {
#     event_type = "viewer-request"
#     lambda_arn = module.edge_auth.qualified_arn
#   }
#
# Build the bundle first: npm --prefix function ci && npm --prefix function run build

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 6.0" }
    archive = { source = "hashicorp/archive", version = ">= 2.4" }
  }
}

data "aws_region" "current" {}

# Lambda@Edge has no environment variables: config ships inside the zip.
data "archive_file" "function" {
  type        = "zip"
  output_path = "${path.module}/function/dist/${var.name}.zip"

  source {
    filename = "index.mjs"
    content  = file("${path.module}/function/dist/index.mjs")
  }

  source {
    filename = "config.json"
    content = jsonencode({
      userPoolId    = var.user_pool_id
      clientIds     = var.client_ids
      requiredGroup = var.required_group
      gatedPaths    = var.gated_paths
      publicPaths   = var.public_paths
      loginPath     = var.login_path
    })
  }
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = "${var.name}-edge-auth"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "this" {
  function_name    = var.name
  role             = aws_iam_role.this.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.function.output_path
  source_code_hash = data.archive_file.function.output_base64sha256
  publish          = true # CloudFront associations need a numbered version
  memory_size      = 128
  timeout          = 5 # viewer-request maximum

  lifecycle {
    precondition {
      condition     = data.aws_region.current.region == "us-east-1"
      error_message = "Lambda@Edge functions must be created in us-east-1. Pass providers = { aws = aws.us_east_1 }."
    }
  }
}
