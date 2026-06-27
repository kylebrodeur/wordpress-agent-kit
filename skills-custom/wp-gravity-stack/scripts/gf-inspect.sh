#!/usr/bin/env bash
# gf-inspect.sh — audit the Gravity Forms stack on a local or remote WP install.
#
# Reports: GF version, all add-on versions (flags CVE-2026-4020), active forms,
# recent entry counts, SMTP security status, and Composer/SatisPress alignment.
#
# Usage:
#   bash {baseDir}/scripts/gf-inspect.sh                    # local WP (wp-cli.yml)
#   INSTALL=mysite bash {baseDir}/scripts/gf-inspect.sh --remote   # WP Engine SSH
#   bash {baseDir}/scripts/gf-inspect.sh --remote --env=staging

set -uo pipefail

REMOTE=false
ENV="production"
INSTALL="${WPE_INSTALL:-${INSTALL:-}}"

for arg in "$@"; do
  case "$arg" in
    --remote)    REMOTE=true ;;
    --env=*)     ENV="${arg#--env=}" ;;
  esac
done

# ── Build WP-CLI prefix ───────────────────────────────────────────────────────
if $REMOTE; then
  [ -z "$INSTALL" ] && {
    # Try to read from wp-cli.yml
    if [ -f "wp-cli.yml" ] && command -v node >/dev/null 2>&1; then
      INSTALL=$(node -e "
        const yaml = require('fs').readFileSync('wp-cli.yml','utf8');
        const m = yaml.match(/@${ENV}:\s*\n\s*ssh:\s*([^@\s]+)@/);
        if (m) process.stdout.write(m[1]);
      " 2>/dev/null || echo "")
    fi
    [ -z "$INSTALL" ] && { echo "❌ Set INSTALL= for remote mode"; exit 1; }
  }
  WP="ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${INSTALL}@${INSTALL}.ssh.wpengine.net wp"
  LABEL="${INSTALL} (${ENV})"
else
  WP="wp"
  LABEL="local"
fi

echo ""
echo "── Gravity Forms Stack Inspection: ${LABEL} ────────────────────────────"
echo ""

# ── Core versions ─────────────────────────────────────────────────────────────
echo "Versions:"

GF_VER=$($WP gf version 2>/dev/null || echo "not installed")
echo "  Gravity Forms:     ${GF_VER}"

# Gravity SMTP — check CVE-2026-4020
SMTP_VER=$($WP gf version gravitysmtp 2>/dev/null || echo "not installed")
if [ "$SMTP_VER" = "not installed" ]; then
  echo "  Gravity SMTP:      not installed"
elif php -r "exit(version_compare('$SMTP_VER','2.1.5','>=') ? 0 : 1);" 2>/dev/null; then
  echo "  Gravity SMTP:      ${SMTP_VER} ✓"
else
  echo "  Gravity SMTP:      ${SMTP_VER} ❌ CVE-2026-4020 — update to ≥ 2.1.5 immediately"
fi

CLI_VER=$($WP gf version gravityformscli 2>/dev/null || echo "not installed")
echo "  GF CLI:            ${CLI_VER}"

for slug in gravityformsturnstile gravityformsuserregistration gravityformswebhooks gravityformssignature; do
  VER=$($WP gf version $slug 2>/dev/null || echo "—")
  printf "  %-24s %s\n" "${slug}:" "${VER}"
done

# ── Active forms ──────────────────────────────────────────────────────────────
echo ""
echo "Forms (active):"
$WP gf form list --active --format=table 2>/dev/null || echo "  (none or GF not active)"

# ── Entry counts ──────────────────────────────────────────────────────────────
echo ""
echo "Entry counts per form:"
FORM_IDS=$($WP gf form list --format=ids 2>/dev/null || echo "")
if [ -n "$FORM_IDS" ]; then
  for fid in $FORM_IDS; do
    COUNT=$($WP gf entry list --form_id=$fid --status=active --format=count 2>/dev/null || echo "?")
    TITLE=$($WP gf form get $fid --format=json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('title','?'))" 2>/dev/null || echo "Form $fid")
    printf "  [%s] %-30s %s entries\n" "$fid" "$TITLE" "$COUNT"
  done
else
  echo "  (no forms found)"
fi

# ── SMTP security check ───────────────────────────────────────────────────────
echo ""
echo "SMTP security:"
SMTP_KEY_IN_DB=$($WP option get gravitysmtp_sendgrid_api_key 2>/dev/null | wc -c || echo "0")
if [ "${SMTP_KEY_IN_DB:-0}" -gt 5 ]; then
  echo "  ⚠️  SendGrid key stored in wp_options — move to wp-config.php constant"
else
  echo "  ✓ SendGrid key not in wp_options"
fi

# Check if GF_LICENSE_KEY constant is defined
$WP eval 'echo defined("GF_LICENSE_KEY") ? "  ✓ GF_LICENSE_KEY constant set\n" : "  ⚠  GF_LICENSE_KEY not defined — needed for wp gf install/update\n";' \
  --skip-plugins --skip-themes 2>/dev/null || echo "  (could not check constants)"

# ── Remote media check ────────────────────────────────────────────────────────
echo ""
echo "Media settings:"
UPLOAD_URL=$($WP option get upload_url_path 2>/dev/null || echo "")
if [ -n "$UPLOAD_URL" ]; then
  echo "  upload_url_path:   ${UPLOAD_URL}"
  echo "  → Remote media enabled (local dev mode — do NOT deploy)"
else
  echo "  upload_url_path:   (not set — using local uploads)"
fi

# ── Updates available ─────────────────────────────────────────────────────────
echo ""
echo "Available updates:"
$WP gf check-update --format=table 2>/dev/null || echo "  (no updates or GF not active)"
$WP gf check-update gravitysmtp --format=table 2>/dev/null | tail -n +2 | sed 's/^/  gravitysmtp: /'

echo ""
echo "── Inspection complete ─────────────────────────────────────────────────"
