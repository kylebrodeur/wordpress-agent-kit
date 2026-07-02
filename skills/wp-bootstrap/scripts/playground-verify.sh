#!/usr/bin/env bash
# playground-verify.sh — headless WordPress Playground verification.
#
# Boots WordPress with all local plugins/themes, runs a PHP verification
# script, and writes result.json. No browser, no Docker.
#
# Generalized from wp-agent-os tools/playground/run-local-verify.sh.
#
# Usage:
#   bash .agents/skills/wp-bootstrap/scripts/playground-verify.sh [OPTIONS]
#
# Options:
#   --verify-php=<file>   PHP verification script to run (default: auto-detect)
#   --blueprint=<file>    Blueprint JSON (default: minimal verify blueprint)
#   --result=<file>       Output JSON file (default: playground-verify-result.json)
#   --no-build            Skip build step

set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

VERIFY_PHP=""
BLUEPRINT=""
RESULT_FILE="playground-verify-result.json"
NO_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --verify-php=*)  VERIFY_PHP="${arg#--verify-php=}" ;;
    --blueprint=*)   BLUEPRINT="${arg#--blueprint=}" ;;
    --result=*)      RESULT_FILE="${arg#--result=}" ;;
    --no-build)      NO_BUILD=true ;;
  esac
done

DETECT_SCRIPT="$(dirname "$0")/detect-structure.mjs"

# ── Build ─────────────────────────────────────────────────────────────────────
if ! $NO_BUILD && [ -f "$root/package.json" ]; then
  PKG_MGR="npm"; [ -f "pnpm-lock.yaml" ] && PKG_MGR="pnpm"
  if grep -q '"build"' "$root/package.json" 2>/dev/null; then
    echo "▶ Building before verify..."
    "$PKG_MGR" run build >/dev/null 2>&1 || echo "  ⚠  Build failed — verifying current files"
    # Also build:blocks if available
    if grep -q '"build:blocks"' "$root/package.json" 2>/dev/null; then
      "$PKG_MGR" run build:blocks >/dev/null 2>&1 || true
    fi
  fi
fi

# ── Detect mounts ────────────────────────────────────────────────────────────
MOUNTS=()
if command -v node >/dev/null 2>&1 && [ -f "$DETECT_SCRIPT" ]; then
  STRUCT=$(node "$DETECT_SCRIPT" "$root" 2>/dev/null)
  while IFS=$'\t' read -r pkg_path pkg_type pkg_slug; do
    [ -z "$pkg_path" ] && continue
    case "$pkg_type" in
      plugin) MOUNTS+=("--mount=$root/$pkg_path:/wordpress/wp-content/plugins/$pkg_slug") ;;
      theme)  MOUNTS+=("--mount=$root/$pkg_path:/wordpress/wp-content/themes/$pkg_slug") ;;
    esac
  done < <(echo "$STRUCT" | node -e "
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      const r = JSON.parse(chunks.join(''));
      r.wpPackages.forEach(p => process.stdout.write(p.path + '\t' + p.type + '\t' + (p.slug ?? '') + '\n'));
    });
  " 2>/dev/null)
fi

# ── Find or build verify PHP ──────────────────────────────────────────────────
VERIFY_MOUNT=""
if [ -z "$VERIFY_PHP" ]; then
  for candidate in \
    "tools/playground/verify.php" \
    "tools/verify.php" \
    "playground/verify.php"; do
    if [ -f "$root/$candidate" ]; then
      VERIFY_PHP="$root/$candidate"
      break
    fi
  done
fi

if [ -n "$VERIFY_PHP" ]; then
  VERIFY_DIR="$(dirname "$VERIFY_PHP")"
  VERIFY_MOUNT="--mount=$VERIFY_DIR:/wordpress/wp-content/pgwork"
fi

# ── Find or create blueprint ──────────────────────────────────────────────────
BLUEPRINT_FILE=""
if [ -n "$BLUEPRINT" ]; then
  BLUEPRINT_FILE="$BLUEPRINT"
elif [ -n "$VERIFY_PHP" ]; then
  # Auto-detect verify blueprint
  for candidate in \
    "tools/playground/verify-blueprint.json" \
    "tools/verify-blueprint.json"; do
    if [ -f "$root/$candidate" ]; then
      BLUEPRINT_FILE="$root/$candidate"
      break
    fi
  done
fi

if [ -z "$BLUEPRINT_FILE" ]; then
  # Create a minimal verify blueprint inline
  BLUEPRINT_FILE="/tmp/wp-bootstrap-verify-blueprint-$$.json"
  PLUGIN_STEPS=""
  if command -v node >/dev/null 2>&1 && [ -f "$DETECT_SCRIPT" ]; then
    STRUCT=$(node "$DETECT_SCRIPT" "$root" 2>/dev/null)
    PLUGIN_STEPS=$(echo "$STRUCT" | node -e "
      const chunks = [];
      process.stdin.on('data', c => chunks.push(c));
      process.stdin.on('end', () => {
        const r = JSON.parse(chunks.join(''));
        const steps = r.wpPackages
          .filter(p => p.type === 'plugin')
          .map(p => JSON.stringify({ step: 'activatePlugin', pluginPath: p.slug + '/' + p.mainFile }));
        process.stdout.write(steps.join(','));
      });
    " 2>/dev/null)
  fi

  PHP_STEP=""
  if [ -n "$VERIFY_PHP" ]; then
    PHP_STEP='{"step":"runPHP","code":"<?php require \"/wordpress/wp-content/pgwork/$(basename "$VERIFY_PHP")\";"},'
  fi

  cat > "$BLUEPRINT_FILE" << BLUEPRINT_EOF
{
  "\$schema": "https://playground.wordpress.net/blueprint-schema.json",
  "steps": [
    ${PLUGIN_STEPS:+${PLUGIN_STEPS},}
    ${PHP_STEP}
    {"step":"runPHP","code":"<?php echo json_encode(['verify'=>true,'wp_version'=>get_bloginfo('version'),'active_plugins'=>get_option('active_plugins')]);"}
  ]
}
BLUEPRINT_EOF
  trap "rm -f $BLUEPRINT_FILE" EXIT
fi

# ── Run verify ────────────────────────────────────────────────────────────────
echo "▶ Running headless Playground verify..."
echo "  Blueprint: $(basename "$BLUEPRINT_FILE")"
echo "  Mounts: ${#MOUNTS[@]} WP package(s)"
[ -n "$VERIFY_PHP" ] && echo "  Verify script: $(basename "$VERIFY_PHP")"

rm -f "$RESULT_FILE"

pnpm dlx @wp-playground/cli@latest run-blueprint \
  --blueprint="$BLUEPRINT_FILE" \
  ${VERIFY_MOUNT:+"$VERIFY_MOUNT"} \
  "${MOUNTS[@]-}" \
  --verbosity=quiet

if [ -f "$RESULT_FILE" ]; then
  echo ""
  echo "=== $RESULT_FILE ==="
  cat "$RESULT_FILE"
  echo ""
  echo "✅ Verify complete"
else
  echo "⚠  result.json not written — verify your PHP script outputs to a mounted path"
fi
