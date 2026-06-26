#!/usr/bin/env bash
# ci-gate.sh — run the full CI gate locally before pushing.
#
# Mirrors what GitHub Actions ci-gate.yml runs. Use this before any push
# to a branch that triggers a WP Engine deploy.
#
# Usage:
#   bash scripts/ci-gate.sh              # run both gates
#   bash scripts/ci-gate.sh --php-only   # PHP gate only
#   bash scripts/ci-gate.sh --js-only    # JS/TS gate only
#
# Exit code: 0 = all passed, 1 = at least one check failed.

set -uo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

PHP_ONLY=false
JS_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--php-only" ]] && PHP_ONLY=true
  [[ "$arg" == "--js-only" ]] && JS_ONLY=true
done

PASS=0
FAIL=0

run() {
  local label="$1"; shift
  echo "▶ $label"
  if "$@" 2>&1; then
    echo "  ✓ $label"
    ((PASS++))
  else
    echo "  ✗ FAILED: $label"
    ((FAIL++))
    return 1
  fi
}

# ── PHP gate ──────────────────────────────────────────────────────────────────
if ! $JS_ONLY; then
  echo ""
  echo "── PHP gate ──────────────────────────────────────────────────────────"
  if command -v composer >/dev/null 2>&1 && [ -f composer.json ]; then
    if [ ! -d vendor ]; then
      echo "▶ composer install"
      composer install --no-interaction --quiet
    fi

    run "php -l (all tracked PHP files)" \
      bash -c 'git ls-files "*.php" | xargs -P4 php -l > /dev/null'

    if [ -x vendor/bin/phpcs ]; then
      run "phpcs (WordPress coding standards)" composer run phpcs
    else
      echo "  ⚠  phpcs not found — run: composer install"
    fi

    if [ -x vendor/bin/phpstan ]; then
      run "phpstan (static analysis)" composer run phpstan
    else
      echo "  ⚠  phpstan not found — run: composer install"
    fi
  else
    echo "  ⚠  composer not available or no composer.json — skipping PHP gate"
  fi
fi

# ── JS/TS gate ────────────────────────────────────────────────────────────────
if ! $PHP_ONLY; then
  echo ""
  echo "── JS/TS gate ────────────────────────────────────────────────────────"
  if [ -f package.json ]; then
    if [ ! -d node_modules ]; then
      echo "▶ npm install"
      npm install --silent
    fi

    if [ -x node_modules/.bin/biome ]; then
      run "biome check (lint + format)" npx biome check .
    else
      echo "  ⚠  biome not installed — run: npm install"
    fi

    if npm run typecheck --if-present 2>/dev/null; then
      ((PASS++))
    elif command -v tsc >/dev/null 2>&1 || [ -x node_modules/.bin/tsc ]; then
      run "tsc --noEmit (type check)" npx tsc --noEmit
    fi

    if npm run test --if-present 2>/dev/null; then
      ((PASS++))
    fi

    if npm run build --if-present 2>/dev/null; then
      ((PASS++))
    fi
  else
    echo "  ⚠  No package.json — skipping JS/TS gate"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── CI Gate Result ────────────────────────────────────────────────────"
echo "  Passed : $PASS"
echo "  Failed : $FAIL"
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ Gate green — safe to push."
  exit 0
else
  echo "❌ Gate failed — fix the issues above before pushing."
  echo "   --no-verify is not a valid workaround; CI will catch the same failures."
  exit 1
fi
