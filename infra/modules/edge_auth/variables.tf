variable "name" {
  description = "Lambda function name. Also prefixes the IAM role."
  type        = string
}

variable "required_group" {
  description = "Cognito group a user must be in (cognito:groups claim) to pass."
  type        = string
}

variable "user_pool_id" {
  description = "Cognito user pool id, e.g. us-east-2_XXXXXXXXX. The token issuer is derived from it."
  type        = string
}

variable "client_ids" {
  description = "App client ids accepted as the ID token audience."
  type        = list(string)
  validation {
    condition     = length(var.client_ids) > 0
    error_message = "client_ids must list at least one app client id."
  }
}

variable "gated_paths" {
  description = "URI patterns that require sign-in. A trailing * is a prefix match; [\"/*\"] gates everything."
  type        = list(string)
}

variable "public_paths" {
  description = "URI patterns always allowed (login page assets). Same pattern syntax as gated_paths."
  type        = list(string)
  default     = []
}

variable "login_path" {
  description = "Login page. Always allowed; unauthenticated requests redirect here with ?next=<uri>."
  type        = string
  default     = "/login.html"
}
