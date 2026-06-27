# Gravity Forms WP-CLI Reference

The Gravity Forms CLI add-on registers `wp gf` subcommands for managing Gravity Forms
and all official add-ons directly from the command line or over SSH.

**Install the CLI add-on first:**
```bash
wp gf install gravityformscli --activate
```

**Set the license key** (required for install/update operations) — use constant, not CLI arg:
```php
// wp-config.php
define('GF_LICENSE_KEY', 'your-license-key');
```

---

## Installation & Updates

### `wp gf install [<slug>]`

Install Gravity Forms or any official add-on.

```bash
# Install Gravity Forms core (reads GF_LICENSE_KEY constant)
wp gf install --force --activate

# Install a specific add-on
wp gf install gravitysmtp --activate
wp gf install gravityformscli --activate
wp gf install gravityformsturnstile --activate
wp gf install gravityformsuserregistration --activate
wp gf install gravityformswebhooks --activate
wp gf install gravityformssignature --activate

# Install with explicit license key (avoid — prefer constant)
wp gf install --key=abc123 --activate
```

| Parameter | Description |
|-----------|-------------|
| `[<slug>]` | Add-on slug (default: `gravityforms`). See slug table below. |
| `--key=<value>` | License key (prefer `GF_LICENSE_KEY` constant) |
| `--version=<value>` | `auto-update`, `hotfix` (default), or `beta` |
| `--force` | Overwrite existing version without prompting |
| `--activate` | Activate immediately after install |

### `wp gf update [<slug>]`

Update Gravity Forms or an add-on.

```bash
wp gf update                    # Update GF core
wp gf update gravitysmtp        # Update Gravity SMTP (check CVE-2026-4020!)
wp gf update gravityformscli
```

### `wp gf check-update [<slug>]`

Check for available updates.

```bash
wp gf check-update
wp gf check-update gravitysmtp --format=json
```

### `wp gf version [<slug>]`

Get installed version.

```bash
wp gf version                   # GF core version
wp gf version gravitysmtp       # Must be ≥ 2.1.5 — see CVE-2026-4020
```

### `wp gf setup [<slug>] [--force]`

Run Gravity Forms database setup (required after fresh install or DB migration).

```bash
wp gf setup --force             # Force re-run setup
wp gf setup gravityformscli     # Set up a specific add-on

# Multisite — run for all sites:
for url in $(wp site list --fields=url --format=csv | tail -n +2); do
  wp gf setup --force --url=$url
done
```

---

## Forms

### `wp gf form list`

```bash
wp gf form list
wp gf form list --active
wp gf form list --format=json
wp gf form list --trash
```

### `wp gf form get <form-id>`

```bash
wp gf form get 1
wp gf form get 1 --format=json
```

### `wp gf form export <form-id> [<path>]`

Export a form as JSON — commit to version control for migration tracking.

```bash
wp gf form export 1 --path=./forms/contact-form.json
wp gf form export 1             # outputs to STDOUT if no path
```

### `wp gf form import <path>`

```bash
wp gf form import ./forms/contact-form.json
```

### `wp gf form create <json>`

```bash
wp gf form create '{"title":"My Form","fields":[...]}'
```

### `wp gf form update <form-id> <json>`

```bash
wp gf form update 1 '{"title":"Updated Title"}'
```

### `wp gf form delete <form-id>`

```bash
wp gf form delete 1             # Moves to trash
wp gf form delete 1 --force     # Permanent delete
```

### `wp gf form duplicate <form-id>`

```bash
wp gf form duplicate 1
```

---

## Entries

### `wp gf entry list`

```bash
wp gf entry list --form_id=1
wp gf entry list --form_id=1 --status=active --format=table
wp gf entry list --form_id=1 --status=spam
```

### `wp gf entry get <entry-id>`

```bash
wp gf entry get 42
wp gf entry get 42 --format=json
wp gf entry get 42 --raw        # raw field values
```

### `wp gf entry export <form-id>`

```bash
wp gf entry export 1 --dir=./exports
wp gf entry export 1 --dir=./exports --format=csv
wp gf entry export 1 --dir=./exports --start_date=2026-01-01 --end_date=2026-06-30
```

### `wp gf entry import <path>`

```bash
wp gf entry import ./exports/entries-form-1.json
```

### `wp gf entry create <form-id> <json>`

```bash
wp gf entry create 1 '{"1":"John Doe","2":"john@example.com"}'
```

### `wp gf entry update <entry-id> <json>`

```bash
wp gf entry update 42 '{"is_starred":1}'
```

### `wp gf entry delete <entry-id>`

```bash
wp gf entry delete 42           # Moves to trash
wp gf entry delete 42 --force   # Permanent
```

---

## Notifications

### `wp gf entry notification get <entry-id>`

Fetch and send notifications for an entry — useful for testing notification routing.

```bash
wp gf entry notification get 42
wp gf entry notification get 42 --event=form_submission
wp gf entry notification get 42 --event=form_submission --format=ids
```

### `wp gf form notification list`

```bash
wp gf form notification get 1   # get all notifications for form 1
```

### `wp gf form notification create/update/delete/duplicate`

```bash
wp gf form notification create 1 '{"name":"Admin Email","to":"{admin_email}"}'
wp gf form notification update 1 <notif-id> '{"to":"custom@example.com"}'
wp gf form notification delete 1 <notif-id>
wp gf form notification duplicate 1 <notif-id>
```

---

## Official add-on slugs (selected)

| Add-On | Slug | CVE? |
|--------|------|------|
| Gravity Forms core | `gravityforms` | — |
| Gravity SMTP | `gravitysmtp` | ⚠️ v2.1.5+ required |
| Gravity Forms CLI | `gravityformscli` | — |
| Cloudflare Turnstile | `gravityformsturnstile` | — |
| User Registration | `gravityformsuserregistration` | — |
| Webhooks | `gravityformswebhooks` | — |
| Signature | `gravityformssignature` | — |
| Polls | `gravityformspolls` | — |
| Survey | `gravityformssurvey` | — |
| Quiz | `gravityformsquiz` | — |
| MailChimp | `gravityformsmailchimp` | — |
| HubSpot | `gravityformshubspot` | — |
| Stripe | `gravityformsstripe` | — |
| reCAPTCHA | `gravityformsrecaptcha` | — |
| Partial Entries | `gravityformspartialentries` | — |
| Conversational Forms | `gravityformsconversationalforms` | — |

Full slug list: `https://docs.gravityforms.com/gravity-forms-add-on-slugs/`

---

## Useful patterns

### Version control: export all forms

```bash
mkdir -p forms
for id in $(wp gf form list --format=ids); do
  wp gf form export $id --path=forms/form-${id}.json
  echo "Exported form $id"
done
```

### Migrate forms between environments

```bash
# On source (WP Engine staging)
wp @staging gf form export 1 --path=/tmp/form-1.json
scp mysitestg@mysitestg.ssh.wpengine.net:/tmp/form-1.json ./forms/

# On target (local or production)
wp gf form import ./forms/form-1.json
```

### Run setup on WP Engine after deploy

```bash
wp @production gf setup --force --skip-plugins --skip-themes
wp @production cache flush --skip-plugins --skip-themes
```

### Check SMTP version immediately after install (CVE-2026-4020)

```bash
SMTP_VER=$(wp gf version gravitysmtp 2>/dev/null || echo "not installed")
echo "Gravity SMTP: $SMTP_VER"
if [[ "$(printf '%s\n' '2.1.5' "$SMTP_VER" | sort -V | head -1)" != "2.1.5" ]]; then
  echo "⚠️  CRITICAL: Update Gravity SMTP to ≥ 2.1.5 (CVE-2026-4020)"
fi
```
