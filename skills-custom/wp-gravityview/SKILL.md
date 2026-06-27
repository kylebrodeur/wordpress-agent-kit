---
name: wp-gravityview
description: "Use when working with GravityView or GravityKit products: creating Views to display Gravity Forms entries on the front-end, configuring search/sort/filter, entry approval workflows, edit-entry forms, role-based access, merge tags, shortcodes, or the GravityActions/GravityBoard extensions."
license: GPL-2.0-or-later
optional: true
---

# GravityView (GravityKit)

GravityView renders Gravity Forms entries as searchable, sortable, filterable front-end Views without custom query code. Part of the GravityKit product suite alongside GravityActions and GravityBoard.

## When to use

- Displaying Gravity Forms entries on the front-end (staff directories, portfolios, listings)
- Building searchable/filterable entry displays
- Setting up entry approval workflows
- Creating edit-entry forms for front-end user editing
- Restricting views by role or entry ownership
- Building admin workflows with automated classification

## Official documentation

| Resource | URL |
|----------|-----|
| GravityKit docs | https://docs.gravitykit.com/ |
| Getting started | https://www.gravitykit.com/docs/gravityview/getting-started/ |
| View setup | https://www.gravitykit.com/docs/gravityview/getting-started-gravityview/ |
| Search / filter | https://www.gravitykit.com/docs/gravityview/filter-and-sort-results/ |
| Entry approval | https://www.gravitykit.com/docs/gravityview/entry-approval/ |
| Edit entry | https://www.gravitykit.com/docs/gravityview/edit-entry/ |
| Merge tags | https://www.gravitykit.com/docs/gravityview/merge-tags/ |
| Shortcodes | https://www.gravitykit.com/docs/gravityview/shortcodes/ |
| Roles & capabilities | https://www.gravitykit.com/docs/gravityview/roles-and-capabilities/ |
| View settings | https://www.gravitykit.com/docs/gravityview/view-settings/ |
| Common problems | https://www.gravitykit.com/docs/gravityview/common-problems/ |
| FAQ | https://www.gravitykit.com/docs/gravityview/faq/ |
| **Developer docs (hooks)** | **https://www.gravitykit.dev/** |
| Foundation framework | https://www.gravitykit.dev/docs/foundation/ |
| Account | https://account.gravitykit.com |

## GravityKit ecosystem

| Product | Purpose |
|---------|---------|
| **GravityView** | Display entries as Views (lists, tables, maps, cards) |
| **GravityView Pro** | Extended layouts: maps, tables, ratings, magic links |
| **GravityActions** | Bulk-update, bulk-email thousands of entries at once |
| **GravityBoard** | Kanban board view for entries with columns and voting |
| **WordPress MCP** | Surgical block-level Gutenberg editing for AI assistants |

- Account: https://account.gravitykit.com
- GitHub org: https://github.com/GravityKit
- **Developer docs** (hooks, Foundation, 37 products): https://www.gravitykit.dev/

---

## Procedure

### 1) Install

GravityView is a premium plugin. Download from your GravityKit account and install:

```bash
wp plugin install gravityview.zip --activate
wp plugin install gravityview-datatables.zip --activate  # optional table layout
```

Or via SatisPress/Composer:

```json
"satispress/gravityview": "*"
```

### 2) Create a View

1. **Views → New View**
2. Select the Gravity Form to pull entries from
3. Choose a layout (Table, List, DataTables, Map)
4. Add fields to the **Multiple Entries** layout (directory view)
5. Add fields to the **Single Entry** layout (detail page)
6. Configure **View Settings** (sorting, pagination, entry ownership)

### 3) Restrict by ownership and role

```
View Settings → Show only entries created by the current user: ✓
View Settings → Required Capability: gravityview_view_entries
```

```php
// Prevent metadata exposure in public views
add_filter('gravityview/fields/custom/content_after', function($content, $field) {
    if (!is_user_logged_in() && in_array($field->ID, ['internal_notes', 'api_key'])) {
        return '—';
    }
    return $content;
}, 10, 2);
```

### 4) Entry approval workflow

1. Add **Approval** field to your View layout
2. Configure: **View Settings → Approval Status → Approved only**
3. Gravity Connect can auto-classify submissions:

```
Gravity Connect Feed → classify "Flagged" →
GravityView filter: {Approval Status} = Flagged →
Admin-only view for review
```

### 5) Edit entry (front-end editing)

1. **Views → Edit** → add fields to **Edit Entry** layout
2. Embed with shortcode: `[gravityview id="1" context="edit"]`
3. Set capability: **View Settings → User Edit** → "Own entries only"

### 6) Shortcodes

```
[gravityview id="1"]                         # basic view
[gravityview id="1" page_size="20"]          # paginated
[gravityview id="1" search_field="2"]        # pre-filtered by field 2
[gravityview id="1" context="single" entry_id="42"]  # single entry
```

### 7) MCP prototyping

Feed your GravityView structure to an LLM to generate custom layout HTML:

```php
// Export view field config for LLM context
$view_fields = get_post_meta(get_the_ID(), '_gravityview_directory_fields', true);
echo json_encode($view_fields, JSON_PRETTY_PRINT);
```

---

## Security

- Always apply entry ownership restrictions on public-facing Views
- Never expose sensitive field IDs in public shortcodes
- Use **Roles and Capabilities** settings to gate admin-only views
- See `wp-gravity-stack → references/security.md` for the full audit script

## References

- `wp-gravity-forms` skill — forms and entries that feed Views
- `wp-gravity-connect` skill — AI classification feeding GravityView filters
