#!/usr/bin/env bash
# playground-start.sh — boot an interactive WordPress Playground with local plugins/themes.
#
# Generalized from wp-agent-os tools/playground/run-playground.sh.
# Reads wp-bootstrap.config.json for mount configuration, or auto-detects
# WP packages via detect-structure.mjs.
#
# Usage:
#   bash .agents/skills/wp-bootstrap/scripts/playground-start.sh [OPTIONS]
#
# Options:
#   --port=<port>       Port (default: 9400)
#   --site-url=<url>    Override WordPress site URL (WSL: use wsl.localhost:<port>)
#   --blueprint=<file>  Blueprint JSON file (default: auto-detect or minimal)
#   --no-login          Don't auto-login as admin
#   --api-mode          Enable Application Password mode (for backend integration)
#   --no-build          Skip build step
#
# Environment:
#   WPAOS_PG_PORT       Port override
#   WPAOS_PG_SITE_URL   Site URL override (useful for WSL)
#   WPAOS_PG_API_MODE   Set to 1 for Application Password auth mode

set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

PORT="${WPAOS_PG_PORT:-9400}"
SITE_URL="${WPAOS_PG_SITE_URL:-}"
BLUEPRINT=""
NO_LOGIN=false
API_MODE="${WPAOS_PG_API_MODE:-0}"
NO_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --port=*)      PORT="${arg#--port=}" ;;
    --site-url=*)  SITE_URL="${arg#--site-url=}" ;;
    --blueprint=*) BLUEPRINT="${arg#--blueprint=}" ;;
    --no-login)    NO_LOGIN=true ;;
    --api-mode)    API_MODE=1 ;;
    --no-build)    NO_BUILD=true ;;
  esac
done

SITE_URL="${SITE_URL:-http://127.0.0.1:${PORT}}"

# ── Detect WP packages for --mount args ───────────────────────────────────────
DETECT_SCRIPT="$(dirname "$0")/detect-structure.mjs"
MOUNTS=()
PKG_TYPES=()

if command -v node >/dev/null 2>&1 && [ -f "$DETECT_SCRIPT" ]; then
  STRUCT=$(node "$DETECT_SCRIPT" "$root" 2>/dev/null)

  while IFS=$'\t' read -r pkg_path pkg_type pkg_slug; do
    [ -z "$pkg_path" ] && continue
    case "$pkg_type" in
      plugin) MOUNTS+=("--mount=$root/$pkg_path:/wordpress/wp-content/plugins/$pkg_slug") ;;
      theme)  MOUNTS+=("--mount=$root/$pkg_path:/wordpress/wp-content/themes/$pkg_slug") ;;
    esac
    PKG_TYPES+=("$pkg_type:$pkg_slug ($pkg_path)")
  done < <(echo "$STRUCT" | node -e "
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      const r = JSON.parse(chunks.join(''));
      r.wpPackages.forEach(p => process.stdout.write(p.path + '\t' + p.type + '\t' + (p.slug ?? '') + '\n'));
    });
  " 2>/dev/null)
else
  # Fallback: manual mount from config or ask user
  CONFIG_FILE="$root/wp-bootstrap.config.json"
  if [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    while IFS= read -r mount; do
      MOUNTS+=("--mount=$mount")
    done < <(node -e "
      const c = require('$CONFIG_FILE');
      (c.playgroundMounts ?? []).forEach(m => console.log(m));
    " 2>/dev/null)
  fi
fi

if [ "${#MOUNTS[@]}" -eq 0 ]; then
  echo "⚠  No WP packages detected. Add wp-bootstrap.config.json or run from a repo with plugins/themes."
  echo "   Booting plain WordPress Playground..."
fi

# ── Auto-detect or build blueprint ────────────────────────────────────────────
if [ -z "$BLUEPRINT" ]; then
  # Look for a blueprint in common locations
  for candidate in \
    "tools/playground/playground-blueprint.json" \
    "tools/playground/blueprint.json" \
    "blueprint.json" \
    "playground/blueprint.json"; do
    if [ -f "$root/$candidate" ]; then
      BLUEPRINT="$root/$candidate"
      break
    fi
  done
fi

# ── Run build if needed ───────────────────────────────────────────────────────
if ! $NO_BUILD && [ -f "$root/package.json" ]; then
  PKG_MGR="npm"; [ -f "pnpm-lock.yaml" ] && PKG_MGR="pnpm"
  if grep -q '"build"' "$root/package.json" 2>/dev/null; then
    echo "▶ Building before starting Playground..."
    "$PKG_MGR" run build >/dev/null 2>&1 || echo "  ⚠  Build step failed — using current files"
  fi
fi

# ── Print info ────────────────────────────────────────────────────────────────
echo ""
echo "── WordPress Playground ────────────────────────────────────────"
echo "  Mounting:"
for m in "${PKG_TYPES[@]-}"; do echo "    $m"; done
echo ""
echo "  Open:      $SITE_URL"
echo "  wp-admin:  $SITE_URL/wp-admin"
echo "  REST API:  $SITE_URL/wp-json"
echo ""
echo "  WSL tip: if styles look broken, try:"
echo "    WPAOS_PG_SITE_URL=http://wsl.localhost:${PORT} bash $0"
echo ""
echo "  Ctrl-C to stop."
echo ""

# ── Build CLI args ────────────────────────────────────────────────────────────
ARGS=(server)
ARGS+=("${MOUNTS[@]-}")
[ -n "$BLUEPRINT" ] && ARGS+=("--blueprint=$BLUEPRINT")
ARGS+=("--port=$PORT")
ARGS+=("--site-url=$SITE_URL")
ARGS+=("--workers=1")

if [ "$API_MODE" = "1" ]; then
  mkdir -p "$root/.wp-dev"
  ARGS+=("--mount=$root/.wp-dev:/wordpress/wp-content/wp-dev")
  echo "  API mode: Application Password will be written to .wp-dev/app-password.txt"
else
  if ! $NO_LOGIN; then
    ARGS+=("--internal-cookie-store" "--login")
  fi
fi

# ── Launch ────────────────────────────────────────────────────────────────────
exec pnpm dlx @wp-playground/cli@latest "${ARGS[@]}"
