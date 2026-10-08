mock_provider "aws" {
  override_data {
    target = data.aws_region.current
    values = { region = "us-east-1" }
  }
  # Mocked data sources return random strings; the role needs a JSON object.
  override_data {
    target = data.aws_iam_policy_document.assume
    values = { json = "{}" }
  }
}

variables {
  name           = "test-edge-auth"
  required_group = "app:data-portal"
  user_pool_id   = "us-east-2_TestPool1"
  client_ids     = ["portalclient"]
  gated_paths    = ["/*"]
  public_paths   = ["/login.html", "/auth.js"]
}

run "plans_in_us_east_1" {
  command = plan
  assert {
    condition     = aws_lambda_function.this.publish && aws_lambda_function.this.handler == "index.handler"
    error_message = "Lambda@Edge needs a published version and the bundle's handler."
  }
}

run "rejects_other_regions" {
  command = plan
  override_data {
    target = data.aws_region.current
    values = { region = "us-east-2" }
  }
  expect_failures = [aws_lambda_function.this]
}

run "rejects_empty_client_ids" {
  command = plan
  variables {
    client_ids = []
  }
  expect_failures = [var.client_ids]
}
