# Offline: every AWS call is mocked. Mocked values are random strings, so the ones that are
# parsed, indexed, or validated as ARNs (apply-mode runs) get fixed defaults.
mock_provider "aws" {
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-2:123456789012:loadbalancer/app/test/0123456789abcdef" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/test/0123456789abcdef" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/test" }
  }
  mock_resource "aws_iam_instance_profile" {
    defaults = { arn = "arn:aws:iam::123456789012:instance-profile/test" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:us-east-2:123456789012:cluster/test" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn                  = "arn:aws:ecs:us-east-2:123456789012:task-definition/test:1"
      arn_without_revision = "arn:aws:ecs:us-east-2:123456789012:task-definition/test"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-2:123456789012:secret:test-AbCdEf" }
  }
  mock_resource "aws_launch_template" {
    defaults = { id = "lt-0123456789abcdef0", latest_version = 1 }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::rna-portal-test", bucket = "rna-portal-test" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-2a", "us-east-2b"] }
  }
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-0123456789abcdef0", insecure_value = "ami-0123456789abcdef0" }
  }
}

mock_provider "aws" {
  alias = "us_east_1"
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/test-edge-auth" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { qualified_arn = "arn:aws:lambda:us-east-1:123456789012:function:test:1" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
}

variables {
  user_pool_id          = "us-east-2_TestPool1"
  data_portal_client_id = "portalclient"
  image_tag             = "test"
  scan_schedule         = "rate(1 day)"
}

run "database_is_private" {
  command = plan
  assert {
    condition     = !aws_db_instance.catalog.publicly_accessible
    error_message = "The catalog DB must not be publicly accessible."
  }
  assert {
    condition     = length(aws_subnet.private) == 2 && alltrue([for s in aws_subnet.private : s.map_public_ip_on_launch != true])
    error_message = "RDS needs two private subnets in different AZs."
  }
}

run "origin_only_through_cloudfront" {
  command = plan
  assert {
    condition     = aws_lb.portal.internal
    error_message = "The ALB must be internal: a public one can be put behind anyone's distribution, skipping edge_auth."
  }
  assert {
    condition     = one(aws_cloudfront_distribution.portal.default_cache_behavior[0].lambda_function_association).event_type == "viewer-request"
    error_message = "edge_auth must run on viewer-request."
  }
  assert {
    condition     = length(aws_cloudfront_distribution.portal.ordered_cache_behavior) == 0
    error_message = "Only the default behavior carries edge_auth; an extra behavior would be ungated."
  }
}

run "caches_mount_supports_rename" {
  command = apply # mocked: resolves the bucket name so user data renders
  assert {
    condition     = !strcontains(base64decode(aws_launch_template.ecs.user_data), "mount-s3")
    error_message = "The scanner renames temp files into the caches; Mountpoint for S3 can't rename."
  }
  assert {
    condition     = strcontains(base64decode(aws_launch_template.ecs.user_data), "--s3-directory-markers")
    error_message = "Empty cache dirs must persist: the API won't start without CATALOG_THUMBNAIL_DIR."
  }
  assert {
    condition     = strcontains(base64decode(aws_launch_template.ecs.user_data), "BUCKET='${aws_s3_bucket.portal.bucket}'")
    error_message = "User data must render the cache bucket name."
  }
}

run "rollout_and_scan_safety" {
  command = apply
  assert {
    condition     = aws_ecs_service.portal.deployment_maximum_percent == 100 && aws_ecs_service.portal.deployment_minimum_healthy_percent == 0
    error_message = "One instance, fixed host port: the old task must stop before the new one starts."
  }
  assert {
    condition     = strcontains(join(" ", jsondecode(aws_ecs_task_definition.scanner.container_definitions)[0].command), "flock -n -E 0 /locks/scan.lock")
    error_message = "Overlapping scheduled scans must skip, not run concurrently."
  }
  assert {
    condition = alltrue(flatten([
      for td in [aws_ecs_task_definition.portal, aws_ecs_task_definition.scanner] : [
        for c in jsondecode(td.container_definitions) : [
          for m in try(c.mountPoints, []) : m.readOnly if m.sourceVolume == "data"
        ]
      ]
    ]))
    error_message = "Every container mounts the data tree read-only."
  }
}

run "drive_needs_both_inputs" {
  command = plan
  variables {
    drive_folder_id = "1AbCdEf"
  }
  expect_failures = [aws_launch_template.ecs]
}

run "no_empty_env_values" {
  command = apply
  # ECS drops empty-string environment entries at registration, so an image default would win
  # (hashicorp/terraform-provider-aws#39533). Unset variables in the command instead.
  assert {
    condition = alltrue(flatten([
      for td in [aws_ecs_task_definition.portal, aws_ecs_task_definition.scanner] : [
        for c in jsondecode(td.container_definitions) : [for e in try(c.environment, []) : e.value != ""]
      ]
    ]))
    error_message = "No container may set an environment variable to an empty string."
  }
  assert {
    condition     = startswith(jsondecode(aws_ecs_task_definition.scanner.container_definitions)[0].command[2], "unset MRCNG_CACHE_ROOT;")
    error_message = "The scanner must unset the image's MRCNG_CACHE_ROOT=/cache to skip pyramid builds."
  }
}

run "bad_image_rolls_back" {
  command = plan
  assert {
    condition     = aws_ecs_service.portal.deployment_circuit_breaker[0].enable && aws_ecs_service.portal.deployment_circuit_breaker[0].rollback
    error_message = "A task that never becomes healthy (bad image tag) must roll back to the previous task definition."
  }
}
