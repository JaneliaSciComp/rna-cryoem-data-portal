output "bucket" {
  description = "Cache and sample-data bucket. Upload sample data to s3://<bucket>/sample-data/."
  value       = aws_s3_bucket.portal.bucket
}

output "portal_url" {
  description = "The portal, signed in through /login.html."
  value       = "https://${aws_cloudfront_distribution.portal.domain_name}"
}

output "alb_dns_name" {
  description = "Internal ALB. Resolves to private addresses and is unreachable from outside the VPC (smoke test)."
  value       = aws_lb.portal.dns_name
}

output "cluster" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "scanner_task_definition" {
  description = "Scanner task definition, for a manual run: aws ecs run-task --cluster <cluster> --launch-type EC2 --task-definition <this>."
  value       = aws_ecs_task_definition.scanner.arn
}
