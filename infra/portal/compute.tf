# One ECS container instance (ASG of 1, so a dead instance is replaced) running the portal task
# and the scheduled scanner. Host networking: the portal's containers reach each other on
# 127.0.0.1, as the spec's nginx.conf expects.

data "aws_iam_policy_document" "assume" {
  for_each = toset(["ec2", "ecs-tasks", "events"])
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["${each.key}.amazonaws.com"]
    }
  }
}

# --- Instance: ECS agent, SSM shell access, the S3 mounts, the Drive key -----------------------

resource "aws_iam_role" "instance" {
  name               = "${local.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.assume["ec2"].json
}

resource "aws_iam_role_policy_attachment" "instance" {
  for_each = toset([
    "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])
  role       = aws_iam_role.instance.name
  policy_arn = each.value
}

data "aws_iam_policy_document" "instance" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.portal.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.portal.arn}/*"]
  }
  dynamic "statement" {
    for_each = var.drive_service_account_secret_arn == "" ? [] : [var.drive_service_account_secret_arn]
    content {
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_role_policy" "instance" {
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance.json
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name}-instance"
  role = aws_iam_role.instance.name
}

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

resource "aws_launch_template" "ecs" {
  name_prefix   = "${local.name}-"
  image_id      = data.aws_ssm_parameter.ecs_ami.insecure_value
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.instance.arn
  }

  network_interfaces {
    associate_public_ip_address = true # egress without NAT; no inbound except from the ALB
    security_groups             = [aws_security_group.instance.id]
  }

  metadata_options {
    http_tokens = "required"
  }

  # Room for rclone's 50 GB Drive read cache plus images.
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 100
      volume_type = "gp3"
      encrypted   = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tftpl", {
    cluster          = aws_ecs_cluster.this.name
    bucket           = aws_s3_bucket.portal.bucket
    region           = var.region
    drive_folder_id  = var.drive_folder_id
    drive_secret_arn = var.drive_service_account_secret_arn
  }))

  lifecycle {
    # ponytail: AMI pinned at first apply, so a new AWS release doesn't replace the instance on
    # an unrelated apply. To upgrade: terraform apply -replace=aws_launch_template.ecs
    ignore_changes = [image_id]

    precondition {
      condition     = (var.drive_folder_id == "") == (var.drive_service_account_secret_arn == "")
      error_message = "Set drive_folder_id and drive_service_account_secret_arn together, or neither (S3 sample data)."
    }
  }
}

resource "aws_autoscaling_group" "ecs" {
  name_prefix         = "${local.name}-"
  min_size            = 1
  max_size            = 1
  desired_capacity    = 1
  vpc_zone_identifier = aws_subnet.public[*].id

  launch_template {
    id      = aws_launch_template.ecs.id
    version = aws_launch_template.ecs.latest_version
  }

  # A launch template change (user data, instance type) replaces the one instance: brief outage.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 0
    }
  }

  tag {
    key                 = "Name"
    value               = local.name
    propagate_at_launch = true
  }
}

# --- ECS -----------------------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = local.name
}

resource "aws_cloudwatch_log_group" "portal" {
  name              = "/ecs/${local.name}"
  retention_in_days = 30
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.assume["ecs-tasks"].json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_url.arn]
  }
}

resource "aws_iam_role_policy" "execution" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution.json
}

locals {
  image = { for k, repo in aws_ecr_repository.images : k => "${repo.repository_url}:${var.image_tag}" }

  # The portal backend's settings (portal/backend/src/rna_portal/config.py), with this stack's
  # mount paths.
  catalog_env = [
    { name = "CATALOG_DATA_ROOT", value = "/data" },
    { name = "CATALOG_THUMBNAIL_DIR", value = "/caches/thumbnails" },
  ]
  catalog_secrets = [{ name = "CATALOG_DB_URL", valueFrom = aws_secretsmanager_secret.db_url.arn }]

  log = { for c in ["nginx", "api", "mrc-ng-server", "scanner"] : c => {
    logDriver = "awslogs"
    options = {
      "awslogs-group"         = aws_cloudwatch_log_group.portal.name
      "awslogs-region"        = var.region
      "awslogs-stream-prefix" = c
    }
  } }
}

resource "aws_ecs_task_definition" "portal" {
  family                   = "${local.name}-portal"
  network_mode             = "host"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.execution.arn

  volume {
    name      = "data"
    host_path = "/mnt/data"
  }
  volume {
    name      = "caches"
    host_path = "/mnt/caches"
  }

  container_definitions = jsonencode([
    {
      name              = "nginx"
      image             = local.image["nginx"]
      essential         = true
      memoryReservation = 64
      portMappings      = [{ containerPort = 8080, hostPort = 8080, protocol = "tcp" }]
      # Sends the data files the api authorizes (X-Accel-Redirect to /internal/data/).
      mountPoints      = [{ sourceVolume = "data", containerPath = "/data", readOnly = true }]
      logConfiguration = local.log["nginx"]
    },
    {
      name              = "api"
      image             = local.image["api"]
      essential         = true
      memoryReservation = 512
      environment       = local.catalog_env
      secrets           = local.catalog_secrets
      mountPoints = [
        { sourceVolume = "data", containerPath = "/data", readOnly = true },
        { sourceVolume = "caches", containerPath = "/caches", readOnly = true },
      ]
      logConfiguration = local.log["api"]
    },
    {
      # Serves maps to Neuroglancer as OME-Zarr, straight from the Drive mount. No pyramids: the
      # scanner doesn't run mrc-pyramid build, so the (empty) cache root only has to exist.
      name              = "mrc-ng-server"
      image             = local.image["mrc-ng-server"]
      essential         = true
      memoryReservation = 512
      environment = [
        { name = "HOST", value = "127.0.0.1" },
        { name = "PORT", value = "8001" },
        { name = "MRCNG_SOURCE_ROOT", value = "/data" },
        { name = "MRCNG_CACHE_ROOT", value = "/caches/mrcng" },
      ]
      mountPoints = [
        { sourceVolume = "data", containerPath = "/data", readOnly = true },
        { sourceVolume = "caches", containerPath = "/caches", readOnly = true },
      ]
      logConfiguration = local.log["mrc-ng-server"]
    },
  ])
}

resource "aws_ecs_service" "portal" {
  name            = "portal"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.portal.arn
  desired_count   = 1
  launch_type     = "EC2"

  # One instance and a fixed host port 8080: the old task must stop before the new one can bind.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  health_check_grace_period_seconds  = 120

  # A task that never turns healthy (bad image tag) rolls back to the previous task definition.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.portal.arn
    container_name   = "nginx"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.http] # the target group must be attached to the ALB first
}

# --- Scanner: a one-off task on a schedule --------------------------------------------------------

resource "aws_ecs_task_definition" "scanner" {
  family                   = "${local.name}-scanner"
  network_mode             = "host"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.execution.arn

  volume {
    name      = "data"
    host_path = "/mnt/data"
  }
  volume {
    name      = "caches"
    host_path = "/mnt/caches"
  }
  volume {
    name      = "locks"
    host_path = "/var/lib/rna-portal"
  }
  # rclone's remote control for the data mount (user_data.sh.tftpl): the scanner refreshes the
  # mount's listings through it before scanning.
  volume {
    name      = "rclone-rc"
    host_path = "/run/rclone-rc"
  }

  container_definitions = jsonencode([{
    name              = "scanner"
    image             = local.image["api"]
    essential         = true
    memoryReservation = 1024
    # The backend's scanner, under a host-wide lock. EventBridge has no equivalent of k8s
    # concurrencyPolicy: Forbid, so a run that finds a scan in progress exits 0.
    # ponytail: host lock, relies on the single instance. Use a DB advisory lock if the ASG grows.
    command     = ["sh", "-c", "umask 002 && exec flock -n -E 0 /locks/scan.lock pixi run scan"]
    environment = concat(local.catalog_env, [{ name = "CATALOG_RCLONE_SOCKET", value = "/rclone-rc/data.sock" }])
    secrets     = local.catalog_secrets
    mountPoints = [
      { sourceVolume = "data", containerPath = "/data", readOnly = true },
      { sourceVolume = "caches", containerPath = "/caches", readOnly = false },
      { sourceVolume = "locks", containerPath = "/locks", readOnly = false },
      { sourceVolume = "rclone-rc", containerPath = "/rclone-rc", readOnly = false },
    ]
    logConfiguration = local.log["scanner"]
  }])
}

resource "aws_iam_role" "events" {
  name               = "${local.name}-scan-schedule"
  assume_role_policy = data.aws_iam_policy_document.assume["events"].json
}

data "aws_iam_policy_document" "events" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = ["${aws_ecs_task_definition.scanner.arn_without_revision}:*"]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.execution.arn]
  }
}

resource "aws_iam_role_policy" "events" {
  role   = aws_iam_role.events.id
  policy = data.aws_iam_policy_document.events.json
}

resource "aws_cloudwatch_event_rule" "scan" {
  name                = "${local.name}-scan"
  schedule_expression = var.scan_schedule
}

resource "aws_cloudwatch_event_target" "scan" {
  rule     = aws_cloudwatch_event_rule.scan.name
  arn      = aws_ecs_cluster.this.arn
  role_arn = aws_iam_role.events.arn
  ecs_target {
    task_definition_arn = aws_ecs_task_definition.scanner.arn
    launch_type         = "EC2"
    task_count          = 1
  }
}
