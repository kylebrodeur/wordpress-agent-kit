#!/usr/bin/env bash
# package-wp.sh — build and zip WordPress plugins/themes for upload to a live site.
#
# Generalized from the wp-agent-os tools/package-plugins.sh pattern.
# Reads wp-bootstrap.config.json for package list, or auto-detects from detect-structure.mjs.
#
# Usage:
#   bash .agents/skills/wp-bootstrap/scripts/package-wp.sh [OPTIONS]
#   bash .agents/skills/wp-bootstrap/scripts/package-wp.sh --package=wpaos
#   bash .agents/skills/wp-bootstrap/scripts/package-wp.sh --out=./release
#
# Options:
#   --package=<dir>   Package only this directory (default: all WP packages)
#   --out=<dir>       Output directory (default: dist-plugins/)
#   --no-build        Skip build step before packaging
#   --version=<ver>   Override version string in zip filename
#   --dry-run         Show what would be packaged without doing it
#
# Excludes dev-only files from the zip:
#   bin/ tests/ AGENTS.md .pi/ blueprint.json *.md (except readme.txt)
#   composer.json (dev-only — plugins should have no runtime Composer deps)
#   node_modules/ vendor/ .DS_Store
#
# After packaging: upload both zips to wp-admin → Plugins → Add New → Upload.
# Order: wpaos-blocks (or generated plugin) first, then the companion plugin.

set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

PACKAGE_FILTER=""
OUT_DIR="dist-plugins"
NO_BUILD=false
DRY_RUN=false
VERSION_OVERRIDE=""

for arg in "$@"; do
  case "$arg" in
    --package=*)   PACKAGE_FILTER="${arg#--package=}" ;;
    --out=*)       OUT_DIR="${arg#--out=}" ;;
    --no-build)    NO_BUILD=true ;;
    --version=*)   VERSION_OVERRIDE="${arg#--version=}" ;;
    --dry-run)     DRY_RUN=true ;;
  esac
done

# ── Detect WP packages ────────────────────────────────────────────────────────
DETECT_SCRIPT="$(dirname "$0")/detect-structure.mjs"
PACKAGES=()

if command -v node >/dev/null 2>&1 && [ -f "$DETECT_SCRIPT" ]; then
  while IFS= read -r line; do
    PACKAGES+=("$line")
  done < <(node "$DETECT_SCRIPT" "$root" | node -e "
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      const r = JSON.parse(chunks.join(''));
      r.wpPackages.forEach(p => console.log(p.path));
    });
  " 2>/dev/null)
else
  # Fallback: look for directories with Plugin Name: or Theme Name: in a PHP file
  while IFS= read -r dir; do
    [ -n "$dir" ] && PACKAGES+=("$dir")
  done < <(find . -maxdepth 2 -name "*.php" -not -path "*/vendor/*" -not -path "*/node_modules/*" \
    -exec grep -l "Plugin Name:\|Theme Name:" {} \; 2>/dev/null \
    | xargs -I{} dirname {} | sort -u | sed 's|^\./||')
fi

[ "${#PACKAGES[@]}" -eq 0 ] && { echo "❌ No WordPress packages found. Run from repo root or specify --package=<dir>."; exit 1; }

# Filter if --package specified
if [ -n "$PACKAGE_FILTER" ]; then
  PACKAGES=("$PACKAGE_FILTER")
fi

# ── Run build step first ──────────────────────────────────────────────────────
if ! $NO_BUILD && ! $DRY_RUN; then
  echo "▶ Running build before packaging..."
  CONFIG_FILE="$root/wp-bootstrap.config.json"
  if [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    BUILD_CMD=$(node -e "process.stdout.write(require('$CONFIG_FILE').buildCommand ?? '')" 2>/dev/null)
  fi
  BUILD_CMD="${BUILD_CMD:-}"

  if [ -n "$BUILD_CMD" ]; then
    echo "  $BUILD_CMD"
    eval "$BUILD_CMD"
  elif [ -f "package.json" ]; then
    if grep -q '"build"' package.json; then
      PKG_MGR="npm"
      [ -f "pnpm-lock.yaml" ] && PKG_MGR="pnpm"
      $PKG_MGR run build 2>/dev/null || echo "  ⚠  build step failed — packaging current files"
    fi
  fi
fi

# ── Package each WP plugin/theme ──────────────────────────────────────────────
[ -d "$OUT_DIR" ] || mkdir -p "$OUT_DIR"

EXCLUDE=(
  -x '*/bin/*'
  -x '*/tests/*'
  -x '*/test/*'
  -x '*/AGENTS.md'
  -x '*/.pi/*'
  -x '*/blueprint.json'
  -x '*/.DS_Store'
  -x '*/node_modules/*'
  -x '*/vendor/*'
  -x '*/.git/*'
  -x '*/coverage/*'
  -x '*/.env'
  -x '*/phpunit.xml'
  -x '*/phpcs.xml*'
  -x '*/phpstan.neon*'
  -x '*/biome.json'
  -x '*/tsconfig.json'
  -x '*/vitest.config*'
  -x '*/package-lock.json'
  -x '*/pnpm-lock.yaml'
)

PACKAGED=()

for pkg_dir in "${PACKAGES[@]}"; do
  [ ! -d "$root/$pkg_dir" ] && { echo "  ⚠  $pkg_dir not found — skipping"; continue; }

  # Get version from Plugin Name / Theme file
  VERSION="$VERSION_OVERRIDE"
  if [ -z "$VERSION" ]; then
    # Try plugin header
    MAIN_PHP=$(find "$root/$pkg_dir" -maxdepth 1 -name "*.php" | head -1)
    if [ -n "$MAIN_PHP" ]; then
      VERSION=$(grep -i "Version:" "$MAIN_PHP" | head -1 | sed 's/.*Version: *//' | tr -d '[:space:]') || true
    fi
    # Try style.css (theme)
    if [ -z "$VERSION" ] && [ -f "$root/$pkg_dir/style.css" ]; then
      VERSION=$(grep -i "Version:" "$root/$pkg_dir/style.css" | head -1 | sed 's/.*Version: *//' | tr -d '[:space:]') || true
    fi
    # Try package.json
    if [ -z "$VERSION" ] && [ -f "$root/$pkg_dir/package.json" ] && command -v node >/dev/null 2>&1; then
      VERSION=$(node -e "process.stdout.write(require('$root/$pkg_dir/package.json').version ?? '')" 2>/dev/null) || true
    fi
    VERSION="${VERSION:-unknown}"
  fi

  SLUG="$(basename "$pkg_dir")"
  ZIP_FILE="$OUT_DIR/${SLUG}-${VERSION}.zip"

  if $DRY_RUN; then
    echo "  [dry-run] Would package: $pkg_dir → $ZIP_FILE"
  else
    echo "▶ Packaging $pkg_dir (v$VERSION) → $ZIP_FILE"
    ( cd "$root" && zip -rq "$ZIP_FILE" "$pkg_dir" "${EXCLUDE[@]}" )
    SIZE=$(du -sh "$ZIP_FILE" | cut -f1)
    echo "  ✓ $ZIP_FILE ($SIZE)"
    PACKAGED+=("$ZIP_FILE")
  fi
done

echo ""
if $DRY_RUN; then
  echo "Dry run complete. No files created."
else
  echo "Packaged ${#PACKAGED[@]} artifact(s) in $OUT_DIR/:"
  ls -lh "$OUT_DIR/"
  echo ""
  echo "Upload order: generated/blocks plugin first, then companion plugin."
  echo "wp-admin → Plugins → Add New → Upload Plugin"
  echo "Or with WP-CLI:  wp plugin install <file.zip> --activate"
fi
