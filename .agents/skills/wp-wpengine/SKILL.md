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
# Trust WP Engine SSH gateway
ssh-keyscan -H ssh.wpengine.net >> ~/.ssh/known_hosts
```

Add to `~/.ssh/config` (before any `Host *` block):

```
# WP Engine git push
Host git.wpengine.com
  User git
  IdentityFile ~/.ssh/wpengine_ed25519
  IdentitiesOnly yes

# WP Engine SSH gateway (WP-CLI + direct access)
Host *.ssh.wpengine.net
  IdentityFile ~/.ssh/wpengine_ed25519
  IdentitiesOnly yes
  ControlMaster auto
  ControlPath ~/.ssh/wpe-%r@%h:%p
  ControlPersist 10m
```

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

### 2) Deploy via git push

**Always get the exact remote URL from the WP Engine portal** — it includes the environment prefix:
`https://my.wpengine.com/installs/<ENV>/git_push`

The URL format is: `git@git.wpengine.com:<environment>/<install-name>.git`  
where `<environment>` is `production`, `staging`, or `development`.

```bash
# Production (copy exact URL from portal)
git remote add wpengine-prod git@git.wpengine.com:production/<install-name>.git

# Staging
git remote add wpengine-staging git@git.wpengine.com:staging/<install-name>stg.git

# Development
git remote add wpengine-dev git@git.wpengine.com:development/<install-name>dev.git
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

### 7) GitHub Actions CI/CD pipeline

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

### 8) wpe-labs skills (natural language management)

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

### 9) Re-installing wpe-labs skills

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
| `Host key verification failed` (gateway) | `ssh-keyscan -H ssh.wpengine.net >> ~/.ssh/known_hosts` |
| `Permission denied` | Confirm key at `~/.ssh/wpengine_ed25519`, `chmod 600`. Check the key is registered under **SSH Keys** in the WP Engine portal (separate from git push keys). |
| `git push rejected` | Verify remote URL includes environment prefix (`production/<install>.git`). Get the exact URL from the portal: `https://my.wpengine.com/installs/<ENV>/git_push` |
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
