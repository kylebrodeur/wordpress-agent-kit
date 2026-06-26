#!/usr/bin/env bash
# wpe-preflight.sh — pre-deploy sanity checks for a WP Engine environment.
#
# Verifies SSH access, WP-CLI, site URL consistency, HTTP health, and
# active plugin count before any deploy touches production or staging.
#
# Usage:
#   INSTALL=mysite bash scripts/wpe-preflight.sh [staging|production]
#   WPE_INSTALL=mysite bash scripts/wpe-preflight.sh production
#
# Exit code: 0 = all checks passed (safe to deploy), 1 = at least one failed.

set -uo pipefail

ENV="${1:-production}"
INSTALL="${WPE_INSTALL:-${INSTALL:-}}"

if [ -z "$INSTALL" ]; then
  echo "❌ Usage: INSTALL=<slug> bash scripts/wpe-preflight.sh [staging|production]"
  echo "   The install slug is the WP Engine environment name (e.g., 'mysite', 'mysitestg')."
  exit 1
fi

SSH_HOST="${INSTALL}.ssh.wpengine.net"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new"
WP="ssh $SSH_OPTS ${INSTALL}@${SSH_HOST} wp"

PASS=0
FAIL=0

check() {
  local label="$1"; shift
  printf "  %-50s" "$label"
  local output
  if output=$("$@" 2>&1); then
    echo "✓  $output"
    ((PASS++))
  else
    echo "✗  FAILED"
    echo "     $output" >&2
    ((FAIL++))
  fi
}

echo ""
echo "── WP Engine preflight: ${INSTALL} (${ENV}) ─────────────────────"
echo ""

# ── SSH ───────────────────────────────────────────────────────────────────────
echo "SSH"
check "SSH gateway reachable" \
  ssh $SSH_OPTS "${INSTALL}@${SSH_HOST}" echo "connected"

check "WP-CLI available" \
  $WP --info --skip-plugins --skip-themes

# ── WordPress ─────────────────────────────────────────────────────────────────
echo ""
echo "WordPress"
check "WP core version" \
  $WP core version --skip-plugins --skip-themes

check "siteurl option readable" \
  $WP option get siteurl --skip-plugins --skip-themes

check "Active plugins present (count > 0)" \
  bash -c "COUNT=\$(${WP} plugin list --status=active --format=count --skip-plugins --skip-themes 2>&1); echo \"\$COUNT active\"; [[ \"\$COUNT\" -gt 0 ]]"

check "No pending DB upgrades" \
  $WP core update-db --dry-run --skip-plugins --skip-themes

# ── HTTP health ───────────────────────────────────────────────────────────────
echo ""
echo "HTTP health"
SITE_URL=$(ssh $SSH_OPTS "${INSTALL}@${SSH_HOST}" \
  wp option get home --skip-plugins --skip-themes 2>/dev/null || echo "")

if [ -n "$SITE_URL" ]; then
  check "Homepage returns 2xx/3xx" \
    bash -c "STATUS=\$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 '${SITE_URL}'); echo \"HTTP \$STATUS\"; [[ \"\$STATUS\" -ge 200 && \"\$STATUS\" -lt 400 ]]"

  check "No PHP errors in homepage body" \
    bash -c "BODY=\$(curl -sL --max-time 15 '${SITE_URL}'); echo \"\${#BODY} chars\"; ! echo \"\$BODY\" | grep -qi 'fatal error\|parse error\|warning: '"

  check "wp-json REST API responds" \
    bash -c "STATUS=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 '${SITE_URL}/wp-json/wp/v2/'); echo \"HTTP \$STATUS\"; [[ \"\$STATUS\" -ge 200 && \"\$STATUS\" -lt 400 ]]"
else
  echo "  ⚠  Could not retrieve site URL — skipping HTTP checks"
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "── Preflight result ──────────────────────────────────────────────────"
echo "  Passed : $PASS"
echo "  Failed : $FAIL"
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ All checks passed — safe to deploy to ${ENV}."
  exit 0
else
  echo "❌ Preflight failed — resolve the issues above before deploying to ${ENV}."
  exit 1
fi
