# CI Gate — Pre-deploy Verification

## The core policy: CI is the canonical truth

`--no-verify` bypasses local git hooks. **It is forbidden on any branch that feeds a WP Engine deploy.**
The enforcement is two-layered so `--no-verify` has no real effect:

1. **CI gate** — runs on every push to `develop`, `staging`, `main`. Re-runs every check hooks run.
   Required status check. Broken code cannot merge regardless of what happened locally.
2. **Deploy `verify` job** — first job in every deploy workflow. Deploys never start without it.

---

## Two gates: PHP and JS/TS

WordPress projects have two independent quality gates that run in **parallel**:

```
push / PR
   ├── php-gate     → php -l  →  phpcs (WPCS)  →  phpstan
   └── js-gate      → biome ci  →  tsc --noEmit  →  vitest run
            ↓ both must pass
         merge allowed
            ↓
         deploy workflow
            └── verify (reruns both gates)  →  backup  →  push  →  smoke test
```

Both gates are **required status checks** on all protected branches. A failure in either blocks merge.

---

## `ci-gate.yml` — run on every push and PR

```yaml
# .github/workflows/ci-gate.yml
name: CI Gate

on:
  push:
    branches: [develop, staging, main]
  pull_request:
    branches: [develop, staging, main]

concurrency:
  group: ci-${{ github.ref }}-${{ github.workflow }}
  cancel-in-progress: true

jobs:
  # ── PHP gate ────────────────────────────────────────────────────────────────
  php-gate:
    name: PHP gate (syntax · WPCS · PHPStan)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer, phpcs, phpstan
          coverage: none

      - name: Install PHP dependencies
        run: composer install --no-interaction --no-progress --quiet

      - name: PHP syntax lint
        run: |
          find . -name '*.php' \
            -not -path '*/vendor/*' \
            -not -path '*/node_modules/*' \
            | xargs -P4 php -l

      - name: PHPCS — WordPress coding standards
        run: composer run phpcs        # defined in composer.json scripts

      - name: PHPStan — static analysis
        run: composer run phpstan

  # ── JS / TS gate ─────────────────────────────────────────────────────────────
  js-gate:
    name: JS/TS gate (biome · tsc · vitest)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Biome — lint + format (CI strict mode)
        run: npx biome ci .

      - name: TypeScript — type check
        run: npm run typecheck          # or: npx tsc --noEmit

      - name: Unit tests
        run: npm test -- --run         # Vitest; adjust for Jest

      - name: Build assets
        run: npm run build

  # ── Gate summary ─────────────────────────────────────────────────────────────
  gate-passed:
    name: Gate passed
    runs-on: ubuntu-latest
    needs: [php-gate, js-gate]
    steps:
      - run: |
          echo "✅ Both PHP and JS/TS gates passed."
          echo "   Code is verified clean regardless of --no-verify on local push."
```

> **Branch protection**: require `gate-passed` (not the individual jobs) as the required status check.
> This way adding a new language gate later only requires updating `needs:` here, not branch rules.

---

## Deploy workflows — `needs: verify`

The `verify` job in each deploy workflow re-runs both gates inline. A deploy never starts
without them — even on `workflow_dispatch` or an emergency force push.

```yaml
jobs:
  # ── Verify (mirrors both CI gates) ──────────────────────────────────────────
  verify:
    name: Verify — PHP + JS/TS (no-verify cannot skip this)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # PHP
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.2', tools: composer }
      - run: composer install --no-interaction --quiet
      - run: find . -name '*.php' -not -path '*/vendor/*' | xargs -P4 php -l
      - run: composer run phpcs
      - run: composer run phpstan

      # JS/TS
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx biome ci .
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npm run build

  # ── Actual deploy (never runs without verify) ────────────────────────────────
  deploy:
    needs: verify
    ...
```

---

## Git hooks setup

Hooks are the **developer feedback loop**. CI gate is the **enforcer**.
Both must exist and mirror each other.

### `.githooks/pre-push` — no Husky dependency (works for PHP-heavy projects)

```bash
#!/usr/bin/env bash
# .githooks/pre-push
# Activate: git config core.hooksPath .githooks
#           (or: npm run prepare  if package.json has a prepare script for this)
set -uo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

fail() { echo "✗ pre-push blocked: $1" >&2; echo "  Fix it, then re-push. (CI will also catch it.)" >&2; exit 1; }

# ── PHP gate ──────────────────────────────────────────────────────────────────
if command -v composer >/dev/null && [ -x vendor/bin/phpcs ]; then
  echo "→ php -l"
  git ls-files '*.php' | xargs -P4 php -l >/dev/null || fail "PHP syntax error"

  echo "→ phpcs"
  composer run phpcs --quiet || fail "phpcs violations"

  echo "→ phpstan"
  composer run phpstan --quiet || fail "phpstan errors"
  echo "✓ PHP gate green"
else
  echo "⚠  composer/phpcs not installed — run 'composer install'. Skipping PHP gate."
fi

# ── JS/TS gate ────────────────────────────────────────────────────────────────
if [ -x node_modules/.bin/biome ]; then
  echo "→ biome check"
  npx biome check . --quiet || fail "biome lint/format issues (run: npx biome check --write .)"
  echo "✓ JS/TS gate green"
else
  echo "⚠  biome not installed — run 'npm install'. Skipping JS gate."
fi
```

Activate once per clone:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
```

Or add to `package.json`:

```json
"scripts": {
  "prepare": "git config core.hooksPath .githooks 2>/dev/null || true"
}
```

---

## Agent-runnable scripts

Place these in `.githooks/` or a `scripts/` directory so agents can run them directly.

### `scripts/ci-gate.sh` — run the full CI gate locally

Agents can run this before recommending a push. It mirrors both CI jobs exactly.

```bash
#!/usr/bin/env bash
# scripts/ci-gate.sh — run the full CI gate locally before pushing.
# Usage: bash scripts/ci-gate.sh [--php-only] [--js-only]
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

PHP_ONLY=false; JS_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--php-only" ]] && PHP_ONLY=true
  [[ "$arg" == "--js-only"  ]] && JS_ONLY=true
done

PASS=0; FAIL=0
run() {
  echo "▶ $*"
  if "$@"; then echo "  ✓"; ((PASS++)) ; else echo "  ✗ FAILED"; ((FAIL++)); fi
}

if ! $JS_ONLY; then
  echo "── PHP gate ──────────────────────────────────────────────────"
  if command -v composer >/dev/null && [ -x vendor/bin/phpcs ]; then
    run bash -c "git ls-files '*.php' | xargs -P4 php -l >/dev/null"
    run composer run phpcs
    run composer run phpstan
  else
    echo "⚠  composer not installed — skipping PHP gate"
  fi
fi

if ! $PHP_ONLY; then
  echo "── JS/TS gate ────────────────────────────────────────────────"
  if [ -d node_modules ]; then
    run npx biome check .
    run npm run typecheck 2>/dev/null || run npx tsc --noEmit
    run npm test -- --run
    run npm run build
  else
    echo "⚠  node_modules missing — run 'npm install' first"
  fi
fi

echo ""
echo "── Result ────────────────────────────────────────────────────"
echo "  Passed: $PASS  |  Failed: $FAIL"
[[ "$FAIL" -eq 0 ]] && echo "✅ Gate green — safe to push" && exit 0
echo "❌ Gate failed — fix issues before pushing" && exit 1
```

### `scripts/wpe-preflight.sh` — pre-deploy checklist

Agents run this before triggering any WP Engine deploy. Checks SSH access, WP-CLI, and site health.

```bash
#!/usr/bin/env bash
# scripts/wpe-preflight.sh — pre-deploy checklist for WP Engine.
# Usage: INSTALL=mysite bash scripts/wpe-preflight.sh [staging|production]
set -euo pipefail

ENV="${1:-production}"
INSTALL="${WPE_INSTALL:-${INSTALL:-}}"

[ -z "$INSTALL" ] && { echo "❌ Set INSTALL= or WPE_INSTALL= to the WP Engine install slug"; exit 1; }

SSH_HOST="${INSTALL}.ssh.wpengine.net"
FAIL=0
check() { echo "▶ $1"; shift; if "$@" 2>&1 | tail -1; then echo "  ✓"; else echo "  ✗ FAILED"; FAIL=1; fi; }

echo "── WP Engine preflight: ${INSTALL} (${ENV}) ───────────────────"

# SSH connectivity
check "SSH gateway reachable" \
  ssh -o BatchMode=yes -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=accept-new \
      "${INSTALL}@${SSH_HOST}" wp --info

# WordPress core version
check "WP core version" \
  ssh "${INSTALL}@${SSH_HOST}" wp core version --skip-plugins --skip-themes

# Site URL sanity
check "siteurl + home match" bash -c "
  SITEURL=\$(ssh ${INSTALL}@${SSH_HOST} wp option get siteurl --skip-plugins --skip-themes)
  HOME=\$(ssh ${INSTALL}@${SSH_HOST} wp option get home --skip-plugins --skip-themes)
  echo \"siteurl: \$SITEURL\"
  echo \"home:    \$HOME\"
  [[ \"\$SITEURL\" == \"\$HOME\" ]]
"

# No PHP fatal errors on homepage
check "Homepage returns HTTP 2xx/3xx" bash -c "
  URL=\$(ssh ${INSTALL}@${SSH_HOST} wp option get home --skip-plugins --skip-themes)
  STATUS=\$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 \"\$URL\")
  echo \"HTTP \$STATUS\"
  [[ \"\$STATUS\" -ge 200 && \"\$STATUS\" -lt 400 ]]
"

# Active plugin count (sanity — shouldn't be 0)
check "Active plugins present" bash -c "
  COUNT=\$(ssh ${INSTALL}@${SSH_HOST} wp plugin list --status=active --format=count --skip-plugins --skip-themes)
  echo \"\$COUNT active plugins\"
  [[ \"\$COUNT\" -gt 0 ]]
"

echo ""
echo "── Preflight result ──────────────────────────────────────────"
[[ "$FAIL" -eq 0 ]] && echo "✅ All checks passed — safe to deploy" && exit 0
echo "❌ Preflight failed — do not deploy until issues are resolved" && exit 1
```

### `scripts/wpe-check.sh` — SSH connectivity diagnostic

Quick check for every configured WP Engine environment. Agents run this when debugging SSH issues.

```bash
#!/usr/bin/env bash
# scripts/wpe-check.sh — verify SSH access to WP Engine environments.
# Usage: bash scripts/wpe-check.sh
# Reads installs from wp-cli.yml aliases or INSTALLS env var.
set -uo pipefail

# ── Discover installs from wp-cli.yml @aliases ──────────────────────────────
INSTALLS=()
if [ -f wp-cli.yml ]; then
  while IFS= read -r line; do
    # Lines like "@production:" → extract alias, then look for ssh: field
    if [[ "$line" =~ ^@([a-zA-Z0-9_-]+): ]]; then
      CURRENT_ALIAS="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^[[:space:]]+ssh:[[:space:]]+([^@]+)@ ]]; then
      INSTALL="${BASH_REMATCH[1]}"
      INSTALLS+=("$INSTALL:$CURRENT_ALIAS")
    fi
  done < wp-cli.yml
fi

# Fallback: check INSTALLS env var (space-separated slugs)
if [ ${#INSTALLS[@]} -eq 0 ] && [ -n "${WPE_INSTALLS:-}" ]; then
  for slug in $WPE_INSTALLS; do
    INSTALLS+=("$slug:$slug")
  done
fi

[ ${#INSTALLS[@]} -eq 0 ] && {
  echo "No installs found. Add @aliases with 'ssh:' to wp-cli.yml or set WPE_INSTALLS='slug1 slug2'"
  exit 1
}

echo "── WP Engine SSH connectivity check ──────────────────────────"
PASS=0; FAIL=0

for entry in "${INSTALLS[@]}"; do
  INSTALL="${entry%%:*}"
  ALIAS="${entry##*:}"
  SSH_HOST="${INSTALL}.ssh.wpengine.net"
  printf "  %-20s (%s) ... " "$INSTALL" "@$ALIAS"

  if ssh -o BatchMode=yes -o ConnectTimeout=8 \
         -o StrictHostKeyChecking=accept-new \
         "${INSTALL}@${SSH_HOST}" wp core version \
         --skip-plugins --skip-themes 2>/dev/null; then
    echo "✓"
    ((PASS++))
  else
    echo "✗  — check key at ~/.ssh/wpengine_ed25519 and portal SSH Keys"
    ((FAIL++))
  fi
done

echo ""
echo "  $PASS connected  |  $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
```

---

## Branch protection

Configure in **GitHub → Settings → Branches**:

### `develop`
```
✅ Require status checks: gate-passed
✅ Require branches to be up to date
```

### `staging`
```
✅ Require pull request (1 reviewer)
✅ Dismiss stale reviews on new commits
✅ Require status checks: gate-passed
✅ Require branches to be up to date
✅ Do not allow bypassing the above settings
```

### `main`
```
✅ Require pull request (2 reviewers)
✅ Dismiss stale reviews on new commits
✅ Require status checks: gate-passed, staging-source-check
✅ Require branches to be up to date
✅ Do not allow force pushes
✅ Do not allow deletions
✅ Do not allow bypassing the above settings  ← admins cannot override
```

> Use `gate-passed` (the summary job), not `php-gate` / `js-gate` individually.
> Branch protection rule names are matched by job name — if you rename a job, update the rule.

---

## What `--no-verify` bypasses (and what it doesn't)

| Check | `--no-verify` | CI gate | Deploy `verify` job |
|---|---|---|---|
| pre-commit hook | ❌ skipped | ✅ runs | ✅ runs |
| pre-push hook | ❌ skipped | ✅ runs | ✅ runs |
| `gate-passed` status check | ✅ runs | ✅ runs | ✅ runs |
| Branch protection | ✅ blocks | ✅ blocks | ✅ blocks |
| Deploy starts | — | — | ✅ blocked until verify passes |

**Result:** `--no-verify` only removes the developer's fast local feedback loop.
Every check still runs in CI and in the deploy workflow. The only consequence is
slower feedback — not a path to deploying broken code.

---

## Project type matrix

Adjust which gates run based on the project (from `wp-project-triage` output):

| Project type | PHP gate | JS/TS gate | Build step |
|---|---|---|---|
| Classic plugin (PHP only) | ✅ | ❌ | ❌ |
| Block plugin (PHP + JS) | ✅ | ✅ | ✅ `npm run build` |
| Block theme | ✅ | ✅ | ✅ `npm run build` |
| Headless / full JS | ❌ | ✅ | ✅ `npm run build` |
| Monorepo (wp-agent-os style) | ✅ | ✅ per package | ✅ per package |

For PHP-only projects, remove the `js-gate` job from `ci-gate.yml` and the JS section from the `verify` job.
The `gate-passed` job only needs to reference `needs: [php-gate]`.
