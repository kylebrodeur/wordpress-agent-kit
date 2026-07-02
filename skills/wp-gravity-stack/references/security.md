# Gravity Stack Security Reference

---

## CVE-2026-4020 — Gravity SMTP API key leak

**Severity:** Critical  
**Affected:** Gravity SMTP ≤ 2.1.4  
**Fix:** Update to v2.1.5 or newer immediately

### What it does

An unauthenticated REST API endpoint in Gravity SMTP ≤ 2.1.4 exposes the
configured mail provider API keys (SendGrid, Amazon SES, Resend, Mailgun)
to any unauthenticated HTTP request.

### Check and fix

```bash
# Check version (every environment, every deploy)
wp gf version gravitysmtp

# Update immediately if < 2.1.5
wp gf update gravitysmtp

# In CI — fail the build if vulnerable
wp_smtp_ver=$(wp gf version gravitysmtp 2>/dev/null || echo "0.0.0")
php -r "exit(version_compare('$wp_smtp_ver', '2.1.5', '>=') ? 0 : 1);" || {
  echo "❌ CVE-2026-4020: Gravity SMTP $wp_smtp_ver is vulnerable"
  exit 1
}
```

### Mitigate credential exposure

Store SMTP credentials in `wp-config.php` constants, **not** in the database
(`wp_options`) where REST API or DB readers can access them:

```php
// wp-config.php — use env vars, not hardcoded values
define('GRAVITY_SMTP_SENDGRID_API_KEY', getenv('SENDGRID_API_KEY'));
define('GRAVITY_SMTP_FROM_EMAIL', 'noreply@yourdomain.com');
```

Even if a future vulnerability leaks database options, constants in
`wp-config.php` loaded from environment variables remain safe.

---

## Gravity Connect — token ceilings

Uncapped OpenAI feeds can drain API budgets through:
- Long conversational loops (agent re-invocations)
- Repeated form submissions during testing
- Malicious automated submissions

**Every Connect feed must have `Maximum Tokens` configured:**

| Task | Suggested max tokens |
|------|----------------------|
| Categorization / tagging | 50–100 |
| Email draft | 200–400 |
| Summary | 150–250 |
| Grammar check | 100–200 |
| Document routing | 50–100 |

Also set alerts in your OpenAI/OpenRouter dashboard for unexpected spend spikes.

---

## Gravity Forms — anti-spam for AI bots

Standard honeypots fail against sophisticated browser-based AI agents.

**Layer 1: Cloudflare Turnstile** (server-side challenge)
```bash
wp gf install gravityformsturnstile --activate
```
Configure at: Forms → Settings → Turnstile. Use "Managed" mode for best UX.

**Layer 2: Rate limiting**
```php
// functions.php or mu-plugin — limit submissions per IP per hour
add_filter('gform_entry_created', function($entry, $form) {
    $ip = $entry['ip'];
    $count = get_transient("gf_submissions_{$ip}") ?: 0;
    if ($count > 10) {
        wp_die('Rate limit exceeded', 429);
    }
    set_transient("gf_submissions_{$ip}", $count + 1, HOUR_IN_SECONDS);
}, 10, 2);
```

**Layer 3: Programmatic submission gates**
```php
// Validate before Gravity Connect processes the entry
add_action('gform_after_submission', function($entry, $form) {
    if ($form['id'] === 5) {
        // Verify the submission looks human-generated
        $content = rgar($entry, '3');
        if (strlen($content) < 10 || preg_match('/http[s]?:\/\//', $content)) {
            GFAPI::update_entry_property($entry['id'], 'status', 'spam');
        }
    }
}, 5, 2);
```

---

## GravityView — prevent metadata exposure

Always restrict sensitive fields in public-facing views:

```php
// Prevent sensitive field values from rendering in public views
add_filter('gravityview/fields/custom/content_after', function($content, $field) {
    if (!is_user_logged_in() && in_array($field->ID, ['ssn', 'internal_notes', 'api_key'])) {
        return '—';
    }
    return $content;
}, 10, 2);
```

Set entry ownership to prevent users viewing each other's data:

```
View Settings → Filter Entries → Created By: Current User
```

---

## Pods — SQL injection via ACT queries

When writing custom queries against Pods ACT tables, never interpolate user input:

```php
global $wpdb;

// WRONG — SQL injection risk
$results = $wpdb->get_results(
    "SELECT * FROM wp_pods_program WHERE title = '" . $_GET['title'] . "'"
);

// RIGHT — use $wpdb->prepare()
$results = $wpdb->get_results(
    $wpdb->prepare("SELECT * FROM wp_pods_program WHERE title = %s", sanitize_text_field($_GET['title']))
);

// BEST — use the Pods API
$pods = pods('program', ['where' => 'title = "' . pods_sanitize($_GET['title']) . '"']);
```

---

## Credential checklist for WP Engine environments

Run this on every new environment to verify no credentials are exposed:

```bash
#!/usr/bin/env bash
# Check that sensitive credentials are NOT stored in wp_options
INSTALL="${1:-mysite}"

echo "=== Credential exposure check: $INSTALL ==="

ssh ${INSTALL}@${INSTALL}.ssh.wpengine.net bash -s << 'REMOTE'
  set -e

  # Check Gravity SMTP version
  SMTP_VER=$(wp gf version gravitysmtp 2>/dev/null || echo "not installed")
  if php -r "exit(version_compare('$SMTP_VER', '2.1.5', '>=') ? 0 : 1);" 2>/dev/null; then
    echo "✓ Gravity SMTP: $SMTP_VER"
  else
    echo "❌ CVE-2026-4020: Gravity SMTP $SMTP_VER is VULNERABLE"
  fi

  # Check that SMTP API key is not in wp_options
  SMTP_KEY_IN_DB=$(wp option get gravitysmtp_sendgrid_api_key 2>/dev/null | wc -c)
  if [ "$SMTP_KEY_IN_DB" -gt 5 ]; then
    echo "⚠️  Gravity SMTP key stored in DB — move to wp-config.php constant"
  else
    echo "✓ Gravity SMTP: credentials not in wp_options"
  fi

  # Check GF license not exposed
  GF_KEY_IN_DB=$(wp option get gravityformsaddon_gravityforms_settings 2>/dev/null | grep -c '"license_key"' || echo 0)
  if [ "$GF_KEY_IN_DB" -gt 0 ]; then
    echo "⚠️  GF license key may be in wp_options — prefer GF_LICENSE_KEY constant"
  fi

  echo "=== Check complete ==="
REMOTE
```
