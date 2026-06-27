---
name: wp-gravity-stack
description: "Use when developing with Gravity Forms, Gravity SMTP, Gravity Wiz (Spellbook/Perks), Gravity Connect (OpenAI), GravityView, and Pods Framework. Covers WP-CLI (wp gf *), SatisPress configuration, CVE-2026-4020 security fix, AI integration patterns, and the full dev workflow for WP Engine environments."
license: GPL-2.0-or-later
optional: true
---

# WordPress Gravity Stack

The Gravity ecosystem: Gravity Forms, Gravity SMTP, Gravity Wiz Spellbook, Gravity Connect (OpenAI), GravityView, and Pods Framework. Used for structured data collection, AI-driven form processing, transactional email, and custom content types.

## When to use

- Installing, updating, or configuring Gravity Forms or any add-on via WP-CLI
- Managing forms, entries, notifications, or fields programmatically
- Setting up Pods CPTs/ACTs alongside Gravity Forms
- Configuring Gravity Connect (OpenAI) feeds and fields
- Setting up GravityView outputs
- Auditing or fixing Gravity SMTP security (CVE-2026-4020)
- Scaffolding `composer.json` with SatisPress for premium plugins
- Pulling AI patterns from Gravity Connect (OpenAI Feeds vs Fields)

## Prerequisites

- Gravity Forms CLI add-on active: `wp gf version` works
- `GF_LICENSE_KEY` constant set in `wp-config.php` (for CI/WP Engine installs)
- SatisPress instance configured for premium Gravity plugins (if using Composer)
- PHP 8.1+, WP 6.7+

---

## Procedure

### 0) Guardrails

- **CVE-2026-4020**: Gravity SMTP ≤ v2.1.4 leaks API keys (SendGrid, SES, Resend, Mailgun) via unauthenticated REST endpoint. **Update to v2.1.5+ immediately.** See `references/security.md`.
- Always run `wp gf check-update` before modifying forms on a fresh environment.
- Never hard-code license keys. Use `GF_LICENSE_KEY` constant in `wp-config.php` or environment variables.

### 1) Install and verify the stack

```bash
# Set license key constant in wp-config.php first:
# define('GF_LICENSE_KEY', 'your-key-here');

# Install/update Gravity Forms core
wp gf install --force --activate

# Install Gravity SMTP (must be ≥ 2.1.5 — check version immediately)
wp gf install gravitysmtp --activate

# IMMEDIATELY check version — patch CVE-2026-4020
wp gf version gravitysmtp

# Install Gravity Forms CLI add-on
wp gf install gravityformscli --activate

# Install Cloudflare Turnstile (anti-spam for AI bots)
wp gf install gravityformsturnstile --activate

# Install User Registration add-on (if needed)
wp gf install gravityformsuserregistration --activate

# Install Webhooks (for Gravity Connect backend routing)
wp gf install gravityformswebhooks --activate

# Run DB setup after installs
wp gf setup --force

# Verify all
wp gf version
wp plugin list --status=active --format=table
```

For premium Gravity Wiz / GravityView plugins, use SatisPress + Composer:

```bash
composer require satispress/spellbook satispress/gravity-connect satispress/gravityview
wp plugin activate spellbook gravity-connect gravityview
```

See `references/satispress-config.md` for the full `composer.json`.

### 2) Gravity Forms CLI — forms and entries

Read: `references/gravity-forms-cli.md` for the full `wp gf` command reference.

Quick reference:

```bash
# List all forms
wp gf form list --format=table

# Export a form as JSON (for version control or migration)
wp gf form export 1 --path=./forms/contact-form.json

# Import a form
wp gf form import ./forms/contact-form.json

# List entries for a form
wp gf entry list --form_id=1 --status=active --format=table

# Export entries to CSV
wp gf entry export 1 --dir=./exports --format=csv

# Send notifications manually (useful for testing)
wp gf entry notification get 1 --event=form_submission
```

### 3) Pods Framework setup

Read: `references/gravity-stack-ai.md` → Pods section for ACT vs postmeta decision.

```bash
# Install Pods via WPackagist (open-source core)
wp plugin install pods --activate

# Verify Pods is active
wp plugin status pods

# Use pods_field() in code — never get_post_meta() for Pods-managed fields
# Expose fields via REST for LLM/MCP access
```

Key decision before any AI integration: **Is the Pod using postmeta or ACT?**
- `postmeta` → standard WP_Query, works with most tools
- `ACT` (Advanced Content Type) → custom DB table, requires `pods_field()` or direct table queries

### 4) Gravity Connect (OpenAI) — AI integration patterns

Read: `references/gravity-stack-ai.md` → Gravity Connect section.

**Fields vs Feeds strategy:**
- **OpenAI Fields**: Real-time generation *before* form submission (translation, grammar, live summary)
- **OpenAI Feeds**: Post-submission processing (email drafting, tagging, routing, classification)

Always set a `Maximum Tokens` limit on every Connect feed to prevent runaway API costs.

### 5) Check for updates on WP Engine

```bash
# Check all Gravity add-ons for updates
wp gf check-update
wp gf check-update gravitysmtp

# Update all
wp gf update
wp gf update gravitysmtp

# Run DB migrations after updates
wp gf setup --force
wp cache flush --skip-plugins --skip-themes
```

---

## Agent scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/gf-inspect.sh` | Audit GF install: versions, forms, SMTP security | `bash {baseDir}/scripts/gf-inspect.sh` |
| `wp-bootstrap/scripts/pull-wpe-env.sh` | Pull WP Engine DB to local | `INSTALL=mysite bash {baseDir}/../wp-bootstrap/scripts/pull-wpe-env.sh staging` |

Run GF inspection:
```bash
bash {baseDir}/scripts/gf-inspect.sh
# Or on WP Engine remote:
INSTALL=mysite bash {baseDir}/scripts/gf-inspect.sh --remote
```

---

## References

- `references/gravity-forms-cli.md` — Full `wp gf` command reference
- `references/gravity-stack-ai.md` — AI patterns, Pods ACT vs postmeta, token ceilings
- `references/satispress-config.md` — composer.json for the full plugin stack
- `references/security.md` — CVE-2026-4020, credential isolation, anti-spam
- `wp-wpcli-and-ops` skill — general WP-CLI patterns (search-replace, DB, cron)
- `wp-wpengine` skill — WP Engine SSH gateway, remote DB, deploy workflows
