# AI Integration Patterns — Gravity Stack

Architectural patterns for using the Gravity ecosystem with AI agents, LLMs, and MCP pipelines.

---

## Pods Framework

### ACT vs postmeta — critical distinction for AI agents

Always declare this to your AI assistant before writing DB queries.

| Pod type | Storage | Query method | When to use |
|----------|---------|--------------|-------------|
| **postmeta** (default) | `wp_postmeta` | `WP_Query`, `get_post_meta()`, `pods_field()` | Standard CPTs with <50 custom fields |
| **ACT** (Advanced Content Type) | Custom table `wp_pods_<name>` | `pods_field()`, direct SQL on custom table | High-volume, many fields, relational data |

**Rule**: Never use `get_post_meta()` on an ACT Pod — it queries the wrong table. Always use `pods_field()`.

```php
// Correct for both types
$value = pods_field('pod_name', $post_id, 'field_name');

// Wrong for ACT pods (silently returns nothing)
$value = get_post_meta($post_id, 'field_name', true);
```

### Relationship fields with AI seeding

When using AI agents to seed or sync relational data, target raw IDs — not text labels:

```php
// AI agent generating seed data:
// WRONG — text titles break relational integrity
pods_save('program', ['related_courses' => 'Course A, Course B']);

// RIGHT — raw arrays of target IDs
pods_save('program', ['related_courses' => [42, 87, 103]]);
```

### Exposing Pods to REST / MCP

For LLM workflows to read/write Pod data via REST:

```php
add_action('init', function() {
    // Register Pod fields on the REST API
    register_rest_field('pod_name', 'my_field', [
        'get_callback' => fn($obj) => pods_field('pod_name', $obj['id'], 'my_field'),
        'update_callback' => fn($val, $obj) => pods_save('pod_name', ['id' => $obj->ID, 'my_field' => $val]),
        'schema' => ['type' => 'string'],
    ]);
});
```

---

## Gravity Forms

### Turn forms into JSON schemas for MCP agents

Serialize your form structure so AI agents can understand and populate them:

```php
// Generate MCP-compatible form schema
$form = GFAPI::get_form(1);
$schema = [
    'form_id' => $form['id'],
    'title' => $form['title'],
    'fields' => array_map(fn($f) => [
        'id' => $f->id,
        'label' => $f->label,
        'type' => $f->type,
        'required' => $f->isRequired,
        'choices' => $f->choices ?? null,
    ], $form['fields']),
];
file_put_contents(get_template_directory() . '/llms-form-schema.json', json_encode($schema, JSON_PRETTY_PRINT));
```

### Prefer `GFAPI` methods over direct DB

```php
// Correct — use the API
$entry = GFAPI::get_entry($entry_id);
GFAPI::update_entry($entry);
GFAPI::add_entry($entry_data);

// Wrong — never write directly to wp_rg_lead_* tables
global $wpdb;
$wpdb->update('wp_rg_lead', [...]);  // ❌
```

### Anti-spam for AI bots

Standard honeypots fail against browser-based AI agents. Layer defenses:

1. **Cloudflare Turnstile** add-on (`gravityformsturnstile`) — server-side challenge
2. **Rate limiting** via Gravity Forms settings or server-level rules
3. **Programmatic submission gates** — validate server-side before processing

```bash
# Install Turnstile add-on
wp gf install gravityformsturnstile --activate
```

---

## Gravity Connect (OpenAI Integration)

### Fields vs Feeds — choose the right integration point

| Pattern | Trigger | Use for | Performance impact |
|---------|---------|---------|-------------------|
| **OpenAI Fields** | Before submission (real-time) | Live translation, grammar check, real-time summary | Visible to user — keep fast |
| **OpenAI Feeds** | After submission (async) | Email drafting, DB tagging, routing, classification | Background — user doesn't wait |

**Rule**: Use Feeds for anything that doesn't need to be shown before the user clicks Submit.

### Token ceiling — always set one

Every Connect feed **must** have `Maximum Tokens` configured. Without it, conversational loops can drain API budgets.

```
Feed settings → Advanced → Maximum Tokens: 500   (adjust per use case)
```

### OpenRouter — hot-swap models without code changes

Route through OpenRouter to swap models cheaply:

```
Feed settings → OpenAI Base URL: https://openrouter.ai/api/v1
Model: meta-llama/llama-3-8b-instruct  (instead of gpt-4)
```

Useful for non-critical feeds (tagging, categorization) where a cheaper model suffices.

### Credential isolation

Store OpenAI keys in `wp-config.php`, not in the database:

```php
// wp-config.php
define('OPENAI_API_KEY', getenv('OPENAI_API_KEY'));
```

Then reference the constant in Gravity Connect settings instead of pasting the key directly.

---

## Gravity SMTP

### Critical: CVE-2026-4020

Gravity SMTP ≤ v2.1.4 exposes an **unauthenticated REST endpoint** that leaks your mail provider API keys (SendGrid, Amazon SES, Resend, Mailgun).

```bash
# Check version immediately — must be ≥ 2.1.5
wp gf version gravitysmtp

# Update if needed
wp gf update gravitysmtp
```

### Credential isolation

Store SMTP credentials in `wp-config.php`, not `wp_options`:

```php
// wp-config.php
define('GRAVITY_SMTP_SENDGRID_KEY', getenv('SENDGRID_API_KEY'));
define('GRAVITY_SMTP_FROM_EMAIL', 'noreply@yourdomain.com');
```

This ensures credentials are never exposed via DB queries, REST API, or visual builder access.

---

## Gravity Wiz Spellbook

### Replace legacy helper setups

Transition from per-perk individual setups to the unified Spellbook bootstrap:

```bash
# Activate Spellbook (installs unified loader)
wp plugin activate spellbook

# Deactivate legacy individual helpers if present
wp plugin deactivate gravityperks  # old monolith
```

Spellbook reduces PHP memory footprint — important during LLM/API execution loops.

### GP Populate Anything + AI feeds

Combine to build dynamic AI-driven form experiences:

```php
// Hook: filter Populate Anything source before form renders
add_filter('gppa_query_args', function($args, $field, $form) {
    // Inject AI-generated query constraints
    if ($field->id === 5) {
        $args['meta_query'][] = ['key' => 'ai_category', 'value' => 'featured'];
    }
    return $args;
}, 10, 3);
```

---

## GravityView

### Render form data without custom query templates

Use GravityView for front-end output of classified form submissions.

### Automated classification → restricted admin views

```
Gravity Connect Feed → classify submission as "Flagged" → 
GravityView with conditional filter "is_flagged=1" → 
Admin-only view for manual review
```

### MCP prototyping

Feed your GravityView structure to an LLM to generate layout HTML/CSS:

```bash
# Export view configuration for LLM context
wp eval 'echo json_encode(get_post_meta(get_the_ID(), "_gravityview_directory_fields", true));' --require=gravityview
```

### Restrict sensitive fields

Always apply entry ownership restrictions on public GravityViews:

```php
// Prevent metadata exposure in public views
add_filter('gravityview/fields/custom/content_after', function($content, $field) {
    if (!current_user_can('manage_options') && $field->ID === 'sensitive_field') {
        return '—';
    }
    return $content;
}, 10, 2);
```

---

## Local development — remote media

For local dev with a real WP Engine DB, avoid syncing GB of uploads. Use `upload_url_path` instead:

```bash
# After pulling remote DB locally:
wp option update upload_url_path 'https://dev.yoursite.wpengine.com/wp-content/uploads'
# WordPress now loads all media from the live server transparently.

# Revert before any deployment:
wp option delete upload_url_path
```

This is particularly important for Gravity Forms entry attachments and GravityView file fields — they reference `wp-content/uploads` paths that would 404 locally without this setting.

---

## `.cursorrules` for AI coding agents

Place at repo root to give AI coding assistants correct context for this stack:

```json
{
  "project_type": "wordpress_ai_gravity_stack",
  "rules": [
    "Always check if Pods custom fields use wp_postmeta or ACT before writing DB queries. ACT pods require pods_field(), not get_post_meta().",
    "When interacting with Gravity Forms, use GFAPI methods (GFAPI::get_entry, GFAPI::update_entry) — never direct table writes.",
    "Do not write legacy PHP for Gravity Perks; use Gravity Wiz Spellbook unified bootstrap.",
    "All Gravity Connect (OpenAI) feeds must set Maximum Tokens to prevent runaway API costs.",
    "All email actions must use Gravity SMTP. Credentials in wp-config.php constants, never wp_options.",
    "Gravity SMTP must be v2.1.5+. Check version on every environment — CVE-2026-4020 leaks API keys.",
    "Never generate raw SQL targeting Pods ACT tables without checking the pod's storage type first."
  ]
}
```

## `llms.txt`

Place at web root (`https://yourdomain.com/llms.txt`) for MCP pipeline discovery:

```
# WordPress AI and Gravity Integration Infrastructure
This site uses Pods Framework, Gravity Forms, Gravity SMTP, Gravity Wiz Spellbook, Gravity Connect, and GravityView.

## Code References
- Pods Framework: https://github.com/pods-framework/pods
- Gravity Wiz Snippets: https://github.com/gravitywiz/snippet-library
- Gravity Connect: https://gravitywiz.com/gravity-forms-openai/

## Conventions
1. Pods fields: use pods_field() or GFAPI — never raw wp_postmeta for ACT pods.
2. Gravity SMTP: must be v2.1.5+ (CVE-2026-4020).
3. OpenAI Feeds for background tasks; Fields for real-time pre-submission generation.
4. Maximum Tokens always set on Connect feeds.
```
