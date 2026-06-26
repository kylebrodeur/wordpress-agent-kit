#!/usr/bin/env bash
# wpe-check.sh — verify SSH connectivity to all configured WP Engine environments.
#
# Reads installs from wp-cli.yml @aliases (ssh: field) or from WPE_INSTALLS env var.
# Useful after first-time machine setup or when debugging SSH issues.
#
# Usage:
#   bash scripts/wpe-check.sh
#   WPE_INSTALLS="mysite mysitestg mysitedev" bash scripts/wpe-check.sh
#
# Exit code: 0 = all connected, 1 = at least one failed.

set -uo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

# ── Discover installs from wp-cli.yml @aliases ────────────────────────────────
declare -A ALIAS_MAP   # install → alias label
CURRENT_ALIAS=""

if [ -f wp-cli.yml ]; then
  while IFS= read -r line; do
    if [[ "$line" =~ ^@([a-zA-Z0-9_-]+): ]]; then
      CURRENT_ALIAS="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^[[:space:]]+ssh:[[:space:]]+([^@[:space:]]+)@[^[:space:]]+ && -n "$CURRENT_ALIAS" ]]; then
      INSTALL="${BASH_REMATCH[1]}"
      ALIAS_MAP["$INSTALL"]="@${CURRENT_ALIAS}"
      CURRENT_ALIAS=""
    fi
  done < wp-cli.yml
fi

# Fallback: WPE_INSTALLS env var
if [ "${#ALIAS_MAP[@]}" -eq 0 ] && [ -n "${WPE_INSTALLS:-}" ]; then
  for slug in $WPE_INSTALLS; do
    ALIAS_MAP["$slug"]="$slug"
  done
fi

if [ "${#ALIAS_MAP[@]}" -eq 0 ]; then
  echo "No WP Engine installs found."
  echo ""
  echo "Options:"
  echo "  1. Add @aliases with 'ssh: <install>@<install>.ssh.wpengine.net' to wp-cli.yml"
  echo "  2. Set WPE_INSTALLS='slug1 slug2 slug3' environment variable"
  exit 1
fi

echo ""
echo "── WP Engine SSH connectivity ────────────────────────────────────────"
printf "  %-25s %-15s %-12s %s\n" "Install" "Alias" "Status" "WP version"
echo "  ─────────────────────────────────────────────────────────────────"

PASS=0
FAIL=0

for INSTALL in "${!ALIAS_MAP[@]}"; do
  ALIAS="${ALIAS_MAP[$INSTALL]}"
  SSH_HOST="${INSTALL}.ssh.wpengine.net"

  WP_VERSION=$(ssh $SSH_OPTS "${INSTALL}@${SSH_HOST}" \
    wp core version --skip-plugins --skip-themes 2>/dev/null || echo "")

  if [ -n "$WP_VERSION" ]; then
    printf "  %-25s %-15s %-12s %s\n" "$INSTALL" "$ALIAS" "✓ connected" "$WP_VERSION"
    ((PASS++))
  else
    printf "  %-25s %-15s %-12s %s\n" "$INSTALL" "$ALIAS" "✗ FAILED" "—"
    ((FAIL++))
  fi
done

echo ""
echo "  $PASS connected  |  $FAIL failed"

if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "Troubleshooting:"
  echo "  • Confirm key exists:  ls -la ~/.ssh/wpengine_ed25519"
  echo "  • Confirm permissions: chmod 600 ~/.ssh/wpengine_ed25519"
  echo "  • Trust the host:      ssh-keyscan -H ssh.wpengine.net >> ~/.ssh/known_hosts"
  echo "  • Check portal:        https://my.wpengine.com/ssh_keys"
  echo "  • Verify git access:   ssh git@git.wpengine.com info"
fi

echo ""
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
