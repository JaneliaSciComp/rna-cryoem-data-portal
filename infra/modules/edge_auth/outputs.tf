output "qualified_arn" {
  description = "Versioned function ARN for a CloudFront lambda_function_association (viewer-request)."
  value       = aws_lambda_function.this.qualified_arn
}
