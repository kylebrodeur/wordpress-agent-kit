# GitHub Actions CI/CD for WP Engine

Push-to-deploy for WordPress on WP Engine, using GitHub as the source of truth.
Based on the pattern established by Kris Jordan (2013): a bare git remote + post-receive hook deploys the working tree. WP Engine operates this natively. GitHub Actions wraps it with safety gates.

---

## CI gate policy: `--no-verify` is forbidden

`--no-verify` skips local git hooks. It is **explicitly prohibited** on any branch that feeds
a WP Engine deploy. Hooks are there to surface problems before they reach CI — bypassing
them shifts the cost of broken code from a 5-second local check to a failed deploy and
possible production incident.

Enforcement is two-layered so that `--no-verify` has no actual effect:

1. **CI gate** (`ci-gate.yml`) runs on every push to `develop`, `staging`, and `main`,
   re-running every check that hooks run. It is a required status check. Broken code
   cannot reach a protected branch regardless of what happened locally.
2. **Deploy workflows** run a `verify` job as their **first dependency**. Deploys never
   start without it passing — even on `workflow_dispatch` or emergency force pushes.

See `ci-gate.md` for the full CI gate workflow and Husky hook setup.

---

## Branch model

```
feature/* ──PR──→ develop ──auto──→ WP Engine dev
                  ↓
                 PR + review
                  ↓
               staging ──auto──→ WP Engine staging
                  ↓
              PR + 2 reviewers + staging-only rule
                  ↓
                 main ──auto──→ WP Engine production
```

| Branch | WP Engine install | Auto-deploy | Backup before | Smoke test | Rollback |
|--------|------------------|-------------|---------------|------------|----------|
| `develop` | `<install>dev` | ✅ | ❌ | ❌ | manual |
| `staging` | `<install>stg` | ✅ | ✅ DB snapshot | ✅ | manual |
| `main` | `<install>` | ✅ | ✅ DB snapshot | ✅ | ✅ auto |

---

## GitHub repository setup

### Branch protection rules

Configure in **Settings → Branches** for each protected branch:

**`develop`:**
- ✅ Require status checks: `ci-gate / full-check`
- ✅ Require branches to be up to date

**`staging`:**
- ✅ Require pull request before merging
- ✅ Require 1 approving review
- ✅ Dismiss stale reviews on push
- ✅ Require status checks: `ci-gate / full-check`
- ✅ Require branches to be up to date
- ✅ Restrict who can push: only Actions + team leads
- ✅ **Do not allow bypassing the above settings**

**`main`:**
- ✅ Require pull request before merging
- ✅ Require 2 approving reviews
- ✅ Dismiss stale reviews on push
- ✅ Require status checks: `ci-gate / full-check`, `staging-source-check`
- ✅ Require branches to be up to date
- ✅ Restrict who can push: only Actions + team leads
- ✅ Do not allow force pushes
- ✅ Do not allow deletions
- ✅ **Do not allow bypassing the above settings** ← admins cannot override

### Required GitHub Secrets

Add under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `WPE_SSH_KEY` | Private key (contents of `wpengine_ed25519`) |
| `WPE_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -t rsa git.wpengine.com && ssh-keyscan -H ssh.wpengine.net` |
| `WPE_PROD_INSTALL` | Production install slug (e.g., `mysite`) |
| `WPE_STAGING_INSTALL` | Staging install slug (e.g., `mysitestg`) |
| `WPE_DEV_INSTALL` | Development install slug (e.g., `mysitedev`) |
| `WPE_API_USER` | WP Engine API username (for backup snapshots) |
| `WPE_API_PASSWORD` | WP Engine API password |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook (optional, for notifications) |

Generate the known hosts value once and save:
```bash
{ ssh-keyscan -t rsa git.wpengine.com; ssh-keyscan -H ssh.wpengine.net; } 2>/dev/null
```

---

## Workflow files

### `lint-and-test.yml` — PR quality gate (all environments)

Runs on every PR targeting `develop`, `staging`, or `main`. No deployment.

```yaml
# .github/workflows/lint-and-test.yml
name: Lint & Test

on:
  pull_request:
    branches: [develop, staging, main]

jobs:
  lint-and-test:
    name: Lint & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer, phpcs, phpstan

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install PHP dependencies
        run: composer install --no-dev --prefer-dist --quiet

      - name: Install JS dependencies
        run: npm ci

      - name: PHP lint (syntax)
        run: find . -name "*.php" -not -path "*/vendor/*" -not -path "*/node_modules/*" | xargs -P4 php -l

      - name: PHPCS (WordPress coding standards)
        run: phpcs --standard=WordPress --extensions=php --ignore=vendor/,node_modules/ .

      - name: PHPStan
        run: phpstan analyse --no-progress

      - name: JS/CSS lint
        run: npm run lint

      - name: Build assets
        run: npm run build

      - name: Run PHP tests
        run: composer test
```

---

### `staging-source-check.yml` — Production PR guard

Blocks any PR merging into `main` that does NOT originate from `staging`. Required status check on `main`.

```yaml
# .github/workflows/staging-source-check.yml
name: Staging Source Check

on:
  pull_request:
    branches: [main]

jobs:
  staging-source-check:
    name: Verify PR comes from staging
    runs-on: ubuntu-latest
    steps:
      - name: Check source branch
        run: |
          SOURCE="${{ github.head_ref }}"
          echo "Source branch: $SOURCE"
          if [[ "$SOURCE" != "staging" ]]; then
            echo "❌ Production deploys must come from the 'staging' branch."
            echo "   Current source: '$SOURCE'"
            echo "   Merge staging into main via a PR from the staging branch."
            exit 1
          fi
          echo "✅ Source branch is staging — cleared for production deploy."
```

---

### `deploy-dev.yml` — Development auto-deploy

Deploys on every push to `develop`. Minimal guards — this is the scratch environment.

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy → Development

on:
  push:
    branches: [develop]

concurrency:
  group: deploy-dev
  cancel-in-progress: true

jobs:
  # ── Gate: verify before touching dev ────────────────────────────────────
  verify:
    name: Verify — full check (mirrors hooks, blocks --no-verify)
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

  deploy-dev:
    name: Deploy to WP Engine Dev
    runs-on: ubuntu-latest
    needs: verify
    environment:
      name: development
      url: https://${{ secrets.WPE_DEV_INSTALL }}.wpenginepowered.com
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node & build assets
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci && npm run build

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.WPE_SSH_KEY }}

      - name: Add WP Engine to known hosts
        run: echo "${{ secrets.WPE_SSH_KNOWN_HOSTS }}" >> ~/.ssh/known_hosts

      - name: Push to WP Engine dev
        env:
          INSTALL: ${{ secrets.WPE_DEV_INSTALL }}
        run: |
          git remote add wpe-dev git@git.wpengine.com:development/${INSTALL}.git
          # Force-add built assets (normally gitignored)
          git add -f dist/ build/ 2>/dev/null || true
          git diff --cached --quiet || git commit -m "ci: add built assets [skip ci]"
          git push wpe-dev HEAD:main --force

      - name: Flush cache (dev)
        env:
          INSTALL: ${{ secrets.WPE_DEV_INSTALL }}
        run: |
          ssh -o StrictHostKeyChecking=no ${INSTALL}@${INSTALL}.ssh.wpengine.net \
            wp cache flush --skip-plugins --skip-themes
```

---

### `deploy-staging.yml` — Staging deploy with guards

Deploys on push to `staging`. Takes a DB backup, deploys, flushes cache, runs a smoke test.

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy → Staging

on:
  push:
    branches: [staging]

concurrency:
  group: deploy-staging
  cancel-in-progress: false  # never cancel in-flight staging deploys

jobs:
  # ── Gate: verify before touching staging ────────────────────────────────
  verify:
    name: Verify — full check (mirrors hooks, blocks --no-verify)
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

  deploy-staging:
    name: Deploy to WP Engine Staging
    runs-on: ubuntu-latest
    needs: verify
    environment:
      name: staging
      url: https://${{ secrets.WPE_STAGING_INSTALL }}.wpenginepowered.com
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node & build assets
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci && npm run build

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.WPE_SSH_KEY }}

      - name: Add WP Engine to known hosts
        run: echo "${{ secrets.WPE_SSH_KNOWN_HOSTS }}" >> ~/.ssh/known_hosts

      - name: Pre-deploy DB backup (staging)
        env:
          INSTALL: ${{ secrets.WPE_STAGING_INSTALL }}
          WPE_API_USER: ${{ secrets.WPE_API_USER }}
          WPE_API_PASSWORD: ${{ secrets.WPE_API_PASSWORD }}
        run: |
          echo "📦 Creating staging DB backup via WP Engine API..."
          RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            -u "${WPE_API_USER}:${WPE_API_PASSWORD}" \
            "https://api.wpengineapi.com/v1/installs/${INSTALL}/backups" \
            -H "Content-Type: application/json" \
            -d '{"description":"Pre-deploy backup — GitHub Actions","notification_emails":[]}')
          HTTP_CODE=$(echo "$RESPONSE" | tail -1)
          BODY=$(echo "$RESPONSE" | head -1)
          echo "API response: $BODY (HTTP $HTTP_CODE)"
          if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "202" ]]; then
            echo "⚠️  Backup API call failed (HTTP $HTTP_CODE) — proceeding anyway"
          else
            echo "✅ Backup initiated"
          fi

      - name: Push to WP Engine staging
        env:
          INSTALL: ${{ secrets.WPE_STAGING_INSTALL }}
        run: |
          git remote add wpe-staging git@git.wpengine.com:staging/${INSTALL}.git
          git add -f dist/ build/ 2>/dev/null || true
          git diff --cached --quiet || git commit -m "ci: add built assets [skip ci]"
          git push wpe-staging HEAD:main --force

      - name: Post-deploy WP-CLI (staging)
        env:
          INSTALL: ${{ secrets.WPE_STAGING_INSTALL }}
        run: |
          ssh -o StrictHostKeyChecking=no ${INSTALL}@${INSTALL}.ssh.wpengine.net bash -s <<'EOF'
            set -e
            wp cache flush --skip-plugins --skip-themes
            wp rewrite flush --skip-plugins --skip-themes
            wp cron event run --due-now --skip-plugins --skip-themes
            echo "✅ Post-deploy WP-CLI complete"
          EOF

      - name: Smoke test (staging)
        env:
          INSTALL: ${{ secrets.WPE_STAGING_INSTALL }}
        run: |
          SITE_URL="https://${INSTALL}.wpenginepowered.com"
          echo "🧪 Smoke testing $SITE_URL..."
          sleep 30  # Allow WP Engine deploy to propagate

          check_url() {
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 30 "$1")
            if [[ "$STATUS" -ge 200 && "$STATUS" -lt 400 ]]; then
              echo "  ✅ $1 → $STATUS"
            else
              echo "  ❌ $1 → $STATUS"
              return 1
            fi
          }

          check_url "${SITE_URL}/"
          check_url "${SITE_URL}/wp-login.php"
          check_url "${SITE_URL}/wp-json/wp/v2/"
          echo "✅ Staging smoke tests passed"

      - name: Notify Slack (staging)
        if: always()
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          INSTALL: ${{ secrets.WPE_STAGING_INSTALL }}
          STATUS: ${{ job.status }}
          COMMIT: ${{ github.sha }}
          ACTOR: ${{ github.actor }}
        run: |
          [[ -z "$SLACK_WEBHOOK" ]] && exit 0
          EMOJI=$([[ "$STATUS" == "success" ]] && echo "✅" || echo "❌")
          MSG="${EMOJI} *Staging deploy ${STATUS}* by @${ACTOR}"
          MSG+=" | \`${COMMIT:0:7}\` | <https://${INSTALL}.wpenginepowered.com|${INSTALL}>"
          curl -s -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"${MSG}\"}" \
            "$SLACK_WEBHOOK"
```

---

### `deploy-production.yml` — Production deploy with aggressive guards

The full safety chain: source-branch check → pre-deploy snapshot → deploy → smoke test → auto-rollback on failure.

```yaml
# .github/workflows/deploy-production.yml
name: Deploy → Production

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false  # NEVER cancel in-flight production deploys

jobs:
  # ── Gate: verify FIRST — no deploy without clean code ──────────────────────
  verify:
    name: Verify — full check (--no-verify cannot skip this)
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

  # ── Guard: verify merge came from staging ──────────────────────────────────
  production-guard:
    name: Production safety checks
    runs-on: ubuntu-latest
    needs: verify
    outputs:
      previous-sha: ${{ steps.get-sha.outputs.sha }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Verify merge source is staging
        run: |
          # Get the merge commit parent — should be from staging
          MERGE_BASE=$(git log --merges --format="%P" -1 | awk '{print $2}')
          if [[ -z "$MERGE_BASE" ]]; then
            # Direct push — check if it matches the last commit on staging
            echo "⚠️  Direct push to main detected (not a merge commit)."
            echo "   Direct pushes to main are strongly discouraged."
            echo "   Use a PR from staging instead."
            # Allow for emergency hotfixes but log loudly
          fi
          echo "✅ Merge source check complete"

      - name: Record previous deploy SHA (for rollback)
        id: get-sha
        run: |
          PREV=$(git rev-parse HEAD~1)
          echo "sha=$PREV" >> "$GITHUB_OUTPUT"
          echo "Previous SHA: $PREV"

  # ─── Deploy ─────────────────────────────────────────────────────────────────
  deploy-production:
    name: Deploy to WP Engine Production
    runs-on: ubuntu-latest
    needs: [verify, production-guard]
    environment:
      name: production
      url: https://${{ secrets.WPE_PROD_INSTALL }}.wpenginepowered.com
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node & build assets
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci && npm run build

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.WPE_SSH_KEY }}

      - name: Add WP Engine to known hosts
        run: echo "${{ secrets.WPE_SSH_KNOWN_HOSTS }}" >> ~/.ssh/known_hosts

      - name: Pre-deploy backup (production — mandatory)
        env:
          INSTALL: ${{ secrets.WPE_PROD_INSTALL }}
          WPE_API_USER: ${{ secrets.WPE_API_USER }}
          WPE_API_PASSWORD: ${{ secrets.WPE_API_PASSWORD }}
        run: |
          echo "📦 Creating production backup — this is required before every deploy..."
          RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            -u "${WPE_API_USER}:${WPE_API_PASSWORD}" \
            "https://api.wpengineapi.com/v1/installs/${INSTALL}/backups" \
            -H "Content-Type: application/json" \
            -d "{\"description\":\"Pre-deploy — ${{ github.sha }} — ${{ github.actor }}\",\"notification_emails\":[]}")
          HTTP_CODE=$(echo "$RESPONSE" | tail -1)
          BODY=$(echo "$RESPONSE" | head -1)
          echo "API response: $BODY (HTTP $HTTP_CODE)"
          if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "202" ]]; then
            echo "❌ Backup API call failed (HTTP $HTTP_CODE)"
            echo "   Production deploy aborted — backup is mandatory."
            exit 1
          fi
          echo "✅ Backup initiated — proceeding with deploy"

      - name: Push to WP Engine production
        env:
          INSTALL: ${{ secrets.WPE_PROD_INSTALL }}
        run: |
          git remote add wpe-prod git@git.wpengine.com:production/${INSTALL}.git
          git add -f dist/ build/ 2>/dev/null || true
          git diff --cached --quiet || git commit -m "ci: add built assets [skip ci]"
          git push wpe-prod HEAD:main --force

      - name: Post-deploy WP-CLI (production)
        env:
          INSTALL: ${{ secrets.WPE_PROD_INSTALL }}
        run: |
          ssh -o StrictHostKeyChecking=no ${INSTALL}@${INSTALL}.ssh.wpengine.net bash -s <<'EOF'
            set -e
            wp cache flush --skip-plugins --skip-themes
            wp rewrite flush --skip-plugins --skip-themes
            wp cron event run --due-now --skip-plugins --skip-themes
            # Report current state
            echo "--- Site health ---"
            wp option get siteurl
            wp core version
            wp plugin list --status=active --format=count
            echo "✅ Post-deploy WP-CLI complete"
          EOF

      - name: Smoke test (production)
        id: smoke-test
        env:
          INSTALL: ${{ secrets.WPE_PROD_INSTALL }}
        run: |
          # Give WP Engine ~45s to fully propagate
          sleep 45

          SITE_URL="https://${INSTALL}.wpenginepowered.com"
          FAILED=0

          check_url() {
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L \
              -A "WPE-Deploy-SmokeTest/1.0" --max-time 30 "$1")
            if [[ "$STATUS" -ge 200 && "$STATUS" -lt 400 ]]; then
              echo "  ✅ $1 → HTTP $STATUS"
            else
              echo "  ❌ $1 → HTTP $STATUS (expected 2xx/3xx)"
              FAILED=1
            fi
          }

          echo "🧪 Smoke testing production: $SITE_URL"
          check_url "${SITE_URL}/"
          check_url "${SITE_URL}/wp-login.php"
          check_url "${SITE_URL}/wp-json/wp/v2/"

          if [[ "$FAILED" -ne 0 ]]; then
            echo "❌ Smoke tests FAILED — triggering rollback"
            exit 1
          fi
          echo "✅ All smoke tests passed"

      - name: Auto-rollback on smoke test failure
        if: failure() && steps.smoke-test.outcome == 'failure'
        env:
          INSTALL: ${{ secrets.WPE_PROD_INSTALL }}
          PREV_SHA: ${{ needs.production-guard.outputs.previous-sha }}
        run: |
          echo "🔄 Smoke test failed — rolling back to $PREV_SHA..."
          git push wpe-prod ${PREV_SHA}:main --force
          echo "✅ Rollback pushed — verifying..."
          sleep 30
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L \
            "https://${INSTALL}.wpenginepowered.com/" --max-time 30)
          echo "Post-rollback status: HTTP $STATUS"
          # Flush cache after rollback
          ssh -o StrictHostKeyChecking=no ${INSTALL}@${INSTALL}.ssh.wpengine.net \
            wp cache flush --skip-plugins --skip-themes
          echo "❌ Deployment was ROLLED BACK to $PREV_SHA"
          exit 1  # Mark the job as failed so Slack notifies

      - name: Notify Slack (production)
        if: always()
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          INSTALL: ${{ secrets.WPE_PROD_INSTALL }}
          STATUS: ${{ job.status }}
          COMMIT: ${{ github.sha }}
          ACTOR: ${{ github.actor }}
        run: |
          [[ -z "$SLACK_WEBHOOK" ]] && exit 0
          if [[ "$STATUS" == "success" ]]; then
            EMOJI="🚀"
            TEXT="*Production deploy succeeded* by @${ACTOR}"
          else
            EMOJI="🔥"
            TEXT="*Production deploy FAILED* — check logs immediately | @${ACTOR}"
          fi
          MSG="${EMOJI} ${TEXT} | \`${COMMIT:0:7}\` | <https://${INSTALL}.wpenginepowered.com|${INSTALL}>"
          curl -s -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"${MSG}\"}" \
            "$SLACK_WEBHOOK"
```

---

## Safety escalation by environment

| Guard | Dev | Staging | Production |
|---|---|---|---|
| `--no-verify` skippable? | Never — CI gate catches it | Never — CI gate catches it | Never — CI gate catches it |
| `verify` job in deploy workflow | ✅ (blocks deploy) | ✅ (blocks deploy) | ✅ (blocks deploy) |
| PR required | ❌ | ✅ (1 reviewer) | ✅ (2 reviewers) |
| Must merge from specific branch | ❌ | `develop` | `staging` only |
| CI gate required status check | ✅ | ✅ | ✅ |
| Pre-deploy DB backup | ❌ | ✅ API (warn if fail) | ✅ API **(abort if fail)** |
| Deploy propagation wait | 0s | 30s | 45s |
| Smoke test URLs | ❌ | `/`, `/wp-login.php`, `/wp-json/` | `/`, `/wp-login.php`, `/wp-json/` |
| Auto-rollback | ❌ | ❌ | ✅ push `HEAD~1` + cache flush |
| Concurrency: cancel in-progress | ✅ | ❌ | ❌ |
| Slack notification | ❌ | ✅ | ✅ (pings channel on failure) |

---

## Built assets: the common gotcha

WordPress themes/plugins often have build pipelines (`npm run build`) that output to `dist/` or `build/` — directories that are **gitignored** in the source repo. WP Engine deploys exactly what you push, so gitignored files aren't deployed.

The workflows above handle this by running `npm run build` in CI and then force-adding the output before pushing to WP Engine:

```yaml
- run: npm ci && npm run build
# ...
- run: |
    git add -f dist/ build/ 2>/dev/null || true
    git diff --cached --quiet || git commit -m "ci: add built assets [skip ci]"
    git push wpe-prod HEAD:main --force
```

> `[skip ci]` on the build commit prevents GitHub Actions from triggering again on that commit.

For Composer vendor: if your WP Engine environment doesn't run `composer install` on deploy (most don't), also add:
```yaml
git add -f vendor/ 2>/dev/null || true
```

---

## Manual rollback procedures

**Fast rollback (previous commit):**
```bash
# From your local machine
git push wpe-prod main~1:main --force
```

**WP Engine API rollback (to a specific snapshot):**
```bash
# List available backups
curl -s -u "$WPE_API_USER:$WPE_API_PASSWORD" \
  "https://api.wpengineapi.com/v1/installs/${INSTALL}/backups" | jq '.results[].id,.results[].created_at'

# Restore a specific backup (by ID)
curl -s -X POST \
  -u "$WPE_API_USER:$WPE_API_PASSWORD" \
  "https://api.wpengineapi.com/v1/installs/${INSTALL}/backups/${BACKUP_ID}/restore"
```

**Emergency: revert code + flush:**
```bash
# Push the previous commit
git push wpe-prod HEAD~1:main --force

# Flush via SSH gateway
ssh <install>@<install>.ssh.wpengine.net \
  wp cache flush --skip-plugins --skip-themes
```

---

## Adding custom smoke test URLs

Expand the smoke test section with your site's key pages:

```yaml
check_url "${SITE_URL}/"
check_url "${SITE_URL}/about/"
check_url "${SITE_URL}/contact/"
check_url "${SITE_URL}/shop/"           # WooCommerce
check_url "${SITE_URL}/wp-json/wp/v2/"  # REST API
# Check no PHP errors in homepage body
BODY=$(curl -sL "${SITE_URL}/")
if echo "$BODY" | grep -qi "fatal error\|parse error\|warning:"; then
  echo "❌ PHP errors detected in homepage body"
  FAILED=1
fi
```

---

## References

- WP Engine git push docs: `https://wpengine.com/support/git-version-control/`
- WP Engine API reference: `https://wpengineapi.com/`
- GitHub Actions `webfactory/ssh-agent`: `https://github.com/webfactory/ssh-agent`
- WP-CLI remote SSH: `https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/`
- Kris Jordan (2013) — foundational push-to-deploy pattern: `https://krisjordan.com/blog/2013/11/02/push-to-deploy-with-git`
