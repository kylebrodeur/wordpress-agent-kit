---
name: wp-pods
description: "Use when working with the Pods Framework: creating or managing custom post types (CPTs), custom taxonomies, custom database tables (ACTs — Advanced Content Types), or custom fields via Pods. Critical for AI agents: always declare whether a Pod uses wp_postmeta or ACT storage before writing any DB queries, WP_Query, or pods_field() calls."
license: GPL-2.0-or-later
optional: true
---

# Pods Framework

Pods manages WordPress custom content types (CPTs), taxonomies, and custom database tables (Advanced Content Types). It is the primary data structure layer for the U of Digital site — all custom content models, field definitions, and relational data flow through Pods.

## When to use

- Creating or modifying custom post types or taxonomies
- Working with Pods custom fields (reading, writing, seeding, syncing)
- Writing PHP that queries Pods-managed data (always declare ACT vs postmeta first)
- Setting up bi-directional relationships between content types
- Exposing Pods fields to the WordPress REST API or Abilities API
- Integrating Pods with Gravity Forms (pods-gravity-forms add-on)
- Advising an AI assistant on the correct query approach for a given Pod

## ⚠️ Critical — always declare storage type to AI agents

Before writing **any** code that touches Pods data, declare to your AI assistant which storage type the Pod uses:

| Storage type | DB location | Query method |
|-------------|------------|--------------|
| **postmeta** (default) | `wp_postmeta` | `WP_Query`, `get_post_meta()`, `pods_field()` |
| **ACT** (Advanced Content Type) | `wp_pods_<name>` (custom table) | `pods_field()` only — never `get_post_meta()` |

**Rule**: Never use `get_post_meta()` on an ACT Pod — it queries the wrong table and silently returns nothing.

```
Always tell your AI assistant:
"This Pod stores data as an ACT (custom table wp_pods_program)"
OR
"This Pod uses standard wp_postmeta storage"
```

## Official documentation

| Resource | URL |
|----------|-----|
| Docs home | https://pods.io/docs/ |
| Quick starts | https://pods.io/docs/build/ |
| Developer quick start | https://pods.io/docs/build/creating-pods/ |
| Code reference | https://pods.io/docs/code/ |
| pods_field() | https://pods.io/docs/code/pods-field/ |
| Pods API class | https://pods.io/docs/code/pods/ |
| REST API integration | https://pods.io/docs/build/rest-api/ |
| WordPress.org plugin | https://wordpress.org/plugins/pods/ |

## GitHub

| Repo | Purpose |
|------|---------|
| `pods-framework/pods` | Core plugin |
| `pods-framework/pods-gravity-forms` | Gravity Forms integration add-on |

- https://github.com/pods-framework/pods
- https://github.com/pods-framework/pods-gravity-forms

---

## Procedure

### 1) Install

```bash
# Free on WordPress.org
wp plugin install pods --activate

# Verify
wp plugin status pods
```

### 2) ACT vs postmeta — the critical decision

When creating a new Pod, choose storage type:

- **postmeta** (default): best for standard CPTs with <50 fields. Compatible with most WP tools.
- **ACT**: best for high-volume data, complex relational queries, many fields. Custom table = better performance, less wp_postmeta bloat.

Declare this in any file that handles the Pod's data:

```php
/**
 * Pod: 'program'
 * Storage: ACT (custom table: wp_pods_program)
 * Query: Use pods_field() — NOT get_post_meta()
 */
```

### 3) Correct field access patterns

```php
// ✅ Correct for BOTH storage types
$value = pods_field('program', $post_id, 'start_date');

// ✅ Using the Pods object
$pod = pods('program', $post_id);
$value = $pod->field('start_date');

// ❌ WRONG for ACT pods (silently returns nothing)
$value = get_post_meta($post_id, 'start_date', true);

// ❌ WRONG for ACT pods (wrong table)
global $wpdb;
$value = $wpdb->get_var("SELECT start_date FROM wp_postmeta WHERE post_id=$post_id...");
```

### 4) Relationship fields — use IDs, not titles

When seeding or syncing relationship fields via AI agents:

```php
// ✅ Correct — raw arrays of IDs
pods_save('program', [
    'id'              => $program_id,
    'related_courses' => [42, 87, 103],  // IDs only
]);

// ❌ Wrong — text titles break relational integrity
pods_save('program', [
    'related_courses' => 'Course A, Course B',
]);
```

### 5) Expose Pods to REST API

```php
add_action('init', function() {
    register_rest_field('program', 'start_date', [
        'get_callback'    => fn($obj) => pods_field('program', $obj['id'], 'start_date'),
        'update_callback' => fn($val, $obj) => pods_save('program', ['id' => $obj->ID, 'start_date' => $val]),
        'schema'          => ['type' => 'string', 'format' => 'date'],
    ]);
});
```

### 6) Pods + Gravity Forms integration

The `pods-gravity-forms` add-on links form submissions directly to Pods data:

```bash
wp plugin install pods-gravity-forms --activate
```

- Maps Gravity Forms fields to Pod fields on submission
- Auto-creates or updates Pod items from form entries
- Supports relationships — maps multi-select fields to related Pod items
- Docs: https://github.com/pods-framework/pods-gravity-forms

### 7) Exposing to WordPress Abilities API

```php
// Allow LLM workflows to read/write Pod data via Abilities API
wp_register_ability('program.read', [
    'description' => 'Read program custom fields',
    'callback'    => fn($args) => pods_field('program', $args['id'], $args['field']),
    'schema'      => ['id' => 'integer', 'field' => 'string'],
]);
```

---

## Context for AI code generation

Always include this in any prompt where you want code that touches Pods data:

```
Context: This Pod named 'program' uses ACT storage (custom table wp_pods_program).
Use pods_field('program', $post_id, 'field_name') — never get_post_meta().
For relationships, always pass raw integer ID arrays, never text labels.
```

## References

- `wp-gravity-forms` skill — Gravity Forms + pods-gravity-forms add-on integration
- `wp-gravity-stack` — SatisPress config, .cursorrules, llms.txt templates
- Reference guide: `wp-gravity-stack/references/wordpress-ai-gravity-reference.md`
