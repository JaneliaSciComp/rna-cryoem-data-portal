# Browser -> CloudFront (edge_auth on viewer-request) -> VPC origin -> internal ALB -> nginx:8080.
# The ALB has no public address. Only this distribution's VPC origin can reach it, so edge_auth
# can't be bypassed. Plain HTTP inside the VPC: no domain or certificate needed.

module "edge_auth" {
  source    = "../modules/edge_auth"
  providers = { aws = aws.us_east_1 }

  name           = local.name
  required_group = "app:data-portal"
  user_pool_id   = var.user_pool_id
  client_ids     = [var.data_portal_client_id]
  gated_paths    = ["/*"]
  public_paths   = ["/login.html", "/auth.js", "/favicon.ico"]
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# VPC origins connect from CloudFront's origin-facing ranges.
resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_lb" "portal" {
  name               = local.name
  internal           = true
  load_balancer_type = "application"
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.alb.id]
}

# The ECS service registers the instance on host port 8080 (host networking).
resource "aws_lb_target_group" "portal" {
  name                 = local.name
  port                 = 8080
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 10
  # nginx proxies /healthz to the frontend, which answers without calling the API.
  health_check {
    path    = "/healthz"
    matcher = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.portal.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.portal.arn
  }
}

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = local.name
    arn                    = aws_lb.portal.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "portal" {
  enabled     = true
  comment     = local.name
  price_class = "PriceClass_100"

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.portal.dns_name
    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.alb.id
    }
  }

  # The only behavior, so edge_auth sees every path. Don't add ordered_cache_behavior blocks
  # without the same lambda_function_association.
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id

    lambda_function_association {
      event_type = "viewer-request"
      lambda_arn = module.edge_auth.qualified_arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
