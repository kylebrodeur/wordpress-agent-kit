---
name: wp-wpengine
description: "Optional: Use for WP Engine hosting workflows — SSH-based git push to WP Engine environments, managing installs/domains/cache/backups via the wpe-labs Claude Code skills, and WP Engine API access. Requires WPE_USERNAME and WPE_PASSWORD env vars."
license: GPL-2.0-or-later
optional: true
---

# WP Engine

## When to use

- Deploy WordPress code to a WP Engine environment via `git push`.
- Manage WP Engine installs, domains, cache, backups, or users through natural language.
- Generate monthly usage/bandwidth reports across WP Engine accounts.
- Manage LargeFS media offload configuration.

## Prerequisites

- SSH key for WP Engine git push stored in 1Password (`Employee` vault, item `wpengine_ed25519`).
- WP Engine API credentials in 1Password (`Employee` vault, item `WP Engine API`).
- `op` CLI authenticated (`op whoami` works).
- The `wpe-labs` Claude Code skills installed (`~/.claude/skills/wpe-labs:*`).

## Procedure

### 1) First-time SSH setup on a new machine

Pull the private key from 1Password and configure SSH:

```bash
op read "op://Employee/wpengine_ed25519/private key" > ~/.ssh/wpengine_ed25519
chmod 600 ~/.ssh/wpengine_ed25519
ssh-keyscan git.wpengine.com >> ~/.ssh/known_hosts
```

Add to `~/.ssh/config` (before any `Host *` block):
```
Host git.wpengine.com
  User git
  IdentityFile ~/.ssh/wpengine_ed25519
  IdentitiesOnly yes
```

Verify:
```bash
ssh git@git.wpengine.com info
# Expected: hello <username> / R W <install-name>
```

The public key is already registered on WP Engine — no portal action needed on new machines.

### 2) Add a WP Engine git remote

Find the remote URL on the WP Engine portal: `https://my.wpengine.com/installs/<ENV>/git_push`

```bash
git remote add wpengine git@git.wpengine.com:<install-name>.git
# Example for staging:
git remote add wpengine-staging git@git.wpengine.com:<install-name>stg.git
```

### 3) Deploy via git push

```bash
git push wpengine main
```

- WP Engine deploys the pushed branch automatically.
- Only the WordPress files are pushed (not `node_modules`, build artifacts, etc.).
- After push, WP Engine may take 1–2 min to propagate the deploy.

### 4) wpe-labs skills (natural language management)

Load API credentials, then use any `/wpe-labs:*` skill:

```bash
# Load credentials from 1Password for the session
eval $(op run --env-file ~/.config/op-ssh/.env.1pass -- env | grep ^WPE | sed 's/^/export /')
```

Available skills:

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

### 5) Re-installing wpe-labs skills

```bash
curl -fsSL https://raw.githubusercontent.com/wpengine/wpe-labs-platform-skills/main/install.sh | bash
```

## Verification

- SSH: `ssh git@git.wpengine.com info` — should return `hello <username> / R W <install>`
- API: `op run --env-file ~/.config/op-ssh/.env.1pass -- bash -c 'curl -s -u "$WPE_USERNAME:$WPE_PASSWORD" https://api.wpengineapi.com/v1/user | jq .email'`

## Failure modes

- **SSH: Host key verification failed** — re-run `ssh-keyscan git.wpengine.com >> ~/.ssh/known_hosts`
- **SSH: Permission denied** — confirm the key is at `~/.ssh/wpengine_ed25519` with `chmod 600`
- **git push rejected** — verify the remote URL matches the install name exactly
- **wpe-labs: 401 Unauthorized** — regenerate API credentials at `https://my.wpengine.com/api_access` and update the `WP Engine API` item in 1Password
- **wpe-labs: storage shows zero** — ask Claude to "refresh storage" (async recalculation, ~30–60s)

## References

- WP Engine git push portal: `https://my.wpengine.com/installs/<ENV>/git_push`
- WP Engine API access: `https://my.wpengine.com/api_access`
- wpe-labs skills source: `https://github.com/wpengine/wpe-labs-platform-skills`
- SSH setup log (first machine): gist `602d6a16ddfea438c0611a8e5cc31d5e`
