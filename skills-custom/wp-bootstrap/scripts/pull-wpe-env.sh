#!/usr/bin/env bash
# pull-wpe-env.sh — pull a WP Engine environment DB to local Playground/wp-env.
#
# Exports the remote DB via SSH, imports locally, and runs search-replace so
# local development works against a real copy of the production/staging data.
#
# Usage:
#   INSTALL=mysite bash scripts/pull-wpe-env.sh [staging|production|development]
#   WPE_INSTALL=mysite bash scripts/pull-wpe-env.sh production
#   WPE_INSTALL=mysite bash scripts/pull-wpe-env.sh staging --local-url=http://localhost:9400
#
# Options:
#   --local-url=<url>    Local WordPress URL (default: http://localhost:9400)
#   --local-path=<path>  Local WordPress root (default: cwd or wp-cli.yml path)
#   --skip-uploads       Don't sync wp-content/uploads
#   --uploads-only       Only sync uploads, skip DB
#   --dry-run            Show what would happen without executing

set -uo pipefail

ENV="${1:-development}"
INSTALL="${WPE_INSTALL:-${INSTALL:-}}"
LOCAL_URL="http://localhost:9400"
LOCAL_PATH=""
SKIP_UPLOADS=false
UPLOADS_ONLY=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    staging|production|development) ENV="$arg" ;;
    --local-url=*)   LOCAL_URL="${arg#--local-url=}" ;;
    --local-path=*)  LOCAL_PATH="${arg#--local-path=}" ;;
    --skip-uploads)  SKIP_UPLOADS=true ;;
    --uploads-only)  UPLOADS_ONLY=true ;;
    --dry-run)       DRY_RUN=true ;;
  esac
done

if [ -z "$INSTALL" ]; then
  # Try to get from wp-cli.yml
  if [ -f "wp-cli.yml" ] && command -v node >/dev/null 2>&1; then
    INSTALL=$(node -e "
      const fs = require('fs');
      const yaml = fs.readFileSync('wp-cli.yml', 'utf8');
      const m = yaml.match(/@${ENV}:\s*\n\s*ssh:\s*([^@\s]+)@/);
      if (m) process.stdout.write(m[1]);
    " 2>/dev/null || echo "")
  fi
fi

[ -z "$INSTALL" ] && {
  echo "❌ Set INSTALL= or WPE_INSTALL= to the WP Engine install slug"
  echo "   Usage: INSTALL=mysite bash $0 [staging|production|development]"
  exit 1
}

SSH_HOST="${INSTALL}.ssh.wpengine.net"
REMOTE_ROOT="sites/${INSTALL}"
TIMESTAMP=$(date +%F-%H%M)
BACKUP_FILE="/tmp/wpe-${INSTALL}-${ENV}-${TIMESTAMP}.sql"

echo ""
echo "── WP Engine → Local Pull ──────────────────────────────────────────"
echo "  Install: ${INSTALL} (${ENV})"
echo "  Remote:  ${INSTALL}@${SSH_HOST}:${REMOTE_ROOT}"
echo "  Local:   ${LOCAL_URL}"
echo ""

# ── Detect local WordPress ────────────────────────────────────────────────
LOCAL_WP_ARGS=""
if [ -n "$LOCAL_PATH" ]; then
  LOCAL_WP_ARGS="--path=${LOCAL_PATH}"
elif [ -f "wp-cli.yml" ] && grep -q "^path:" wp-cli.yml; then
  LOCAL_WP_ARGS=""  # wp-cli.yml handles it
fi

# ── Get remote site URL ───────────────────────────────────────────────────
echo "▶ Getting remote site URL..."
if $DRY_RUN; then
  REMOTE_URL="https://${INSTALL}.wpengine.com"
  echo "  [dry-run] Remote URL: ${REMOTE_URL}"
else
  REMOTE_URL=$(ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
    "${INSTALL}@${SSH_HOST}" \
    "cd ${REMOTE_ROOT} && wp option get home --skip-plugins --skip-themes 2>/dev/null" || echo "")
  if [ -z "$REMOTE_URL" ]; then
    echo "  ⚠  Could not get remote URL — will skip search-replace"
    REMOTE_URL=""
  else
    echo "  Remote URL: ${REMOTE_URL}"
  fi
fi

# ── Export remote DB ──────────────────────────────────────────────────────
if ! $UPLOADS_ONLY; then
  echo ""
  echo "▶ Exporting remote database..."
  if $DRY_RUN; then
    echo "  [dry-run] ssh ${INSTALL}@${SSH_HOST} wp db export - > ${BACKUP_FILE}"
  else
    ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
      "${INSTALL}@${SSH_HOST}" \
      "cd ${REMOTE_ROOT} && wp db export --skip-plugins --skip-themes -" \
      > "${BACKUP_FILE}"
    SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    echo "  ✓ Exported: ${BACKUP_FILE} (${SIZE})"
  fi

  # ── Import to local ───────────────────────────────────────────────────────
  echo ""
  echo "▶ Importing to local WordPress..."
  if $DRY_RUN; then
    echo "  [dry-run] wp db import ${BACKUP_FILE} ${LOCAL_WP_ARGS}"
  else
    wp db import "${BACKUP_FILE}" ${LOCAL_WP_ARGS}
    echo "  ✓ Database imported"
  fi

  # ── Search-replace ────────────────────────────────────────────────────────
  if [ -n "$REMOTE_URL" ]; then
    echo ""
    echo "▶ Search-replacing domain: ${REMOTE_URL} → ${LOCAL_URL}"
    if $DRY_RUN; then
      echo "  [dry-run] wp search-replace '${REMOTE_URL}' '${LOCAL_URL}' --dry-run"
    else
      wp search-replace "${REMOTE_URL}" "${LOCAL_URL}" \
        --precise --report-changed-only ${LOCAL_WP_ARGS}
      # Also replace without trailing slash variants
      wp search-replace "${REMOTE_URL%/}" "${LOCAL_URL%/}" \
        --precise --report-changed-only ${LOCAL_WP_ARGS} 2>/dev/null || true
      echo "  ✓ Search-replace complete"
    fi

    echo ""
    echo "▶ Flushing caches..."
    if $DRY_RUN; then
      echo "  [dry-run] wp cache flush && wp rewrite flush"
    else
      wp cache flush ${LOCAL_WP_ARGS} 2>/dev/null || true
      wp rewrite flush ${LOCAL_WP_ARGS} 2>/dev/null || true
      echo "  ✓ Caches flushed"
    fi
  fi
fi

# ── Set remote media URL (no upload sync needed) ─────────────────────────
# Instead of syncing GB of uploads, tell WordPress to load media from the
# remote server directly. wp_options.upload_url_path overrides where WordPress
# looks for uploaded media URLs.
if ! $SKIP_UPLOADS && ! $UPLOADS_ONLY && [ -n "$REMOTE_URL" ]; then
  REMOTE_UPLOADS_URL="${REMOTE_URL%/}/wp-content/uploads"
  echo ""
  echo "▶ Setting remote media URL (skips upload sync)..."
  if $DRY_RUN; then
    echo "  [dry-run] wp option update upload_url_path '${REMOTE_UPLOADS_URL}'"
  else
    wp option update upload_url_path "${REMOTE_UPLOADS_URL}" ${LOCAL_WP_ARGS}
    echo "  ✓ Media loading from: ${REMOTE_UPLOADS_URL}"
    echo "  → To revert: wp option delete upload_url_path"
    SKIP_UPLOADS=true  # rsync not needed — images load from remote
  fi
fi

# ── Sync uploads (opt-in only — upload_url_path is preferred) ────────────────
if ! $SKIP_UPLOADS; then
  echo ""
  echo "▶ Syncing wp-content/uploads (opt-in — upload_url_path is preferred for local dev)..."
  echo "  Tip: omit --uploads-only to use upload_url_path instead (no rsync needed)"
  UPLOADS_SRC="${INSTALL}@${SSH_HOST}:${REMOTE_ROOT}/wp-content/uploads/"
  UPLOADS_DEST="${LOCAL_PATH:-.}/wp-content/uploads/"

  RSYNC_CMD=(
    rsync -avz --progress
    --exclude=".DS_Store"
    -e "ssh -o StrictHostKeyChecking=accept-new -p 22"
    "$UPLOADS_SRC"
    "$UPLOADS_DEST"
  )

  if $DRY_RUN; then
    echo "  [dry-run] ${RSYNC_CMD[*]} --dry-run"
    "${RSYNC_CMD[@]}" --dry-run 2>/dev/null | tail -5
  else
    echo "  Running: ${RSYNC_CMD[*]}"
    "${RSYNC_CMD[@]}" 2>&1 | tail -20
    echo "  ✓ Uploads synced"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "── Pull complete ─────────────────────────────────────────────────"
echo "  From: ${INSTALL} (${ENV}) → ${REMOTE_URL:-unknown}"
echo "  To:   ${LOCAL_URL}"
[ -f "$BACKUP_FILE" ] && echo "  DB backup: ${BACKUP_FILE}"
$DRY_RUN && echo "  (dry-run — no changes made)"
echo ""
echo "  Open: ${LOCAL_URL}/wp-admin"
