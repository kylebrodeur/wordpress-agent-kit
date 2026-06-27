---
name: wp-gravity-stack
description: "Use for Gravity stack setup and orchestration: SatisPress/Composer configuration for the full plugin suite (Gravity Forms, SMTP, Connect, GravityView, Spellbook, Pods), reading the .cursorrules and llms.txt templates, or understanding how all products fit together. For product-specific work, load the individual skill instead."
license: GPL-2.0-or-later
optional: true
---

# WordPress Gravity Stack — Setup & Orchestration

Meta-skill that ties the Gravity ecosystem together for a new project or environment setup. Covers SatisPress configuration, the full `composer.json`, `.cursorrules` and `llms.txt` templates, and cross-product patterns.

**For product-specific work, load the individual skill:**

| Product | Skill to load |
|---------|--------------|
| Gravity Forms (forms, entries, `wp gf` CLI) | `wp-gravity-forms` |
| Gravity SMTP (delivery, CVE-2026-4020) | `wp-gravity-smtp` |
| Gravity Connect (OpenAI integration) | `wp-gravity-connect` |
| GravityView / GravityKit (display, search, approval) | `wp-gravityview` |
| Gravity Wiz Spellbook / Perks | `wp-gravity-wiz` |
| Pods Framework (CPTs, ACTs, custom fields) | `wp-pods` |

---

## When to use THIS skill

- Scaffolding `composer.json` for a new site using the full stack
- Setting up SatisPress as a private Composer repo for premium plugins
- Generating `.cursorrules` or `llms.txt` for a project
- Checking version pinning requirements (Gravity SMTP ≥ 2.1.5 — CVE-2026-4020)
- Understanding cross-product AI architecture patterns
- Initial stack setup before routing to individual skills

---

## Official documentation — all products

| Product | User Docs | Developer Docs |
|---------|-----------|---------------|
| Gravity Forms | https://docs.gravityforms.com/ | https://docs.gravityforms.com/category/developers/ |
| Gravity Forms User Guides | https://docs.gravityforms.com/category/user-guides/ | incl. 3.0 beta |
| Gravity SMTP | https://docs.gravitysmtp.com/ | — |
| Gravity Connect | https://gravitywiz.com/documentation/gravity-connect/ | https://gravitywiz.com/documentation/gravity-connect-openai/ |
| Gravity Perks | https://gravitywiz.com/documentation/gravity-perks/ | https://gravitywiz.com/available-perks/ |
| Spellbook | https://gravitywiz.com/documentation/spellbook/ | https://account.gravitywiz.com/ |
| GravityView | https://docs.gravitykit.com/ | https://www.gravitykit.dev/ |
| Pods | https://pods.io/docs/ | https://pods.io/docs/code/ |

## GitHub repositories

| Repo | Purpose |
|------|---------|
| `pods-framework/pods` | Pods core |
| `pods-framework/pods-gravity-forms` | Pods + GF integration |
| `gravitywiz/snippet-library` | 1000+ GF hooks (LLM training reference) |
| `gravitywiz/gravityforms-openai` | Gravity Connect legacy reference |
| `gravityforms/gravityformscli` | Official `wp gf` CLI add-on |
| `GravityKit` (org) | GravityView, GravityActions, GravityBoard |

---

## Full stack `composer.json`

Read: `references/satispress-config.md`

Quick reference:

```json
{
  "repositories": {
    "wpackagist": { "type": "composer", "url": "https://wpackagist.org",
                    "only": ["wpackagist-plugin/*","wpackagist-theme/*"] },
    "satispress":  { "type": "composer", "url": "https://packages.uof.digital/satispress/" }
  },
  "require": {
    "wpackagist-plugin/pods":           "^3.0",
    "wpackagist-plugin/gravityformscli":"*",
    "satispress/gravityforms":          "*",
    "satispress/gravitysmtp":           ">=2.1.5",
    "satispress/spellbook":             "*",
    "satispress/gravity-connect":       "*",
    "satispress/gravityview":           "*"
  }
}
```

## Security checklist

```bash
# Verify Gravity SMTP version (CVE-2026-4020)
wp gf version gravitysmtp    # must be ≥ 2.1.5

# Verify no credentials in wp_options
wp option get gravitysmtp_sendgrid_api_key && echo "⚠️  move to wp-config.php"
```

---

## Reference document

The full AI + Gravity stack reference guide (patterns, security, `.cursorrules`, `llms.txt`) is at:

`references/wordpress-ai-gravity-reference.md`

This covers:
- Pods ACT vs postmeta declaration for AI agents
- Gravity Connect Fields vs Feeds strategy
- Token ceiling recommendations
- CVE-2026-4020 mitigation
- Developer matrix for all products
- `.cursorrules` template
- `llms.txt` template

## References

- `references/wordpress-ai-gravity-reference.md` — Full AI + Gravity reference guide
- `references/satispress-config.md` — Full `composer.json` and SatisPress setup
- `references/gravity-stack-ai.md` — AI integration patterns
- `references/security.md` — CVE-2026-4020, credential isolation, anti-spam
