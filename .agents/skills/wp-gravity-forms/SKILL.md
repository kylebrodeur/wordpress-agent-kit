---
name: wp-gravity-forms
description: "Use when working with Gravity Forms: installing or updating core and add-ons via wp gf CLI, managing forms and entries programmatically, exporting/importing form JSON for version control, testing notifications, configuring Cloudflare Turnstile anti-spam, or turning forms into MCP-compatible schemas for AI consumption. Also use for the GFAPI PHP class and hook/filter development."
license: GPL-2.0-or-later
optional: true
---

# Gravity Forms

Structured form handling and transactional input for WordPress. Gravity Forms serves as the primary data collection endpoint in the Gravity stack, feeding entries into SMTP delivery, GravityView display, Gravity Connect AI processing, and GravityKit workflows.

## When to use

- Installing, updating, or verifying Gravity Forms or official add-ons via `wp gf`
- Managing forms and entries from the command line
- Version-controlling form definitions as JSON
- Testing notifications and confirmations
- Configuring anti-spam for AI bots (Cloudflare Turnstile)
- Writing `GFAPI`-based PHP (not direct DB writes)
- Serializing form schemas for MCP/AI pipelines

## Official documentation

| Resource | URL |
|----------|-----|
| Docs home | https://docs.gravityforms.com/ |
| Getting started | https://docs.gravityforms.com/getting-started/ |
| User guides | https://docs.gravityforms.com/category/user-guides/ |
| Gravity Forms 3.0 beta | https://docs.gravityforms.com/category/user-guides/ |
| WP-CLI reference | https://docs.gravityforms.com/manage-gravity-forms-and-add-ons-with-wpcli/ |
| Add-on slugs | https://docs.gravityforms.com/gravity-forms-add-on-slugs/ |
| Developer API (GFAPI) | https://docs.gravityforms.com/api-functions |
| Developer docs | https://docs.gravityforms.com/category/developers/ |
| Hooks & filters | https://docs.gravityforms.com/category/developers/hooks/ |
| Form object | https://docs.gravityforms.com/form-object |
| Entry object | https://docs.gravityforms.com/entry-object |
| Field object | https://docs.gravityforms.com/field-object |
| Merge tags | https://docs.gravityforms.com/category/user-guides/merge-tags-getting-started/ |
| Conditional logic | https://docs.gravityforms.com/category/user-guides/conditional-logic/ |
| Spam & protection | https://docs.gravityforms.com/category/user-guides/spam-detection-and-protection/ |
| Add-On Framework | https://docs.gravityforms.com/category/developers/php-api/add-on-framework/ |
| REST API | https://docs.gravityforms.com/category/developers/rest-api/ |
| Demo | https://www.gravityforms.com/gravity-forms-demo/ |
| Pricing & licenses | https://www.gravityforms.com/pricing/ |

## GitHub

| Repo | Purpose |
|------|---------|
| `gravityforms/gravityformscli` | Official WP-CLI add-on (wp gf commands) |
| `gravitywiz/snippet-library` | 1000+ community hooks and filters for AI training |

- https://github.com/gravityforms/gravityformscli
- https://github.com/gravitywiz/snippet-library

---

## Procedure

### 0) Guardrails

- Always use `GFAPI` — never write directly to `wp_rg_lead_*` tables
- Set `GF_LICENSE_KEY` in `wp-config.php`, not as a CLI argument
- After any install/update, run `wp gf setup --force` to apply DB migrations
- Run `wp gf version gravitysmtp` and check CVE-2026-4020 — see `wp-gravity-smtp` skill

### 1) Install and verify

```bash
# Requires GF_LICENSE_KEY constant in wp-config.php:
# define('GF_LICENSE_KEY', 'your-key-here');

wp gf install --force --activate
wp gf install gravityformscli --activate
wp gf install gravitysmtp --activate      # ⚠️  verify version ≥ 2.1.5 immediately
wp gf install gravityformsturnstile --activate
wp gf install gravityformsuserregistration --activate
wp gf install gravityformswebhooks --activate
wp gf setup --force
wp gf version
```

### 2) Form management

```bash
wp gf form list --active --format=table
wp gf form export 1 --path=./forms/contact-form.json   # commit to git
wp gf form import ./forms/contact-form.json
wp gf form duplicate 1

# Export all forms
mkdir -p forms
for id in $(wp gf form list --format=ids); do
  wp gf form export $id --path=forms/form-${id}.json
done
```

### 3) Entry management

```bash
wp gf entry list --form_id=1 --status=active --format=table
wp gf entry get 42 --format=json
wp gf entry export 1 --dir=./exports --format=csv
wp gf entry export 1 --dir=./exports --start_date=2026-01-01
wp gf entry notification get 42 --event=form_submission   # test notifications
```

### 4) GFAPI — correct PHP patterns

```php
// ✅ Always use GFAPI
$entry  = GFAPI::get_entry($entry_id);
$form   = GFAPI::get_form($form_id);
$result = GFAPI::add_entry($entry_data);
GFAPI::update_entry($entry);

// ❌ Never write directly to wp_rg_lead_* tables
global $wpdb;
$wpdb->update('wp_rg_lead', [...]); // never
```

### 5) MCP-compatible JSON schema

```php
$form   = GFAPI::get_form(1);
$schema = ['form_id' => $form['id'], 'title' => $form['title'],
    'fields' => array_map(fn($f) => [
        'id' => $f->id, 'label' => $f->label,
        'type' => $f->type, 'required' => $f->isRequired,
        'choices' => $f->choices ?? null,
    ], $form['fields'])];
file_put_contents(ABSPATH . 'llms-form-schema.json', json_encode($schema, JSON_PRETTY_PRINT));
```

### 6) Anti-spam for AI bots

```bash
wp gf install gravityformsturnstile --activate
# Configure: Forms → Settings → Turnstile → "Managed" mode
```

### 7) Remote management (WP Engine)

```bash
wp @production gf check-update
wp @production gf update
wp @production gf setup --force --skip-plugins --skip-themes
wp @production cache flush --skip-plugins --skip-themes
```

---

## Agent scripts

```bash
bash {baseDir}/scripts/gf-inspect.sh             # local audit
bash {baseDir}/scripts/gf-inspect.sh --remote    # WP Engine via SSH
```

## References

- `references/gravity-forms-cli.md` — Full `wp gf` command reference
- `wp-gravity-smtp` skill — SMTP delivery and CVE-2026-4020
- `wp-gravity-connect` skill — OpenAI integration
- `wp-gravityview` skill — Front-end entry display
- `wp-gravity-wiz` skill — Spellbook, Perks, GP Populate Anything
- `wp-wpcli-and-ops` skill — General WP-CLI patterns
