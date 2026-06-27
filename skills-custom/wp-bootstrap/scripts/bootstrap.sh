#!/usr/bin/env bash
# bootstrap.sh — one-command dev setup for a WordPress project or monorepo.
#
# Generalized from the wp-agent-os tools/setup.sh pattern. Idempotent: safe
# to re-run on an existing clone. Activates git hooks, installs PHP and JS
# dependencies, and verifies the environment.
#
# Usage:
#   bash .agents/skills/wp-bootstrap/scripts/bootstrap.sh [OPTIONS]
#
# Options:
#   --php-only     Skip JS workspace installs
#   --js-only      Skip PHP/Composer installs
#   --no-hooks     Skip git hook activation
#   --quiet        Minimal output
#
# Reads wp-bootstrap.config.json from repo root if present:
#   {
#     "packageManager": "pnpm",
#     "jsWorkspaces": ["design-system", "backend", "web", "tools/e2e"],
#     "phpDirs": [".", "wpaos"],
#     "hooksDir": ".githooks"
#   }

set -uo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

PHP_ONLY=false; JS_ONLY=false; NO_HOOKS=false; QUIET=false
for arg in "$@"; do
  case "$arg" in
    --php-only) PHP_ONLY=true ;;
    --js-only)  JS_ONLY=true ;;
    --no-hooks) NO_HOOKS=true ;;
    --quiet)    QUIET=true ;;
  esac
done

OK=0; WARN=0
say()  { $QUIET || printf '\n\033[1m→ %s\033[0m\n' "$*"; }
good() { $QUIET || printf '  \033[32m✓\033[0m %s\n' "$*"; ((OK++)); }
nope() { printf '  \033[33m⚠\033[0m %s\n' "$*" >&2; ((WARN++)); }

# ── Read optional config ──────────────────────────────────────────────────────
CONFIG_FILE="$root/wp-bootstrap.config.json"
if [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
  PKG_MGR=$(node -e "process.stdout.write(require('$CONFIG_FILE').packageManager ?? '')")
  HOOKS_DIR=$(node -e "process.stdout.write(require('$CONFIG_FILE').hooksDir ?? '.githooks')")
  JS_WS=$(node -e "console.log((require('$CONFIG_FILE').jsWorkspaces ?? []).join('\n'))")
  PHP_DIRS=$(node -e "console.log((require('$CONFIG_FILE').phpDirs ?? ['.']).join('\n'))")
else
  # Auto-detect
  if [ -f "pnpm-lock.yaml" ] || [ -f "pnpm-workspace.yaml" ]; then PKG_MGR="pnpm"
  elif [ -f "yarn.lock" ]; then PKG_MGR="yarn"
  else PKG_MGR="npm"; fi

  HOOKS_DIR=".githooks"
  [ -d ".husky" ] && HOOKS_DIR=".husky"

  # Discover JS workspaces from pnpm-workspace.yaml
  if [ -f "pnpm-workspace.yaml" ] && command -v node >/dev/null 2>&1; then
    JS_WS=$(node -e "
      const fs = require('fs');
      const yaml = fs.readFileSync('pnpm-workspace.yaml','utf-8');
      const pkgs = [...yaml.matchAll(/[-]\\s+['\"]?([^'\"#\\n]+)['\"]?/g)].map(m=>m[1].trim().replace(/\/\*\$/,''));
      pkgs.filter(p=>fs.existsSync(p)).forEach(p=>console.log(p));
    " 2>/dev/null || echo "")
  else
    JS_WS=""
  fi

  # Discover PHP dirs (any dir with its own composer.json)
  PHP_DIRS="."
  while IFS= read -r -d '' composer_file; do
    dir="$(dirname "${composer_file#./}")"
    [ "$dir" != "." ] && PHP_DIRS="$PHP_DIRS
$dir"
  done < <(find . -maxdepth 3 -name "composer.json" \
    -not -path "*/vendor/*" -not -path "*/node_modules/*" -print0)
fi

# ── 1. Git hooks ──────────────────────────────────────────────────────────────
if ! $NO_HOOKS; then
  say "Activating git hooks (${HOOKS_DIR}/)"
  if git rev-parse --git-dir >/dev/null 2>&1; then
    if [ -d "$HOOKS_DIR" ]; then
      git config core.hooksPath "$HOOKS_DIR"
      chmod +x "$HOOKS_DIR"/* 2>/dev/null || true
      good "core.hooksPath = $HOOKS_DIR ($(ls "$HOOKS_DIR" | grep -v README | tr '\n' ' '))"
    else
      nope "$HOOKS_DIR not found — create it and add a pre-push script"
    fi
  else
    nope "Not a git repo — skipping hook activation"
  fi
fi

# ── 2. PHP dependencies ───────────────────────────────────────────────────────
if ! $JS_ONLY && command -v composer >/dev/null 2>&1; then
  while IFS= read -r php_dir; do
    [ -z "$php_dir" ] && continue
    [ ! -f "$root/$php_dir/composer.json" ] && continue
    say "Composer install ($php_dir)"
    if ( cd "$root/$php_dir" && composer install --no-interaction --quiet ); then
      good "$php_dir: composer deps installed"
    else
      nope "$php_dir: composer install failed"
    fi
  done <<< "$PHP_DIRS"
elif ! $JS_ONLY; then
  nope "composer not found — install Composer (https://getcomposer.org), then re-run"
fi

# ── 3. JS dependencies ────────────────────────────────────────────────────────
if ! $PHP_ONLY; then
  if ! command -v "$PKG_MGR" >/dev/null 2>&1; then
    nope "$PKG_MGR not found — install it, then re-run"
  else
    # Root package.json first
    if [ -f "$root/package.json" ]; then
      say "JS install root ($PKG_MGR)"
      if ( cd "$root" && "$PKG_MGR" install --silent 2>/dev/null || "$PKG_MGR" install ); then
        good "root: JS deps installed"
      else
        nope "root: $PKG_MGR install failed"
      fi
    fi

    # Workspaces (if not handled by root install)
    if [ -n "$JS_WS" ] && [ "$PKG_MGR" = "npm" ]; then
      while IFS= read -r ws; do
        [ -z "$ws" ] && continue
        [ ! -f "$root/$ws/package.json" ] && continue
        say "JS install $ws"
        if ( cd "$root/$ws" && npm install --silent ); then
          good "$ws: npm deps installed"
        else
          nope "$ws: npm install failed"
        fi
      done <<< "$JS_WS"
    fi
  fi
fi

# ── 4. Summary ────────────────────────────────────────────────────────────────
say "Bootstrap complete"
echo "  PHP gate:  composer fix && composer phpcs && composer phpstan"
echo "  JS gate:   ${PKG_MGR} run lint && ${PKG_MGR} test"
echo "  Full gate: ${PKG_MGR} run gate (if configured)"
[ "$WARN" -gt 0 ] && echo "  ⚠  $WARN warning(s) above — fix them, then re-run."
exit 0
