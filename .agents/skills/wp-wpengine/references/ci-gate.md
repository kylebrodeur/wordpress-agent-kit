# CI Gate — Pre-deploy Verification

## The core policy: CI is the canonical truth

`--no-verify` bypasses local git hooks. **It is forbidden on any branch that feeds a WP Engine deploy.**
There is no legitimate reason to skip hooks on a protected branch — if hooks are failing,
fix the problem before pushing.

The enforcement has two layers:

```
Layer 1 — Local (hooks)          Layer 2 — GitHub Actions (CI gate)
─────────────────────────────    ──────────────────────────────────────
pre-commit:                      ci-gate.yml runs on every push:
  lint (check-only)                → same lint
  typecheck                        → same typecheck
                                   → format check
pre-push:                          → full test suite
  typecheck                        → build verification
  lint (check-only)                → (PHP: phpcs, phpstan, php -l)
  full test suite
  build

If --no-verify skips layer 1 → layer 2 runs in CI regardless.
If layer 2 fails → branch protection blocks the PR.
If somehow a commit lands on main/staging/develop without CI → the deploy
workflow runs ci-gate as its first job and aborts before touching WP Engine.
```

No deploy ever runs without both layers clearing. The only way to deploy broken
code is to have broken CI *and* to have disabled branch protection — both would
require deliberate, auditable action by a repo admin.

---

## Required GitHub Actions workflows

### `ci-gate.yml` — runs on every push and PR

This is the single required status check. **Branch protection must list
`ci-gate / full-check` as required for `develop`, `staging`, and `main`.**

```yaml
# .github/workflows/ci-gate.yml
name: CI Gate

on:
  push:
    branches: [develop, staging, main]
  pull_request:
    branches: [develop, staging, main]

jobs:
  full-check:
    name: Full check (mirrors hooks — no-verify cannot skip this)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # ── Node / JS ──────────────────────────────────────────────────────────
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install JS dependencies
        run: npm ci

      - name: Format check
        run: npm run format:check

      - name: JS/CSS lint
        run: npm run lint

      - name: TypeScript / type check
        run: npm run check          # or: npx tsc --noEmit

      - name: JS tests
        run: npm test -- --run      # Vitest, Jest, etc.

      - name: Build assets
        run: npm run build

      # ── PHP ────────────────────────────────────────────────────────────────
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer, phpcs, phpstan

      - name: Install PHP dependencies
        run: composer install --no-dev --prefer-dist --quiet

      - name: PHP syntax lint
        run: |
          find . -name "*.php" \
            -not -path "*/vendor/*" \
            -not -path "*/node_modules/*" \
            | xargs -P4 php -l

      - name: PHPCS (WordPress standards)
        run: |
          phpcs --standard=WordPress \
            --extensions=php \
            --ignore=vendor/,node_modules/ \
            .

      - name: PHPStan
        run: phpstan analyse --no-progress

      - name: PHP tests
        run: composer test

      # ── Verify no --no-verify was used ────────────────────────────────────
      # We can't detect it in the git history, but this job running and passing
      # proves the code is clean regardless of what happened locally.
      - name: Gate passed
        run: |
          echo "✅ All checks passed — code is verified clean."
          echo "   This job mirrors what pre-commit and pre-push hooks enforce."
          echo "   --no-verify on a local push does not bypass this check."
```

---

## Husky hooks setup

Hooks are the developer feedback loop. The CI gate is the enforcer.
Both must exist and mirror each other exactly.

### Install

```bash
npm install --save-dev husky
npx husky init
```

### `.husky/pre-commit` — fast checks only (keeps commit flow snappy)

```sh
npm run lint        # auto-fix what can be fixed, then check
npm run check       # TypeScript typecheck
```

### `.husky/pre-push` — full suite (runs before any push reaches GitHub)

```sh
npm run check
npm run lint
npm run test -- --run
npm run build
```

> **Why split pre-commit/pre-push?**
> Pre-commit runs on every `git commit` — keep it fast (< 10s). Pre-push runs
> once before the network call — full suite is acceptable here (< 60s).

### Prohibit `--no-verify` via git config alias

Add to the project's `.gitconfig` or instruct developers to run this once:

```bash
# Override git commit and git push to block --no-verify
git config alias.safe-commit '!f() {
  for arg in "$@"; do
    if [[ "$arg" == "--no-verify" || "$arg" == "-n" ]]; then
      echo "❌ --no-verify is not allowed on this project."
      echo "   Fix the failing hook instead of bypassing it."
      exit 1
    fi
  done
  git commit "$@"
}; f'
```

This is advisory — a determined developer can still use the real `git commit --no-verify`.
The CI gate is the hard stop.

### `.git/hooks/` vs Husky

Husky manages hooks in `.husky/` and symlinks them into `.git/hooks/` via the
`prepare` lifecycle script. Any developer who runs `npm install` gets the hooks
automatically. Developers who skip `npm install` won't have hooks — but they
also won't be able to contribute meaningfully, and CI still gates their pushes.

---

## Branch protection requirements

Configure in **GitHub → Settings → Branches** for each protected branch.

### `develop`

```
✅ Require status checks: ci-gate / full-check
✅ Require branches to be up to date before merging
```

### `staging`

```
✅ Require pull request before merging
✅ Require 1 approving review
✅ Dismiss stale reviews on new commits
✅ Require status checks: ci-gate / full-check
✅ Require branches to be up to date
✅ Do not allow bypassing the above settings
```

### `main`

```
✅ Require pull request before merging
✅ Require 2 approving reviews
✅ Dismiss stale reviews on new commits
✅ Require status checks: ci-gate / full-check, staging-source-check
✅ Require branches to be up to date
✅ Do not allow force pushes
✅ Do not allow deletions
✅ Do not allow bypassing the above settings  ← this is the key one
```

The **"Do not allow bypassing"** setting means even repository admins cannot
merge a PR without the required checks passing. This is the hard enforcement.

---

## Deploy workflows: `needs: ci-gate`

Every deploy workflow references the `ci-gate` job from `ci-gate.yml` via
`workflow_run` or, better, runs its own gate job first:

```yaml
# In deploy-dev.yml, deploy-staging.yml, deploy-production.yml
jobs:

  # ── Gate: re-run all checks (catches --no-verify bypasses) ───────────────
  verify:
    name: Verify — full check before deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run check
      - run: npm test -- --run
      - run: npm run build
      # PHP checks omitted for brevity — add them if the project has PHP

  # ── Deploy ────────────────────────────────────────────────────────────────
  deploy:
    name: Deploy to WP Engine
    needs: verify          # 🔒 deploy never runs without verify passing
    runs-on: ubuntu-latest
    ...
```

This means the deploy workflow is self-contained: even if someone triggers it
directly (via `workflow_dispatch` or a force push), the `verify` job must pass
before WP Engine ever receives a single byte.

---

## What `--no-verify` actually bypasses (and what it doesn't)

| Check | `git commit --no-verify` | `git push --no-verify` | CI gate |
|---|---|---|---|
| pre-commit hook | ❌ skipped | n/a | ✅ runs |
| commit-msg hook | ❌ skipped | n/a | ✅ runs (effectively) |
| pre-push hook | n/a | ❌ skipped | ✅ runs |
| GitHub CI gate (`ci-gate.yml`) | ✅ runs | ✅ runs | ✅ runs |
| Branch protection status check | ✅ blocks merge | ✅ blocks push | ✅ blocks |
| Deploy workflow `verify` job | ✅ runs | ✅ runs | ✅ runs |

**Result:** `--no-verify` only removes the local fast-feedback loop.
It does not affect CI, branch protection, or deploy gates.
The consequence of using `--no-verify` on a broken codebase is:
CI fails → PR cannot merge → no deploy.

---

## Enforcement summary for agents and developers

1. **Never use `--no-verify`** on a branch that feeds a deploy environment.
2. If a hook is failing, **fix the underlying issue** — do not bypass the hook.
3. CI gate (`ci-gate / full-check`) is a **required status check** on all protected branches.
4. Deploys have a `verify` job as their **first dependency** — they will not run if verification fails.
5. Production deploys require CI + 2 reviewers + source-branch check (`staging` only).
6. Branch protection has **"Do not allow bypassing"** enabled — even admins cannot override.

---

## Troubleshooting hook failures

```bash
# See what the hook actually runs
cat .husky/pre-commit
cat .husky/pre-push

# Run the same checks manually without committing
npm run lint
npm run check
npm run test -- --run
npm run build

# Check Husky is installed correctly
npx husky
ls -la .git/hooks/pre-commit  # should be a symlink to .husky/pre-commit
```

If a hook is not firing at all:
```bash
npm run prepare   # reinstalls Husky hooks
```
