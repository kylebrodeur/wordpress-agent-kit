---
name: wp-gravity-wiz
description: "Use when working with Gravity Wiz products: installing or managing Spellbook (the Gravity Wiz platform), Gravity Perks (48+ form enhancement plugins like GP Populate Anything, Nested Forms, Limit Submissions), or any individual perk. Also use for Gravity Shop (WooCommerce integration)."
license: GPL-2.0-or-later
optional: true
---

# Gravity Wiz — Spellbook, Perks & Extensions

Gravity Wiz makes the Gravity ecosystem: **Spellbook** (unified platform), **Gravity Perks** (48+ form enhancements), **Gravity Connect** (external service integrations), and **Gravity Shop** (WooCommerce). All products install and update through Spellbook.

## When to use

- Installing or activating Spellbook and any Gravity Wiz product
- Working with Gravity Perks (GP Populate Anything, Nested Forms, Limit Submissions, etc.)
- Upgrading from legacy Gravity Perks individual installers to Spellbook
- Troubleshooting perk conflicts or perk-specific settings
- Setting up GP Populate Anything for AI-driven dynamic form population
- Managing licenses from account.gravitywiz.com

## Official documentation

| Resource | URL |
|----------|-----|
| Spellbook docs | https://gravitywiz.com/documentation/spellbook/ |
| Gravity Perks docs | https://gravitywiz.com/documentation/gravity-perks/ |
| Gravity Connect docs | https://gravitywiz.com/documentation/gravity-connect/ |
| Gravity Shop docs | https://gravitywiz.com/documentation/gravity-shop-product-configurator/ |
| Available perks list | https://gravitywiz.com/available-perks/ |
| Snippet library | https://gravitywiz.com/snippet-library/ |
| Account dashboard | https://account.gravitywiz.com/ |
| Downloads | https://account.gravitywiz.com/downloads |
| Support | https://gravitywiz.com/support/ |
| FAQ | https://gravitywiz.com/documentation/gravity-perks-account-faq/ |
| License FAQ | https://gravitywiz.com/documentation/license-faq/ |

## GitHub

| Repo | Purpose |
|------|---------|
| `gravitywiz/snippet-library` | 1000+ hooks and filters — excellent for AI training context |

- https://github.com/gravitywiz/snippet-library

---

## Procedure

### 1) Install Spellbook (the platform — install first)

All Gravity Wiz products install through Spellbook:

1. Download from: https://gravitywiz.com/download/spellbook  
   (or from account: https://account.gravitywiz.com/downloads)
2. Install:

```bash
wp plugin install path/to/spellbook.zip --activate
```

3. **Activate your license** in wp-admin: **Spellbook → Account**
4. Spellbook auto-deactivates legacy Gravity Perks if it was installed.

### 2) Install individual products/perks

From wp-admin: **Spellbook → Perks** (or **Connect** or **Shop**):
- Browse or search products
- Click **Activate** — Spellbook handles download and activation automatically

For CLI/automated installs after Spellbook is active:

```bash
# Spellbook manages its own update mechanism — use the UI or its WP-CLI integration
wp plugin list | grep gp-  # list installed perks
```

### 3) Key Perks for AI workflows

| Perk | Purpose | Docs |
|------|---------|------|
| **GP Populate Anything** | Dynamic field population from posts, users, terms, or external APIs | https://gravitywiz.com/documentation/gravity-forms-populate-anything/ |
| **GP Nested Forms** | Embed a child form inside a parent form (repeatable sections) | https://gravitywiz.com/documentation/gravity-forms-nested-forms/ |
| **GP Limit Submissions** | Prevent spam/abuse by capping submissions per period | https://gravitywiz.com/documentation/gravity-forms-limit-submissions/ |
| **GP Advanced Select** | Search-and-select (powered by Choice.js) for large AI-generated lists | https://gravitywiz.com/documentation/gravity-forms-advanced-select/ |
| **GP Live Preview** | Real-time field-value preview before submission | https://gravitywiz.com/documentation/gravity-forms-live-preview/ |
| **GP Copy Cat** | Copy field values between fields automatically | https://gravitywiz.com/documentation/gravity-forms-copy-cat/ |

### 4) GP Populate Anything + AI feeds

Combine with Gravity Connect for dynamic AI-driven form population:

```php
// Filter Populate Anything query before form renders
add_filter('gppa_query_args', function($args, $field, $form) {
    // Inject AI-generated constraints into the population query
    if ($field->id === 5) {
        $args['meta_query'][] = [
            'key'   => 'ai_category',
            'value' => 'featured',
        ];
    }
    return $args;
}, 10, 3);
```

### 5) Reduce memory footprint for LLM loops

Spellbook uses code deduplication across all perks, reducing PHP memory usage compared to individual perk installs. This matters during memory-intensive LLM/API execution loops triggered via Gravity Connect.

```bash
# Verify Spellbook is active (not legacy Gravity Perks)
wp plugin status spellbook
wp plugin status gravityperks  # should show as inactive/not installed
```

### 6) Hide perks from Plugins page (optional)

```php
// Keep wp-admin Plugins page clean (perks still update normally)
add_filter('gp_hide_perks_from_plugins_page', '__return_true');
```

---

## References

- `wp-gravity-forms` skill — core GF setup and WP-CLI
- `wp-gravity-connect` skill — OpenAI integration via Connect
- Snippet library for LLM training: https://github.com/gravitywiz/snippet-library
