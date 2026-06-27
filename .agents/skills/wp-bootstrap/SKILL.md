---
name: wp-bootstrap
description: "Bootstrap a new or existing WordPress project with the full wp-agent-kit system: monorepo detection, Composer/WPackagist/SatisPress setup, Playground local dev, WP Engine dev/staging/production, CI gate, git hooks, and plugin packaging. Use when setting up a new WordPress project from scratch, onboarding an existing codebase, or wiring up a monorepo with multiple plugins/themes."
license: GPL-2.0-or-later
optional: true
---

# WordPress Project Bootstrapper

One command to wire a WordPress project (single plugin, block theme, or monorepo with
multiple packages) into the full wp-agent-kit system: local Playground dev, WP Engine
deploy environments, Composer-managed PHP deps, CI gate, and git hooks.

## When to use

- Setting up a new WordPress plugin, theme, or block theme from scratch.
- Onboarding an existing codebase to use the full agent toolkit.
- Wiring up a monorepo (multiple plugins/themes + JS packages in one repo) — like the
  wp-agent-os pattern: `wpaos/` + `wpaos-blocks/` + `wpaos-theme/` + JS packages.
- Adding Composer (WPackagist + optional SatisPress) to a WordPress project.
- Configuring WP Engine dev/staging/production + GitHub Actions CI/CD.

## What gets set up

| Component | What | Where |
|-----------|------|-------|
| Agent kit | Skills, agents, instructions | `.agents/skills/` + `.github/` |
| PHP tooling | PHPCS + PHPStan + Pest | `composer.json` + `phpcs.xml.dist` + `phpstan.neon.dist` |
| JS tooling | Biome (lint+format) | `biome.json` |
| Git hooks | Pre-push gate | `.githooks/pre-push` |
| One-command setup | `tools/setup.sh` | `tools/setup.sh` |
| WP-CLI aliases | Local path + WPE SSH | `wp-cli.yml` |
| Playground | Multi-mount interactive + headless verify | `tools/playground/` |
| WP Engine CI/CD | Branch-gated deploy workflows | `.github/workflows/` |
| Plugin packaging | Build + zip for upload | `tools/package-wp.sh` |
| Composer | WPackagist + optional SatisPress | `composer.json` + `auth.json` |
| Config | Monorepo layout declaration | `wp-bootstrap.config.json` |

---

## Procedure

### 1) Probe the repository (always first)

Run the structure detector. It identifies WP packages, JS workspaces, existing tooling,
WP Engine remotes, **GitHub CLI status, existing secrets, and branch protection**.

```bash
node {baseDir}/scripts/detect-structure.mjs --pretty
```

Key fields in the output:

| Field | What it tells you |
|-------|------------------|
| `isMonorepo` | Multiple WP packages or JS workspaces |
| `wpPackages[]` | Plugin/theme dirs, slugs, versions |
| `wpRoot` | Where WP core lives (null = Playground-only) |
| `wpeRemotes[]` | Existing WP Engine git remotes |
| `php.hasPhpcs` | PHPCS already configured |
| `js.hasBiome` | Biome already configured |
| `playground.hasPlayground` | Playground scripts/blueprints already exist |
| `hasAgentKit` | wp-agent-kit already installed |
| `github.ghInstalled` | `gh` CLI available |
| `github.authenticated` | `gh auth status` passes |
| `github.existingSecrets[]` | GitHub Actions secrets already set |
| `github.missingSecrets[]` | Required WPE secrets not yet set |
| `github.branchProtection` | Protection status per branch |

For JSON output (useful in scripts/CI):
```bash
node {baseDir}/scripts/detect-structure.mjs
```

Read: `references/monorepo-patterns.md` to match the detected structure to a known pattern.

---

### 2) Ask what the probe couldn't determine

If any of these are unknown after the probe, ask the user before proceeding:

| Question | When to ask |
|----------|------------|
| WP Engine install slugs (prod/staging/dev)? | `wpeRemotes` is empty |
| WP root path (or Playground-only)? | `wpRoot` is null AND WP packages found |
| Build command for generated packages? | Has generated `*-blocks` or `*-theme` packages |
| SatisPress URL + API key? | User has premium plugins to manage |
| Package manager preference? | `packageManager` is null |
| Deploy strategy for monorepo? | Multiple WP packages + no WPE remotes |
| Is `gh` CLI installed and authenticated? | Check `github.ghInstalled` and `github.authenticated` |

---

### 3) Install the agent kit

```bash
wp-agent-kit install . --platform github
```

Or for Pi:
```bash
wp-agent-kit install . --platform pi
```

This installs `.agents/skills/`, `.github/agents/`, `.github/instructions/`, and `AGENTS.md`.

---

### 4) Set up PHP tooling

If `php.hasComposer` is false or `php.hasPhpcs` is false:

```bash
# Create root composer.json (dev tooling — not shipped)
# See references/composer-setup.md for the full template
composer init --no-interaction
composer require --dev squizlabs/php_codesniffer wp-coding-standards/wpcs \
  phpcompatibility/phpcompatibility-wp dealerdirect/phpcodesniffer-composer-installer \
  szepeviktor/phpstan-wordpress

# Register WordPress standards
composer run register-standards
```

For plugin-level tests (Pest), in each plugin directory:
```bash
cd <plugin-dir>
composer require --dev pestphp/pest
```

Read: `references/composer-setup.md` for `phpcs.xml.dist` and `phpstan.neon.dist` templates.

---

### 5) Set up Composer repositories

**WPackagist** (free, for wordpress.org plugins/themes):
```bash
composer config repositories.wpackagist composer https://wpackagist.org
composer require composer/installers
```

**SatisPress** (optional, for premium plugins):
```bash
composer config repositories.satispress composer https://<your-satispress-site>/satispress/
composer config http-basic.<your-satispress-site> <API_KEY> satispress
```

Read: `references/composer-setup.md` for auth.json and full setup.

---

### 6) Set up JS tooling (Biome)

If `js.hasBiome` is false:
```bash
npm install --save-dev @biomejs/biome
npx biome init
```

Update `biome.json` to match project style. Reference: wp-agent-os uses:
- `indentStyle: "space"`, `indentWidth: 2` (for monorepos with JS packages)
- `indentStyle: "tab"` (for TS/JS-only projects like wp-agent-kit itself)
- Excludes: `wpaos-blocks/`, `wpaos-theme/` (generated), `dist/`, `vendor/`

---

### 7) Set up git hooks

Create `.githooks/pre-push` (no Husky dependency — works in all setups):

```bash
mkdir -p .githooks
# See ci-gate.md in wp-wpengine skill for the full template
cat > .githooks/pre-push << 'HOOK'
#!/usr/bin/env bash
set -uo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
bash .agents/skills/wp-bootstrap/scripts/ci-gate.sh || exit 1
HOOK
chmod +x .githooks/pre-push

# Activate
git config core.hooksPath .githooks
```

Or run the bootstrap script which handles all of this:
```bash
bash {baseDir}/scripts/bootstrap.sh
```

---

### 8) Create `wp-cli.yml`

```yaml
# wp-cli.yml — WP-CLI targeting. Commit to repo.

# Local (if WP is in this repo)
# path: ./web     # Bedrock style
# path: .         # WP at root

@production:
  ssh: <install>@<install>.ssh.wpengine.net
  path: /home/wpe-user/sites/<install>

@staging:
  ssh: <install>stg@<install>stg.ssh.wpengine.net
  path: /home/wpe-user/sites/<install>stg

@development:
  ssh: <install>dev@<install>dev.ssh.wpengine.net
  path: /home/wpe-user/sites/<install>dev
```

---

### 9) Set up WordPress Playground

Start interactive Playground with all local plugins/themes mounted:
```bash
bash {baseDir}/scripts/playground-start.sh
```

Run headless verification (no browser):
```bash
bash {baseDir}/scripts/playground-verify.sh
```

Package plugins for upload to live sites:
```bash
bash {baseDir}/scripts/package-wp.sh
```

Read: `references/monorepo-patterns.md` for multi-mount configurations.

---

### 10) Set up GitHub repo with `gh` CLI

If `github.ghInstalled` is true, use the GitHub setup script to:
- Verify authentication and repo access
- Check which required secrets are already set
- Set missing secrets interactively (SSH key, known hosts, WPE install slugs, API credentials)
- Configure branch protection for `main`, `staging`, and `develop`

```bash
# Check-only first (no changes)
bash {baseDir}/scripts/setup-github.sh --check-only

# Set missing secrets interactively
bash {baseDir}/scripts/setup-github.sh --set-secrets

# Configure branch protection
bash {baseDir}/scripts/setup-github.sh --set-protection

# Do everything at once
bash {baseDir}/scripts/setup-github.sh --set-all

# Pass WPE slugs to skip those prompts
bash {baseDir}/scripts/setup-github.sh --set-all \
  --wpe-prod=mysite --wpe-staging=mysitestg --wpe-dev=mysitedev
```

The script handles `WPE_SSH_KNOWN_HOSTS` automatically via `ssh-keyscan`, and reads
`WPE_SSH_KEY` from `~/.ssh/wpengine_ed25519` if present (or from 1Password via `op read`).

> If `gh` is not installed: `brew install gh` (macOS) or see https://cli.github.com.
> After install: `gh auth login`.

---

### 11) Set up WP Engine GitHub Actions CI/CD

Read the `wp-wpengine` skill:
- `references/ci-gate.md` — CI gate with PHP + JS parallel jobs, no-verify policy
- `references/github-actions-deploy.md` — deploy workflows for dev/staging/production

Required GitHub Secrets:
```
WPE_SSH_KEY              — private key for WP Engine SSH
WPE_SSH_KNOWN_HOSTS      — output of ssh-keyscan for git.wpengine.com
WPE_PROD_INSTALL         — production install slug
WPE_PROD_GIT_URL         — exact URL from WPE portal (git_push page)
WPE_STAGING_INSTALL / WPE_STAGING_GIT_URL
WPE_DEV_INSTALL / WPE_DEV_GIT_URL
WPE_API_USER / WPE_API_PASSWORD  — for pre-deploy DB backups
```

---

## Agent scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/detect-structure.mjs` | Probe repo structure + GitHub status → JSON | `node {baseDir}/scripts/detect-structure.mjs [--pretty]` |
| `scripts/bootstrap.sh` | One-command setup (hooks + PHP + JS deps) | `bash {baseDir}/scripts/bootstrap.sh` |
| `scripts/setup-github.sh` | Check/set GitHub secrets + branch protection via `gh` | `bash {baseDir}/scripts/setup-github.sh [--set-all]` |
| `scripts/package-wp.sh` | Build + zip WP plugins/themes | `bash {baseDir}/scripts/package-wp.sh [--dry-run]` |
| `scripts/playground-start.sh` | Start interactive Playground | `bash {baseDir}/scripts/playground-start.sh` |
| `scripts/playground-verify.sh` | Headless WP verification | `bash {baseDir}/scripts/playground-verify.sh` |

---

## References

- `references/monorepo-patterns.md` — WordPress monorepo structure patterns
- `references/composer-setup.md` — Composer, WPackagist, SatisPress setup
- `wp-wpengine` skill → `references/ci-gate.md` — PHP + JS CI gates, no-verify policy
- `wp-wpengine` skill → `references/github-actions-deploy.md` — deploy workflows
- `wp-playground` skill — Playground CLI, blueprints, PHPUnit, Playwright E2E
- `wp-phpstan` skill — PHPStan configuration for WordPress
