# Project: WordPress Codebase

This repository is WordPress-centric (plugin, theme, block theme, or site). Agents should prioritize local skills and official WordPress standards.

## Onboarding

- **Core Agent**: `.github/agents/wp-architect.agent.md` — the primary agent persona
- **Workflow Instructions**: `.github/instructions/wordpress-workflow.instructions.md` — project-specific conventions
- **Skills**: `.agents/skills/` — specialized agent skills for WordPress development

## Project Discovery (Required Before Changes)

1. **Run project triage** to classify the codebase:

   ```bash
   node .agents/skills/wp-project-triage/scripts/detect_wp_project.mjs
   ```

   This outputs a JSON report with project kind, signals, and tooling.

2. **Route to the right skill**:
   - If routing is unclear, consult `.agents/skills/wordpress-router/references/decision-tree.md`
   - For plugins: `wp-plugin-development`
   - For block themes: `wp-block-themes`
   - For Gutenberg blocks: `wp-block-development`
   - For REST API work: `wp-rest-api`
   - For Interactivity API: `wp-interactivity-api`
   - For Abilities API: `wp-abilities-api` / `wp-abilities-audit` / `wp-abilities-verify`
   - For WP-CLI operations: `wp-wpcli-and-ops`
   - For Playground testing (PHPUnit, E2E, CI): `wp-playground`
   - For Performance profiling: `wp-performance`
   - For PHPStan static analysis: `wp-phpstan`
   - For WP Engine hosting: `wp-wpengine` (optional, requires env vars)
   - For Design System components: `wpds`
   - For plugin directory submission: `wp-plugin-directory-guidelines`

3. **Update repo-specific guidance** based on triage results:
   - Confirm the project prefix (functions, classes, constants)
   - Confirm the folder structure (single-file plugin, `includes/`, blocks, theme, full site)
   - Confirm target WordPress and PHP versions

## Architecture

<!-- Populated by project triage — do not remove -->

- **Project Type**: <!-- plugin | theme | block-theme | site | gutenberg -->
- **PHP Version**: <!-- minimum PHP version -->
- **WP Version**: <!-- minimum WordPress version -->
- **Build Tool**: <!-- webpack | @wordpress/scripts | vite | none -->
- **Test Framework**: <!-- PHPUnit | Jest | Cypress | none -->

## Commands

<!-- Populated by project triage — do not remove -->

| Purpose       | Command                                |
| ------------- | -------------------------------------- |
| Build         | <!-- e.g., npm run build -->           |
| Lint (PHP)    | <!-- e.g., composer lint -->           |
| Lint (JS/CSS) | <!-- e.g., npm run lint -->            |
| Test          | <!-- e.g., npm test, composer test --> |
| Dev server    | <!-- e.g., npm start -->               |

## Code Conventions

<!-- Populated by project triage — do not remove -->

- **Prefix**: <!-- e.g., myplugin_ for functions, MyPlugin\ for namespaces -->
- **Indentation**: Tabs for PHP, <!-- 2 spaces for JS -->
- **PHP Standards**: [WordPress PHP Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/)
- **JS Standards**: <!-- WordPress JS standards -->

## Security Baseline

- **Sanitize Early**: Validate and sanitize all user input (`sanitize_text_field`, `sanitize_email`, etc.)
- **Escape Late**: Escape all output (`esc_html`, `esc_attr`, `esc_url`, `wp_kses`)
- **Use Nonces**: All state-changing requests must include nonce verification (`wp_nonce_field`, `check_admin_referer`)
- **Check Capabilities**: Privileged actions require capability checks (`current_user_can`)
- **Validate AJAX/REST**: Use `permission_callback` for REST endpoints and capability checks for AJAX handlers

## Output Requirements

- Prefer minimal, standards-compliant changes over large rewrites
- Follow existing conventions in the codebase (naming, patterns, architecture)
- Cite which skill or handbook informed the solution
- Cross-check against this file (`AGENTS.md`) before finalizing output
