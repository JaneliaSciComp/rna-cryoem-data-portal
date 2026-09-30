mock_provider "aws" {}

variables {
  portal_url = "https://d111111abcdef8.cloudfront.net"
}

run "pool_is_invite_only_and_protected" {
  command = plan
  assert {
    condition     = aws_cognito_user_pool.portal.deletion_protection == "ACTIVE"
    error_message = "Cognito has no backup; deletion protection guards the only copy of the users."
  }
  assert {
    condition     = aws_cognito_user_pool.portal.admin_create_user_config[0].allow_admin_create_user_only
    error_message = "No public sign-up: invite only."
  }
}

run "client_matches_the_portal" {
  command = plan
  assert {
    condition     = !aws_cognito_user_pool_client.data_portal.generate_secret
    error_message = "The login page is a public client; it can't keep a secret."
  }
  assert {
    condition     = toset(aws_cognito_user_pool_client.data_portal.explicit_auth_flows) == toset(["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"])
    error_message = "auth.js signs in with USER_PASSWORD_AUTH and renews with REFRESH_TOKEN_AUTH."
  }
  assert {
    condition     = aws_cognito_user_pool_client.data_portal.id_token_validity == 12
    error_message = "The id_token cookie lives as long as the ID token: 12 hours, as in RNAnix's pool."
  }
  assert {
    condition     = aws_cognito_user_group.data_portal.name == "data-portal"
    error_message = "edge_auth in infra/portal requires the group named data-portal."
  }
}

run "invite_links_to_portal_login" {
  command = plan
  assert {
    condition     = strcontains(aws_cognito_user_pool.portal.admin_create_user_config[0].invite_message_template[0].email_message, "https://d111111abcdef8.cloudfront.net/login.html?email={username}")
    error_message = "The invite links to the portal's login page with the email prefilled."
  }
  assert {
    condition     = strcontains(aws_cognito_user_pool.portal.admin_create_user_config[0].invite_message_template[0].email_message, "{####}")
    error_message = "Cognito rejects an invite template without the {####} temporary password."
  }
}

run "invite_without_portal_url" {
  command = plan
  variables {
    portal_url = ""
  }
  assert {
    condition = alltrue([
      for s in ["{username}", "{####}"] : strcontains(aws_cognito_user_pool.portal.admin_create_user_config[0].invite_message_template[0].email_message, s)
    ]) && !strcontains(aws_cognito_user_pool.portal.admin_create_user_config[0].invite_message_template[0].email_message, "href")
    error_message = "Before the portal exists, the invite still carries both placeholders and has no link."
  }
}

run "rejects_portal_url_with_path" {
  command = plan
  variables {
    portal_url = "https://d111111abcdef8.cloudfront.net/"
  }
  expect_failures = [var.portal_url]
}
