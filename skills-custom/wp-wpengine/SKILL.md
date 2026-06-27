---
name: wp-wpengine
description: "Optional: Use for WP Engine hosting workflows — SSH-based git push, remote WP-CLI via SSH gateway, GitHub Actions CI/CD with safety-gated deploys to dev/staging/production, managing installs/domains/cache/backups via the wpe-labs Claude Code skills, and WP Engine API access. Requires SSH key setup and WPE_USERNAME/WPE_PASSWORD env vars for API operations."
license: GPL-2.0-or-later
optional: true
---

# WP Engine

## When to use

- Deploy WordPress code to a WP Engine environment via `git push` or GitHub Actions.
- Set up a branch-gated CI/CD pipeline: `develop` → dev, `staging` → staging, `main` → production.
- Run WP-CLI commands remotely on a WP Engine install (plugin updates, cache flush, DB ops, search-replace).
- Manage WP Engine installs, domains, cache, backups, or users through natural language.
- Generate monthly usage/bandwidth reports across WP Engine accounts.
- Manage LargeFS media offload configuration.

## Prerequisites

- SSH key stored in 1Password (`Employee` vault, item `wpengine_ed25519`).
  > **Key type note:** RSA 4096-bit is the historically proven key type for WP Engine git push.
  > Ed25519 is more modern and works on current WP Engine infrastructure, but if you're
  > setting up a new key, RSA 4096 is the safest choice: `ssh-keygen -t rsa -b 4096 -f ~/.ssh/wpengine_rsa`
- SSH key registered in the WP Engine portal — both under **Git Push** and **SSH Keys** (two separate registrations, same key).
- WP Engine API credentials in 1Password (`Employee` vault, item `WP Engine API`).
- `op` CLI authenticated (`op whoami` works).
- SSH gateway access requires a **Professional plan or higher**.
- The `wpe-labs` Claude Code skills installed (`~/.claude/skills/wpe-labs:*`) for natural language management.

---

## Procedure

### 1) First-time SSH setup on a new machine

Pull the private key from 1Password and configure SSH:

```bash
op read "op://Employee/wpengine_ed25519/private key" > ~/.ssh/wpengine_ed25519
chmod 600 ~/.ssh/wpengine_ed25519

# Trust WP Engine git push host (RSA — what WP Engine's git.wpengine.com serves)
ssh-keyscan -t rsa git.wpengine.com >> ~/.ssh/known_hosts
# Gateway: scan the specific install hostname (each install has its own subdomain)
# Do this once per environment you connect to:
ssh-keyscan -H <install>.ssh.wpengine.net >> ~/.ssh/known_hosts
# e.g.: ssh-keyscan -H mysite.ssh.wpengine.net >> ~/.ssh/known_hosts
```

Add to `~/.ssh/config` (before any `Host *` block):

```
# WP Engine git push
Host git.wpengine.com
  User git
  IdentityFile ~/.ssh/wpengine_ed25519
  IdentitiesOnly yes

# WP Engine SSH gateway (WP-CLI + file transfer)
Host *.ssh.wpengine.net
  IdentityFile ~/.ssh/wpengine_ed25519
  IdentitiesOnly yes
  ControlMaster auto
  ControlPath ~/.ssh/wpe-%r@%h:%p
  ControlPersist 10m
  StrictHostKeyChecking accept-new
```

> **`StrictHostKeyChecking accept-new`**: automatically accepts and stores the host key on first connection, then rejects any change to that key (MITM protection). Safer than `no`; avoids having to manually `ssh-keyscan` each install hostname.
>
> **ControlMaster / ControlPersist**: multiplexes SSH connections so subsequent commands over the same gateway reuse the existing connection. Cuts per-command latency from ~2 s to ~100 ms for repeated WP-CLI invocations.

Verify git push access:

```bash
ssh git@git.wpengine.com info
# Expected: hello <username> / R W <install-name>
```

Verify SSH gateway access (replace `<install>` with the WP Engine install slug):

```bash
ssh <install>@<install>.ssh.wpengine.net wp --info
# Expected: WP-CLI version + paths
```

---

### 2A) Deploy via Official WP Engine GitHub Action (recommended)

The official WP Engine GitHub Action uses **rsync over SSH** — faster, more flexible than git push, and built/maintained by WP Engine.

Repository: `wpengine/github-action-wpe-site-deploy@v3`

#### Required secret

The official action uses `WPE_SSHG_KEY_PRIVATE` (your SSH private key). The action handles known_hosts automatically — no keyscan needed.

```yaml
# .github/workflows/deploy-production.yml
name: Deploy → Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build assets
        run: npm ci && npm run build

      - name: Deploy to WP Engine
        uses: wpengine/github-action-wpe-site-deploy@v3
        with:
          WPE_SSHG_KEY_PRIVATE: ${{ secrets.WPE_SSHG_KEY_PRIVATE }}
          WPE_ENV: <install-name>
          PHP_LINT: true
          CACHE_CLEAR: true
          # Optional: deploy only a subdirectory (e.g., a theme)
          # SRC_PATH: "wp-content/themes/my-theme/"
          # REMOTE_PATH: "wp-content/themes/my-theme/"
          # Exclude files via rsync flags:
          FLAGS: -azvr --inplace --delete --exclude=.* --exclude-from=.deployignore
          # Post-deploy WP-CLI script (runs on the remote server):
          SCRIPT: "scripts/post-deploy.sh"
```

**`scripts/post-deploy.sh`** (committed to repo, runs on WP Engine after deploy):

```bash
#!/usr/bin/env bash
set -e
wp cache flush --skip-plugins --skip-themes
wp rewrite flush --skip-plugins --skip-themes
wp cron event run --due-now --skip-plugins --skip-themes
echo "✅ Post-deploy WP-CLI complete"
```

**`.deployignore`** (rsync exclude list, committed to repo root):

```
.git
node_modules
.env
.env.*
README.md
.github
package.json
package-lock.json
pnpm-lock.yaml
composer.json
composer.lock
*.test.*
tests/
```

**Key options:**

| Option | Description |
|--------|-------------|
| `WPE_ENV` | Install slug. Alias: `PRD_ENV`, `STG_ENV`, `DEV_ENV` for multi-env workflows |
| `SRC_PATH` | Deploy subdirectory of repo (trailing slash = contents only) |
| `REMOTE_PATH` | Destination on WP Engine (defaults to WP root) |
| `PHP_LINT` | `true` to run PHP lint pre-deploy |
| `FLAGS` | rsync flags. Default: `-azvr --inplace --exclude=.*` |
| `SCRIPT` | Post-deploy bash script (relative to WP root on server) |
| `CACHE_CLEAR` | `true` to clear page + CDN cache post-deploy (default: true) |

**Multi-environment workflow:**

```yaml
# Branch → environment mapping
on:
  push:
    branches: [develop, staging, main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: wpengine/github-action-wpe-site-deploy@v3
        with:
          WPE_SSHG_KEY_PRIVATE: ${{ secrets.WPE_SSHG_KEY_PRIVATE }}
          # Branch → env: develop=dev, staging=stg, main=prod
          DEV_ENV: ${{ github.ref == 'refs/heads/develop' && '<install>dev' || '' }}
          STG_ENV: ${{ github.ref == 'refs/heads/staging' && '<install>stg' || '' }}
          PRD_ENV: ${{ github.ref == 'refs/heads/main' && '<install>' || '' }}
          CACHE_CLEAR: true
```

> **Secret name difference**: The official action uses `WPE_SSHG_KEY_PRIVATE`. Our custom git-push workflows use `WPE_SSH_KEY`. Both are the same private key — just stored under different secret names.

---

### 2B) Deploy via git push (alternative)

**Always get the exact remote URL from the WP Engine portal** — it includes the environment prefix:
`https://my.wpengine.com/installs/<ENV>/git_push`

The URL format is: `git@git.wpengine.com:<environment>/<install-name>.git`  
where `<environment>` is `production`, `staging`, or `development`.

```bash
# Production (copy exact URL from portal)
# ⚠️  Always copy the exact URL from the WP Engine portal — formats vary by account:
#    https://my.wpengine.com/installs/<ENV>/git_push
#
# Modern accounts (most common):
git remote add wpengine-prod git@git.wpengine.com:<install-name>.git
# Legacy accounts (some plans add an environment prefix):
# git remote add wpengine-prod git@git.wpengine.com:production/<install-name>.git

# Staging (check portal for exact URL)
git remote add wpengine-staging git@git.wpengine.com:<install-name>stg.git

# Development (check portal for exact URL)
git remote add wpengine-dev git@git.wpengine.com:<install-name>dev.git
```

Deploy:
```bash
git push wpengine-prod main
# WP Engine expects the branch name 'main' on its remote
git push wpengine-staging staging:main
```

- WP Engine deploys the pushed branch automatically.
- Only WordPress files are pushed — not `node_modules`, build artifacts, or `.git/`.
- After push, allow 1–2 min for propagation.

> **Verify the remote URL**: `git remote -v` should show `git@git.wpengine.com:production/<install>.git`.
> If it shows `git@git.wpengine.com:<install>.git` (no environment prefix), update it — that is an older format that may no longer work.

---

### 3) WP-CLI via SSH gateway

WP Engine's SSH gateway host is `{install}.ssh.wpengine.net` with username `{install}`.  
The WordPress root on the server is `/home/wpe-user/sites/{install}`.

#### Method A — Direct SSH command (simplest)

```bash
ssh <install>@<install>.ssh.wpengine.net wp <command>
```

WP-CLI on WP Engine already knows the WordPress path, so `--path` is usually not required. If needed:

```bash
ssh <install>@<install>.ssh.wpengine.net wp plugin list --path=/home/wpe-user/sites/<install>
```

Always use `--skip-plugins --skip-themes` on production for safety:

```bash
ssh <install>@<install>.ssh.wpengine.net \
  wp cache flush --skip-plugins --skip-themes
```

#### Method B — WP-CLI `--ssh` flag

WP-CLI's native `--ssh` flag runs any command against a remote install without logging in first:

```bash
# Format: --ssh=user@host/path
wp --ssh=<install>@<install>.ssh.wpengine.net:/home/wpe-user/sites/<install> plugin list

# Shorthand — omit path if WP-CLI finds WP at the SSH user's home:
wp --ssh=<install>@<install>.ssh.wpengine.net cache flush
```

#### Method C — `wp-cli.yml` aliases (best for repeated use)

Create or update `wp-cli.yml` in your local repo root:

```yaml
# wp-cli.yml
@production:
  ssh: <install>@<install>.ssh.wpengine.net
  path: /home/wpe-user/sites/<install>

@staging:
  ssh: <install>stg@<install>stg.ssh.wpengine.net
  path: /home/wpe-user/sites/<install>stg
```

Then use the alias for any command:

```bash
wp @production plugin list --format=json
wp @staging cache flush
wp @production db export - > backup-$(date +%F).sql
wp @production search-replace 'old-domain.com' 'new-domain.com' --dry-run
```

> Commit `wp-cli.yml` to the repo so all team members and CI pipelines share the same remote aliases.

#### Method D — SCP / rsync for file transfer

The SSH gateway also accepts SCP and rsync (port 22). Use this to pull/push files without a full git push:

```bash
# SCP: download a file from the server
scp -P 22 <install>@<install>.ssh.wpengine.net:sites/<install>/wp-content/uploads/large-file.zip ./

# SCP: upload a file to the server
scp -P 22 ./my-patch.php <install>@<install>.ssh.wpengine.net:sites/<install>/wp-content/plugins/my-plugin/

# rsync: sync wp-content/uploads from production to local (read-only pull)
rsync -avz --progress \
  -e "ssh -p 22" \
  <install>@<install>.ssh.wpengine.net:sites/<install>/wp-content/uploads/ \
  ./local-uploads/

# rsync: push a theme to staging (careful with --delete)
rsync -avz --dry-run \
  -e "ssh -p 22" \
  ./my-theme/ \
  <install>stg@<install>stg.ssh.wpengine.net:sites/<install>stg/wp-content/themes/my-theme/
```

> **WP Engine server path**: WordPress root is `sites/<install>/` relative to the SSH home, or `/home/wpe-user/sites/<install>` as an absolute path. `wp-content/` lives inside that root.

#### Method E — Multiple commands via heredoc

Run several commands in one SSH session without reconnecting:

```bash
# Heredoc over SSH (most efficient — one connection for all commands)
ssh <install>@<install>.ssh.wpengine.net bash -s << 'EOF'
  set -e
  wp cache flush --skip-plugins --skip-themes
  wp rewrite flush --skip-plugins --skip-themes
  wp cron event run --due-now --skip-plugins --skip-themes
  wp core version --skip-plugins --skip-themes
EOF

# Interactive WP-CLI commands need -t (pseudo-TTY allocation)
# e.g. wp shell for a REPL session
ssh -t <install>@<install>.ssh.wpengine.net wp shell
```

#### SSH gateway environment notes

- **Restricted shell**: The gateway provides a limited shell environment. WP-CLI, PHP, basic POSIX utilities (echo, cat, stat, du, find, grep) and rsync/SCP are available. Package installation (`apt`, `yum`), sudo, and arbitrary service management are **not** available.
- **PHP version**: Matches the PHP version configured for that WP Engine install. `php --version` to confirm.
- **WordPress path**: `~/sites/<install>/` (relative to SSH home) or `/home/wpe-user/sites/<install>` (absolute).
- **`--path` flag**: If WP-CLI returns "not a WordPress installation", add `--path=/home/wpe-user/sites/<install>` explicitly.
- **Legacy gateway**: `ssh.wpengine.net` (no subdomain) is the old generic gateway address. Current convention always uses `<install>.ssh.wpengine.net`.

---

### 4) Common remote WP-CLI operations

Always run `--dry-run` or a read-only check first. All examples use Method C aliases.

#### Inspect the environment

```bash
wp @production cli info
wp @production option get siteurl
wp @production option get home
wp @production core version
```

#### Plugin and theme management

```bash
# List all plugins with status
wp @production plugin list --format=json

# Update a specific plugin
wp @production plugin update woocommerce

# Update all plugins (preview first)
wp @production plugin update --all --dry-run
wp @production plugin update --all

# Activate/deactivate
wp @production plugin activate <slug>
wp @production plugin deactivate <slug> --skip-plugins --skip-themes
```

#### Cache flush (always safe post-deploy)

```bash
wp @production cache flush
wp @production rewrite flush
wp @production transient delete --all
```

#### Database operations

```bash
# Export to local file (streams via SSH)
wp @production db export - > backup-$(date +%F-%H%M).sql

# Check DB size
wp @production db size --tables --format=table

# Run a specific query
wp @production db query "SELECT option_name, option_value FROM wp_options WHERE autoload='yes' LIMIT 20"
```

#### Search and replace (migration / domain change)

```bash
# Always dry-run first
wp @production search-replace 'http://old-domain.com' 'https://new-domain.com' \
  --dry-run --report-changed-only

# Then apply (--precise handles serialized data safely)
wp @production search-replace 'http://old-domain.com' 'https://new-domain.com' \
  --precise --report-changed-only

# Flush after replace
wp @production cache flush && wp @production rewrite flush
```

See `wp-wpcli-and-ops` skill → `references/search-replace.md` for full search-replace patterns.

#### User management

```bash
# List admin users
wp @production user list --role=administrator --format=table

# Create a temporary admin (disable after)
wp @production user create tempagent temp@example.com --role=administrator --user_pass=<strong-pass>
# ... do work ...
wp @production user delete tempagent --reassign=1
```

#### Cron inspection and triggering

```bash
wp @production cron event list --format=table
wp @production cron event run --due-now
wp @production cron event run <hook-name>
```

---

### 5) Remote database access

WP Engine provides three methods to access the remote database. No IP allowlisting required.

#### Method A — `wp db query` via SSH gateway (simplest, recommended)

No extra tools or credentials needed — connects through the authenticated SSH tunnel:

```bash
# Interactive query
ssh <install>@<install>.ssh.wpengine.net wp db query 'SELECT post_title FROM wp_posts LIMIT 10;'

# Export full DB (streams to local file)
ssh <install>@<install>.ssh.wpengine.net wp db export - > backup-$(date +%F).sql

# Or via wp-cli.yml alias
wp @production db export - > backup-$(date +%F).sql
wp @production db query 'SELECT option_name, option_value FROM wp_options WHERE autoload="yes" LIMIT 20;'
```

#### Method B — SSH tunnel + GUI tool (MySQL Workbench, Sequel Ace, TablePlus)

First retrieve the DB password from the server:

```bash
# Get DB password from wp-config.php
ssh <install>@<install>.ssh.wpengine.net \
  wp config get DB_PASSWORD --skip-plugins --skip-themes

# Or from the private config file
ssh <install>@<install>.ssh.wpengine.net \
  "grep WPENGINE_SESSION_DB_PASSWORD ./sites/<install>/_wpeprivate/config.json"
```

Start an SSH tunnel with local port forwarding:

```bash
ssh -L 3307:127.0.0.1:3306 <install>@<install>.ssh.wpengine.net
# Keep this terminal open while using your GUI tool
```

Connect your GUI tool with:

| Field | Value |
|-------|-------|
| Connection method | TCP/IP over SSH (or plain TCP once tunnel is open) |
| SSH hostname | `<install>.ssh.wpengine.net` |
| SSH username | `<install>` |
| SSH key file | `~/.ssh/wpengine_ed25519` |
| MySQL host | `127.0.0.1` |
| MySQL port | `3306` (Workbench/Sequel Ace) or `3307` (other tools via tunnel) |
| Database username | `<install>` |
| Database password | from `DB_PASSWORD` / `WPENGINE_SESSION_DB_PASSWORD` |
| Database name | `wp_<install>` |

> **MySQL Workbench**: Use **Standard (TCP/IP) over SSH** connection type — it handles the tunnel internally, no separate `ssh -L` needed.
> **Sequel Ace**: Use **SSH** connection type. If connection times out, increase timeout to 60s in Network settings.
> **TablePlus, DBeaver, DataGrip**: Use TCP mode after opening the `ssh -L 3307:...` tunnel manually.

#### DB credentials location on server

```bash
# From wp-config.php
ssh <install>@<install>.ssh.wpengine.net grep "DB_" sites/<install>/wp-config.php

# From WP Engine private config (includes session password)
ssh <install>@<install>.ssh.wpengine.net cat sites/<install>/_wpeprivate/config.json
```

> DB name format: `wp_<install>` (e.g., `wp_mysite`). The session password in `config.json` as `WPENGINE_SESSION_DB_PASSWORD` may rotate — prefer `DB_PASSWORD` from `wp-config.php` for persistent access.

---

### 6) Pull WP Engine environment to local Playground

Full DB + search-replace workflow for local development:

```bash
# 1. Export DB from WP Engine dev
wp @development db export - > /tmp/wpe-dev-$(date +%F).sql

# 2. Import into local WordPress
wp db import /tmp/wpe-dev-$(date +%F).sql

# 3. Search-replace remote domain with local
wp search-replace 'https://dev.yoursite.wpengine.com' 'http://localhost:9400' \
  --precise --report-changed-only

# 4. Flush caches
wp cache flush && wp rewrite flush

# 5. Remote media — set upload_url_path so images load from the live server
#    (no rsync of wp-content/uploads needed)
wp option update upload_url_path 'https://dev.yoursite.wpengine.com/wp-content/uploads'
# Images and attachments now load from the remote server transparently.
# To revert when done:  wp option delete upload_url_path
```

> **`upload_url_path`**: A WordPress option (`wp_options`) that overrides the base URL
> for all uploaded media. Setting it to the remote server's uploads path means your
> local WordPress loads real images from production/staging without syncing any files.
> Much faster than rsync for GBs of media. Reset it with `wp option delete upload_url_path`
> before deploying.
>
> **Partial-sync alternative**: If you've copied over some recent uploads locally (to
> regenerate image sizes etc.) but want older months to fall back to production,
> use [BE Media from Production](https://github.com/billerickson/BE-Media-from-Production)
> instead. It filters image URLs by date range rather than redirecting everything.
> `upload_url_path` is simpler and works well when you have no local uploads at all.

To also sync actual upload files (when you need local file access, not just URLs):

```bash
# rsync uploads from WP Engine (large — use --dry-run first)
rsync -avz --dry-run \
  -e "ssh -p 22" \
  myinstall@myinstall.ssh.wpengine.net:sites/myinstall/wp-content/uploads/ \
  ./wp-content/uploads/
```

See `wp-bootstrap` skill → `scripts/pull-wpe-env.sh` for the full automated version.

---


For full branch-gated deploys with safety guards, pre-deploy backups, smoke tests, and auto-rollback:

Read: `references/github-actions-deploy.md`

**CI gate policy — no `--no-verify`:**
- All lint, typecheck, tests, and build checks must pass before any push reaches a deploy branch.
- `--no-verify` is explicitly forbidden. Hooks exist to surface problems early — bypass them and you own the breakage.
- The CI gate runs two parallel jobs (`php-gate` + `js-gate`) for every push to a protected branch. Required status check.
- Every deploy workflow runs a `verify` job as its first dependency — deploys never start without it passing.

Read: `references/ci-gate.md`

**Agent-runnable scripts:**

| Script | Purpose | When to use |
|--------|---------|-------------|
| `scripts/ci-gate.sh` | Run the full local CI gate (PHP + JS/TS) | Before any push to a deploy branch |
| `scripts/wpe-preflight.sh` | Pre-deploy sanity checks (SSH, WP, HTTP) | Before triggering a deploy |
| `scripts/wpe-check.sh` | SSH connectivity to all configured installs | After machine setup or debugging SSH |

Run CI gate locally:
```bash
bash {baseDir}/scripts/ci-gate.sh
```

Run pre-deploy preflight:
```bash
INSTALL=mysite bash {baseDir}/scripts/wpe-preflight.sh production
```

Check all SSH connections:
```bash
bash {baseDir}/scripts/wpe-check.sh
```

---

### 10) wpe-labs skills (natural language management)

Load API credentials, then use any `/wpe-labs:*` skill:

```bash
# Load credentials from 1Password for the session
eval $(op run --env-file ~/.config/op-ssh/.env.1pass -- env | grep ^WPE | sed 's/^/export /')
```

| Skill | What it does | Risk |
|---|---|---|
| `/wpe-labs:account-usage` | Bandwidth, visits, storage across accounts | 🟢 Read-only |
| `/wpe-labs:monthly-report` | Client-ready monthly usage report | 🟢 Read-only |
| `/wpe-labs:backups` | On-demand backups + progress monitoring | 🟡 Write |
| `/wpe-labs:cache` | Purge object/page/CDN cache | 🟡 Write |
| `/wpe-labs:users` | List, invite, update roles, remove users | 🟡/🔴 |
| `/wpe-labs:domains` | Manage domains, DNS, SSL | 🟡/🔴 |
| `/wpe-labs:installs` | List, create, copy WordPress installs | 🟡/🔴 |
| `/wpe-labs:offload` | LargeFS media offload config | 🟡 Write |

Example prompts:

```
/wpe-labs:account-usage which accounts are closest to their bandwidth limit?
/wpe-labs:cache purge all cache for uofdev production
/wpe-labs:backups back up uofdev production before deployment
/wpe-labs:installs copy uofdev production to staging
/wpe-labs:monthly-report last month
```

### 11) Re-installing wpe-labs skills

```bash
curl -fsSL https://raw.githubusercontent.com/wpengine/wpe-labs-platform-skills/main/install.sh | bash
```

---

## Verification

| Check | Command |
|---|---|
| Git push SSH | `ssh git@git.wpengine.com info` → `hello <user> / R W <install>` |
| SSH gateway | `ssh <install>@<install>.ssh.wpengine.net wp --info` |
| WP-CLI alias | `wp @production core version` |
| API credentials | `op run --env-file ~/.config/op-ssh/.env.1pass -- bash -c 'curl -s -u "$WPE_USERNAME:$WPE_PASSWORD" https://api.wpengineapi.com/v1/user | jq .email'` |

---

## Safety guardrails for remote operations

- **Always `--dry-run` first** for any search-replace or destructive DB operation.
- **Always export a DB backup** before schema changes or large search-replaces.
- **Use `--skip-plugins --skip-themes`** on production for cache flush, deactivations, and anything where a broken plugin might short-circuit the operation.
- **Prefer staging** for testing WP-CLI commands before running on production.
- **ControlMaster is safe** — it reuses an existing authenticated session; no new credentials are stored.
- **wpe-labs write operations** (`backups`, `cache`, `installs`, `users`, `domains`) should be confirmed before execution.

---

## Failure modes

| Symptom | Fix |
|---|---|
| `Host key verification failed` (git) | `ssh-keyscan git.wpengine.com >> ~/.ssh/known_hosts` |
| `Host key verification failed` (gateway) | Run `ssh-keyscan -H <install>.ssh.wpengine.net >> ~/.ssh/known_hosts` for that specific install hostname. Or add `StrictHostKeyChecking accept-new` to the `*.ssh.wpengine.net` SSH config block — it will auto-accept on first connect. |
| `Permission denied` | Confirm key at `~/.ssh/wpengine_ed25519`, `chmod 600`. Check the key is registered under **SSH Keys** in the WP Engine portal (separate from git push keys). |
| `git push rejected` | Get the exact URL from the portal (`https://my.wpengine.com/installs/<ENV>/git_push`). URL format varies by account — copy it verbatim. |
| SSH gateway hangs | Kill stale ControlMaster socket: `ssh -O stop <install>@<install>.ssh.wpengine.net` |
| `wp: command not found` on gateway | WP Engine's WP-CLI path: try `php /usr/local/bin/wp` or contact WP Engine support |
| WP-CLI returns wrong site | Add `--path=/home/wpe-user/sites/<install>` explicitly |
| `401 Unauthorized` (wpe-labs) | Regenerate API credentials at `https://my.wpengine.com/api_access`, update 1Password item |
| `storage shows zero` (wpe-labs) | Ask to "refresh storage" (async recalculation, ~30–60 s) |

---

## References

- WP Engine SSH gateway docs: `https://wpengine.com/support/ssh-gateway/`
- WP Engine git push portal: `https://my.wpengine.com/installs/<ENV>/git_push`
- WP Engine SSH Keys portal: `https://my.wpengine.com/ssh_keys`
- WP Engine API access: `https://my.wpengine.com/api_access`
- WP-CLI `--ssh` docs: `https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/`
- wpe-labs skills source: `https://github.com/wpengine/wpe-labs-platform-skills`
- SSH setup log (first machine): gist `602d6a16ddfea438c0611a8e5cc31d5e`
