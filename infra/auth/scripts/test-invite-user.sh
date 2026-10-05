#!/usr/bin/env bash
# Runs invite-user.sh against stub `aws` and `terraform` commands and checks the calls it makes
# for each Cognito user state. No AWS access needed.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
stub=$(mktemp -d)
trap 'rm -rf "$stub"' EXIT

cat > "$stub/terraform" <<'STUB'
#!/bin/sh
echo us-east-2_TestPool1
STUB
# admin-get-user prints $USER_STATUS, or fails like a missing user when it's empty.
cat > "$stub/aws" <<'STUB'
#!/bin/sh
echo "aws $*" >> "$CALLS"
case "$*" in
  *admin-get-user*) [ -n "$USER_STATUS" ] || exit 254; echo "$USER_STATUS" ;;
esac
STUB
chmod +x "$stub/terraform" "$stub/aws"

calls_for() { # USER_STATUS -> the aws calls invite-user.sh made; fails if the script does
  # Explicit return: errexit doesn't apply inside $(...) or an `if` condition.
  : > "$stub/calls"
  CALLS=$stub/calls USER_STATUS=$1 PATH="$stub:$PATH" "$here/invite-user.sh" someone@lab.edu >/dev/null || return $?
  cat "$stub/calls"
}
has() { grep -qF -- "$2" <<<"$1" || { printf 'FAIL (%s): expected "%s" in:\n%s\n' "$3" "$2" "$1"; exit 1; }; }
lacks() { ! grep -qF -- "$2" <<<"$1" || { printf 'FAIL (%s): unexpected "%s" in:\n%s\n' "$3" "$2" "$1"; exit 1; }; }
group="admin-add-user-to-group --user-pool-id us-east-2_TestPool1 --username someone@lab.edu --group-name data-portal"

calls=$(calls_for "")
has "$calls" "admin-create-user" "new user is invited"
lacks "$calls" "RESEND" "new user is invited"
has "$calls" "$group" "new user is invited"

calls=$(calls_for FORCE_CHANGE_PASSWORD)
has "$calls" "--message-action RESEND" "pending user is resent"
has "$calls" "$group" "pending user is resent"

calls=$(calls_for CONFIRMED)
lacks "$calls" "admin-create-user" "confirmed user gets the group only"
has "$calls" "$group" "confirmed user gets the group only"

if calls_for RESET_REQUIRED >/dev/null 2>&1; then
  echo "FAIL (unexpected status stops): exited 0 for RESET_REQUIRED"
  exit 1
fi

echo "invite-user.sh OK"
