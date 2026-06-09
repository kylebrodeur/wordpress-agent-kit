# WordPress Agent Kit - Installation & Usage Learnings

**Package:** `wordpress-agent-kit@0.2.1` (published on npm)
**Author:** Kyle Brodeur
**Repo:** https://github.com/kylebrodeur/wordpress-agent-kit

---

## Quick Start (What Actually Works)

### For Pi (Recommended)
```bash
pnpm dlx wordpress-agent-kit@latest install --platform pi
```
- Installs skills to `.pi/agent/skills/` (17 skills)
- Non-interactive, no TTY needed
- Works in headless/CI environments

### For Other Platforms
```bash
# GitHub Copilot / VS Code
pnpm dlx wordpress-agent-kit@latest install --platform github

# Cursor IDE
pnpm dlx wordpress-agent-kit@latest install --platform cursor

# Generic agent format
pnpm dlx wordpress-agent-kit@latest install --platform agent

# Claude (interactive - requires TTY)
pnpm dlx wordpress-agent-kit@latest install --platform claude
```

---

## What DOESN'T Work (Common Pitfalls)

### `setup` command requires TTY
```bash
pnpm dlx wordpress-agent-kit@latest setup  # FAILS in non-interactive shells
```
**Error:** `ERR_TTY_INIT_FAILED: uv_tty_init returned EINVAL (invalid argument)`

The `setup` command uses `@clack/prompts` for interactive prompts, which requires a real TTY. It fails in:
- CI/CD pipelines
- Docker containers without `-it`
- Non-interactive SSH sessions
- Most AI agent execution environments

**Workaround:** Use `install --platform <platform>` instead.

---

## Platform Comparison

| Platform | Target Dir | Interactive? | Best For |
|----------|------------|--------------|----------|
| `pi` | `.pi/agent/skills/` | ❌ No | **Pi Coding Agent** (this project) |
| `github` | `.github/skills/` | ❌ No | GitHub Copilot, VS Code |
| `cursor` | `.cursor/skills/` | ❌ No | Cursor IDE |
| `agent` | `.agent/skills/` | ❌ No | Generic `.agent` workflows |
| `claude` | `.claude/skills/` | ✅ Yes | Claude Code (interactive only) |

---

## Skills Installed (17 Total)

All synced from `WordPress/agent-skills` trunk:

1. `wp-abilities-api` - Abilities API registration & consumption
2. `wp-abilities-audit` - Audit plugin REST surface for Abilities
3. `wp-abilities-verify` - Verify Abilities registrations
4. `wp-block-development` - Gutenberg blocks: block.json, attributes, rendering
5. `wp-block-themes` - Block themes: theme.json, templates, patterns
6. `wp-interactivity-api` - data-wp-* directives & stores
7. `wp-performance` - Profiling, caching, DB optimization
8. `wp-phpstan` - PHPStan config for WordPress
9. `wp-playground` - WordPress Playground for instant environments
10. `wp-plugin-development` - Plugin architecture, hooks, Settings API, security
11. `wp-plugin-directory-guidelines` - WP Plugin Directory requirements
12. `wp-project-triage` - Auto-detect project type, tooling, versions
13. `wp-rest-api` - REST API routes, schema, auth, response shaping
14. `wp-wpcli-and-ops` - WP-CLI commands, automation, multisite
15. `wpds` - WordPress Design System
16. `blueprint` - Playground Blueprints for declarative setup
17. `wordpress-router` - Classifies WP repos, routes to right workflow

---

## Verification Commands

After installation, verify everything works:

```bash
# 1. Check skills installed
ls -la .pi/agent/skills/

# 2. Run project triage (detects WP project type)
node .pi/agent/skills/wp-project-triage/scripts/detect_wp_project.mjs

# 3. Run design-system tests (if applicable)
cd design-system && pnpm test && pnpm run typecheck

# 4. PHP syntax check
find wpaos wpaos-blocks -name '*.php' -exec php -l {} \;
```

---

## Key Files & Locations

```
wordpress-agent-kit/
├── package.json                 # Package definition (name: wordpress-agent-kit)
├── src/
│   ├── cli.ts                   # Main CLI entry
│   ├── commands/
│   │   ├── install.ts           # Non-interactive install (USE THIS)
│   │   ├── setup.ts             # Interactive setup (NEEDS TTY)
│   │   ├── sync-skills.ts       # Pulls from WordPress/agent-skills
│   │   └── playground.ts        # Local WP Playground
│   └── utils/
│       └── platforms.ts         # Platform definitions (pi, github, cursor, agent, claude)
├── dist/bundles/                # Pre-built tarballs (legacy method)
└── vendor/wp-agent-skills/      # Synced upstream skills (gitignored)
```

---

## Syncing Latest Upstream Skills

The kit bundles skills at release time. To get latest:

```bash
# From kit repo (if contributing)
pnpm sync:skills
pnpm build:bundles

# Or just reinstall (pulls latest from npm)
pnpm dlx wordpress-agent-kit@latest install --platform pi --force
```

---

## Integration with This Project (wp-agent-os)

### AGENTS.md References
The project's `AGENTS.md` still references `.github/skills/` but we use `.pi/agent/skills/`. The skills are the same - just different install locations.

### wp-abilities-api Verification
Verified that `wpaos/includes/abilities.php` uses correct arg keys per the skill:
- `label`, `description`, `category`, `input_schema`, `output_schema`
- `permission_callback`, `execute_callback`, `meta`
- `meta.show_in_rest: true`, `meta.mcp.public: true`

### CI/CD Usage
```yaml
# GitHub Actions example
- name: Install WordPress Agent Kit
  run: pnpm dlx wordpress-agent-kit@latest install --platform github
```

---

## Troubleshooting

### "Command not found" / 404 on npm
- Package name is `wordpress-agent-kit` (NOT `wp-agent-kit`)
- Published to npm as `kylebrodeur` scope would be `@kylebrodeur/wordpress-agent-kit` but it's unscoped

### Skills not showing up
- Check install location matches your agent's config (`.pi/agent/skills/` for Pi)
- Run with `--force` to overwrite existing

### Old placeholder skills remain
- Delete old skill directories before reinstall:
  ```bash
  rm -rf .claude/skills .github/skills .cursor/skills .agent/skills
  pnpm dlx wordpress-agent-kit@latest install --platform pi
  ```

---

## Summary: Recommended Workflow for This Project

```bash
# One-liner for clean install in any environment
rm -rf .claude/skills .github/skills .cursor/skills .agent/skills .pi/agent/skills && \
pnpm dlx wordpress-agent-kit@latest install --platform pi
```

Then the skills live in `.pi/agent/skills/` and are available to Pi automatically.