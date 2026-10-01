# Derived caches (caches/) and, until the Drive mount exists, the sample data tree
# (sample-data/). New buckets block public access by default.
resource "aws_s3_bucket" "portal" {
  bucket_prefix = "${local.name}-"
}

# The portal backend (api and scanner) and nginx images built from this repo, plus a mirror of
# mrc-ng-server. scripts/push-images.sh fills them.
resource "aws_ecr_repository" "images" {
  for_each = toset(["nginx", "api", "mrc-ng-server"])
  name     = "${local.name}/${each.key}"
  # The repos hold only images push-images.sh can rebuild or re-mirror, so a removed repo (such
  # as ai-cryoet's old frontend and scanner mirrors) is deleted with its images.
  force_delete = true
}

# URL-safe (no special characters): the password is embedded in CATALOG_DB_URL.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "catalog" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

# db_name and username are "portal": RDS rejects "catalog" as a reserved word.
resource "aws_db_instance" "catalog" {
  identifier                = local.name
  engine                    = "postgres"
  engine_version            = "16"
  instance_class            = var.db_instance_class
  allocated_storage         = 20
  storage_type              = "gp3"
  storage_encrypted         = true
  db_name                   = "portal"
  username                  = "portal"
  password                  = random_password.db.result
  db_subnet_group_name      = aws_db_subnet_group.catalog.name
  vpc_security_group_ids    = [aws_security_group.db.id]
  publicly_accessible       = false
  backup_retention_period   = 7
  deletion_protection       = terraform.workspace == "prod"
  skip_final_snapshot       = terraform.workspace != "prod"
  final_snapshot_identifier = "${local.name}-final"
}

# The whole connection URL, which the api and scanner read as CATALOG_DB_URL.
resource "aws_secretsmanager_secret" "db_url" {
  name_prefix = "${local.name}/catalog-db-url-"
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql+psycopg://${aws_db_instance.catalog.username}:${random_password.db.result}@${aws_db_instance.catalog.address}:5432/${aws_db_instance.catalog.db_name}"
}
