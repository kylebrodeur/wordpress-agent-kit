---
name: wp-gravity-smtp
description: "Use when working with Gravity SMTP: installing, configuring, or troubleshooting WordPress transactional email delivery via SendGrid, Mailgun, Postmark, Brevo, SES, or custom SMTP. Critical: always verify version ≥ 2.1.5 to protect against CVE-2026-4020 which leaks API keys via unauthenticated REST endpoint."
license: GPL-2.0-or-later
optional: true
---

# Gravity SMTP

WordPress transactional email routing and delivery tracking. Gravity SMTP replaces the unreliable default PHP `mail()` with direct API integration to your provider — SendGrid, Mailgun, Postmark, Brevo, Amazon SES, Microsoft 365, Google, or custom SMTP.

**Required on Elite or Nonprofit Gravity Forms license.**

## When to use

- Installing or updating Gravity SMTP
- Configuring an email provider (SendGrid, Mailgun, Postmark, etc.)
- Diagnosing failed email delivery or notification issues
- Auditing credential storage (CVE-2026-4020 mitigation)
- Setting up backup senders or delivery alerts
- Verifying email logging in wp-admin

## ⚠️ CVE-2026-4020 — update immediately

Gravity SMTP ≤ 2.1.4 has an **unauthenticated REST endpoint** that exposes your mail provider API keys. Update to **v2.1.5+** on every environment before any other work.

```bash
wp gf version gravitysmtp    # must be ≥ 2.1.5
wp gf update gravitysmtp     # update if needed
```

## Official documentation

| Resource | URL |
|----------|-----|
| Docs home | https://docs.gravitysmtp.com/ |
| Getting started | https://docs.gravitysmtp.com/getting-started/ |
| Integrations guide | https://docs.gravitysmtp.com/integrations/ |
| User guides | https://docs.gravitysmtp.com/user-guides/ |
| FAQ | https://docs.gravitysmtp.com/faq/ |
| Changelog / releases | https://www.gravityforms.com/gravity-smtp-changelog/ |
| Product page | https://www.gravitysmtp.com/ |
| Pricing (Elite required) | https://www.gravityforms.com/pricing/ |

## Supported providers

| Provider | Type | API key source |
|----------|------|---------------|
| SendGrid | API | https://app.sendgrid.com/settings/api_keys |
| Mailgun | API | https://app.mailgun.com/settings/api_security |
| Postmark | API | https://account.postmarkapp.com/api_tokens |
| Brevo (Sendinblue) | API | https://app.brevo.com/settings/keys/api |
| Amazon SES | API | AWS IAM console |
| Microsoft 365 | OAuth | Azure portal |
| Google / Gmail | OAuth | Google Cloud Console |
| Custom SMTP | SMTP | Your provider |

---

## Procedure

### 1) Install and immediately verify version

```bash
wp gf install gravitysmtp --activate

# IMMEDIATELY check — CVE-2026-4020
SMTP_VER=$(wp gf version gravitysmtp)
echo "Gravity SMTP: $SMTP_VER"
php -r "exit(version_compare('$SMTP_VER','2.1.5','>=') ? 0 : 1);" \
  || echo "❌ CRITICAL: Update to ≥ 2.1.5"
```

### 2) Credential isolation (required)

Store credentials in `wp-config.php` constants loaded from environment variables.
**Never store API keys in `wp_options`** — even if CVE is patched, it's better practice.

```php
// wp-config.php
define('GRAVITY_SMTP_SENDGRID_API_KEY', getenv('SENDGRID_API_KEY'));
define('GRAVITY_SMTP_FROM_EMAIL',       getenv('SMTP_FROM_EMAIL'));
define('GRAVITY_SMTP_FROM_NAME',        'U of Digital');
```

Set the env var in WP Engine (Environment Variables in portal) or via `.env` locally.

### 3) Configure in wp-admin

Navigate to: **Gravity SMTP** (left sidebar) → **Settings** → choose your provider.

### 4) Test delivery

```bash
# Send a test email via WP-CLI
wp eval "wp_mail('test@example.com', 'Test', 'Gravity SMTP test');"
```

Check the email log at **Gravity SMTP → Email Log**.

### 5) CI/CD — check on every deploy

```bash
# In GitHub Actions post-deploy script or wp gf SCRIPT option:
wp gf version gravitysmtp
```

### 6) Backup sender + alerts

Configure in **Gravity SMTP → Settings → Backup Sender** — routes to a fallback if primary fails.
Set up **Gravity SMTP → Settings → Alerts** to get notified on delivery failures.

---

## Security checklist

```bash
# Check version
wp gf version gravitysmtp

# Verify API key is NOT stored in wp_options
wp option get gravitysmtp_sendgrid_api_key 2>/dev/null && \
  echo "⚠️  Key in DB — move to wp-config.php" || echo "✓ Not in wp_options"
```

## References

- `wp-gravity-forms` skill — Installing GF and add-ons via `wp gf`
- CVE details: search `CVE-2026-4020` on NVD or WPScan
