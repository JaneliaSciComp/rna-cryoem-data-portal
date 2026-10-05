#!/usr/bin/env bash
# Invite one person to the data portal:
#   infra/auth/scripts/invite-user.sh someone@lab.edu
#
# A new user gets Cognito's invite email (a temporary password and a link to the portal's login
# page), and their first sign-in forces a new password. A pending invite is resent with a fresh
# temporary password. Someone who already has an account is only added to the group. Every path
# ends in the data-portal group, which edge_auth requires.
#
# Adapted from rna_atlas_inference's scripts/invite_user.sh.
set -euo pipefail
EMAIL=${1:?usage: invite-user.sh <email>}
AUTH_DIR=$(cd "$(dirname "$0")/.." && pwd)

POOL_ID=$(terraform -chdir="$AUTH_DIR" output -raw user_pool_id)
[ -n "$POOL_ID" ] || { echo "ERROR: empty user_pool_id. Is infra/auth applied?" >&2; exit 1; }

# Empty when the user doesn't exist yet.
STATUS=$(aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "$EMAIL" \
  --query UserStatus --output text 2>/dev/null) || STATUS=""

# Read a fixed number of bytes, then filter: `tr | head -c` dies of SIGPIPE under pipefail.
# The suffix satisfies the pool's password policy whatever the random part holds.
RAW=$(head -c 200 /dev/urandom | tr -dc 'A-Za-z0-9')
TEMP_PASSWORD="${RAW:0:10}Aa1!"

case "$STATUS" in
  "")
    aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username "$EMAIL" \
      --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
      --temporary-password "$TEMP_PASSWORD" --desired-delivery-mediums EMAIL >/dev/null
    echo "Invited $EMAIL. Temporary password (also emailed): $TEMP_PASSWORD"
    ;;
  FORCE_CHANGE_PASSWORD)
    aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username "$EMAIL" \
      --temporary-password "$TEMP_PASSWORD" --message-action RESEND \
      --desired-delivery-mediums EMAIL >/dev/null
    echo "Resent the invite to $EMAIL. New temporary password (also emailed): $TEMP_PASSWORD"
    ;;
  CONFIRMED)
    echo "$EMAIL already has an account. Adding the group only; no email sent."
    ;;
  *)
    echo "ERROR: $EMAIL has UserStatus=$STATUS. Resolve it in the Cognito console." >&2
    exit 1
    ;;
esac

aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL_ID" --username "$EMAIL" \
  --group-name data-portal
echo "Added $EMAIL to data-portal."
