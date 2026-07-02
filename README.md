# WordPress Agent Kit

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/Written%20in-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-0.8.0-blue?style=flat-square)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20.18-green?style=flat-square)](package.json)
[![CI](https://img.shields.io/badge/CI-passing-brightgreen?style=flat-square)](.github/workflows/ci.yml)

**WordPress-focused AI agent starter kit** for GitHub Copilot, Cursor, Claude, and Pi Coding Agent. Installs 26 WordPress agent skills (9 custom: bootstrap, WP Engine, Gravity Forms, SMTP, Connect, GravityView, Gravity Wiz, Pods, and the stack orchestrator — pulled via `npx skills add kylebrodeur/wordpress-agent-kit`; 17 upstream — pulled via `npx skills add WordPress/agent-skills`), an agent persona, workflow instructions, and AGENTS.md configuration — everything an AI coding agent needs to build WordPress plugins, themes, and blocks correctly. The npm package ships ONLY the CLI + platform agents/prompts + AGENTS.template.md; skills are pulled at install time via `npx skills` (requires network + npx).

Maintained by [Kyle Brodeur](https://brodeur.me).

---

## Getting Started

Choose your scenario:

### Scenario 1: Brand New WordPress Project

```bash
# 1. Install the kit (copies platform agents/instructions + AGENTS.md template; does NOT touch skills — prints a hint to run `skills install`)
npx wp-agent-kit install /path/to/my-plugin --platform github

# 2. Install skills (our 9 via npx skills add kylebrodeur/wordpress-agent-kit + 17 upstream via npx skills add WordPress/agent-skills, both into .agents/skills/)
npx wp-agent-kit skills install /path/to/my-plugin

# 3. Run auto-setup (detects project type and configures AGENTS.md)
npx wp-agent-kit setup /path/to/my-plugin --auto

# 4. (Optional) Verify the triage report
node .agents/skills/wp-project-triage/scripts/detect_wp_project.mjs
```

**What gets installed:**

```
my-plugin/
├── AGENTS.md                  # Project-specific agent instructions
├── AGENTS.template.md         # Template reference for future updates
├── .agents/
│   └── skills/                  # 26 WordPress skills (17 upstream + 9 custom, AgentSkills.io convention)
│       ├── wp-project-triage/       # Project detection
│       ├── wp-plugin-development/   # Plugin architecture
│       ├── wp-block-development/    # Gutenberg blocks
│       ├── wp-block-themes/         # Block themes
│       ├── wp-rest-api/             # REST API
│       ├── wp-interactivity-api/    # Interactivity API
│       ├── wp-abilities-api/        # Abilities API
│       ├── wp-performance/          # Performance profiling
│       ├── wp-phpstan/              # Static analysis
│       ├── wp-wpcli-and-ops/        # WP-CLI operations
│       ├── wp-playground/           # Testing environments (PHPUnit, Playwright, CI)
│       ├── wpds/                    # Design system
│       ├── wordpress-router/        # Repo classification
│       └── wp-wpengine/             # (optional) WP Engine hosting + git push
├── .github/
│   ├── agents/
│   │   └── wp-architect.agent.md    # WordPress Architect agent persona
│   ├── instructions/
│   │   └── wordpress-workflow.instructions.md
│   └── prompts/
└── .wp-agent-kit-manifest.github.json  # Safe-update tracking
```

### Scenario 2: Existing WordPress Project

```bash
# 1. Install kit (platform agents + AGENTS.md template — preserves your existing AGENTS.md)
npx wp-agent-kit install /path/to/existing-plugin --platform github

# 2. Install skills (our 9 + 17 upstream into .agents/skills/)
npx wp-agent-kit skills install /path/to/existing-plugin

# 3. Configure based on auto-detected project type (headless; preserves your AGENTS.md)
npx wp-agent-kit setup /path/to/existing-plugin --auto

# Or specify explicitly
npx wp-agent-kit setup /path/to/existing-plugin \
  --project-type plugin \
  --tech-stack gutenberg,rest-api,wpcli,composer,npm \
  --package-manager pnpm \
  --yes
```

**Key behavior:**

- Your existing `AGENTS.md` is **never overwritten** — only new sections are added
- Triage inspects your codebase and returns structured JSON with project kind, signals, and tooling
- Setup updates only the tooling/configuration sections of AGENTS.md

### Scenario 3: Upgrading an Existing Kit Installation

```bash
# Check if an update is available
npx wp-agent-kit upgrade --check-only

# Preview what would change (dry-run)
npx wp-agent-kit install --dry-run

# Apply safe update (preserves your modifications)
npx wp-agent-kit upgrade --force
```

**Safe update behavior:**

- Compares installed files against a manifest of original hashes
- Files you haven't modified → automatically updated
- Files you modified → **skipped** (preserved)
- Use `--force` to overwrite your modifications with upstream changes
- A backup is created at `.wp-agent-kit-backup-{timestamp}/` before making changes

```bash
# Emergency: override all safety and replace everything
npx wp-agent-kit install --no-safe --force
```

---

## Quick Reference

### CLI Commands

| Command                 | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `install [dir]`         | Install kit (platform agents + AGENTS.md template) into a project         |
| `setup [dir]`           | Interactive or headless configuration                                     |
| `skills install [dir]`  | Install all 26 skills into `.agents/skills/` via two `npx skills add` commands (our 9 + 17 upstream) |
| `skills update [dir]`   | Refresh installed skills via `npx skills update`                                            |
| `upgrade [dir]`         | Check or apply version upgrades                                           |
| `playground`            | Launch local WordPress Playground                                         |

### Platform Flags

| Platform                 | Flag                | Target Directory |
| ------------------------ | ------------------- | ---------------- |
| GitHub Copilot / VS Code | `--platform github` | `.github/`       |
| Cursor IDE               | `--platform cursor` | `.cursor/`       |
| Claude Code              | `--platform claude` | `.claude/`       |
| Pi Coding Agent          | `--platform pi`     | `.pi/agent/`     |
| Generic .agent           | `--platform agent`  | `.agent/`        |

### Agent-Friendly Flags (All Commands)

| Flag        | Description                          |
| ----------- | ------------------------------------ |
| `--json`    | Machine-readable JSON output         |
| `--dry-run` | Preview changes without applying     |
| `--ndjson`  | Newline-delimited JSON for streaming |
| `--quiet`   | Suppress non-error output            |

---

## Pi Coding Agent Integration

This package is also a Pi extension — install it once and all WordPress skills and tools are available to Pi:

```bash
pi install npm:wordpress-agent-kit
```

### Pi Tools (Callable by the Agent)

| Tool                 | What it does                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `wp_triage`          | Detect WordPress project type, signals, and tooling                          |
| `wp_install_kit`     | Install/update kit into a project (safe by default)                           |
| `wp_skills_install`  | Install all 26 skills via `npx skills add` (our 9 + 17 upstream) into `.agents/skills/` |
| `wp_skills_update`   | Refresh installed skills via `npx skills update`                                          |
| `wp_upgrade`         | Check and apply version upgrades                                              |

### Pi Commands (Type `/` in Pi TUI)

| Command                  | What it does                              |
| ------------------------ | ----------------------------------------- |
| `/wp-triage [dir]`       | Run project detection, show in status bar |
| `/wp-install [dir]`      | Install kit into current project          |
| `/wp-skills-install [dir]` | Install skills into current project     |
| `/wp-skills-update [dir]`  | Refresh skills in current project       |
| `/wp-upgrade`            | Show installed vs latest version          |

---

## Programmatic API

Import directly into scripts, tests, or other tools:

```typescript
import {
  installKitApi, // Install/update kit (platform agents + AGENTS.md)
  installSkillsApi, // Install skills (our 9 + 17 upstream via npx skills add)
  updateSkillsApi, // Refresh installed skills (npx skills update)
  runTriageApi, // Run project detection
  configureAgentsMdApi, // Configure AGENTS.md
  cleanSkillsApi, // Detect and remove orphaned skills
  computeChanges, // Preview file changes (dry-run)
  isKitInstalled, // Check if kit is installed
  loadManifest, // Read install manifest
  updateKit, // Raw safe update
  ExitCode, // Semantic exit codes
} from 'wordpress-agent-kit/api';

// Install with safe update
const result = await installKitApi({
  targetDir: '/path/to/my-plugin',
  platform: 'github',
  safe: true, // Use manifest-based diff
  backup: true, // Create backup before changes
  force: false, // Don't overwrite user mods
});

// Dry-run preview
const preview = await installKitApi({
  targetDir: '/path/to/my-plugin',
  platform: 'github',
  dryRun: true,
});
// preview.data.actions → [{ type: 'create', target: '...', description: '...' }]

// Detect project type
const triage = await runTriageApi({ targetDir: '/path/to/project' });
console.log(triage.data.project.primary); // "plugin"
```

### Semantic Exit Codes

| Code | Meaning           |
| ---- | ----------------- |
| 0    | Success           |
| 2    | Invalid arguments |
| 3    | Not found         |
| 4    | Permission denied |
| 5    | Already exists    |
| 6    | Git error         |
| 7    | Network error     |
| 8    | Validation failed |
| 130  | Cancelled         |

---

## Skills Reference

All 26 skills follow the [AgentSkills.io](https://agentskills.io) specification. **Nothing is vendored in the npm package** — the package ships only the CLI, platform agents/instructions/prompts (`.github/`), and `AGENTS.template.md`. Our 9 custom skills live in the top-level `skills/` directory committed to git (the marketplace source for `npx skills add kylebrodeur/wordpress-agent-kit`), but are excluded from the npm package (`.npmignore`). The 17 upstream skills come from the [WordPress/agent-skills](https://github.com/WordPress/agent-skills) GitHub repo, pulled via `npx skills add WordPress/agent-skills` (the [vercel-labs/skills](https://github.com/vercel-labs/skills) CLI). We do not maintain or vendor them. Both pulls require network + npx and write to the generated, gitignored `.agents/skills/` directory:

| Skill                                  | When to Use                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `wp-project-triage`                    | Run deterministic project detection (type, tooling, versions)                      |
| `wp-plugin-development`                | Develop WordPress plugins (hooks, settings, security, release)                     |
| `wp-block-development`                 | Develop Gutenberg blocks (block.json, attributes, rendering)                       |
| `wp-block-themes`                      | Develop block themes (theme.json, templates, patterns, variations)                 |
| `wp-rest-api`                          | Build, extend, or debug REST API endpoints/routes                                  |
| `wp-interactivity-api`                 | Build Interactive blocks with data-wp-\* directives                                |
| `wp-abilities-api`                     | Register and consume WordPress Abilities API                                       |
| `wp-abilities-audit`                   | Audit a plugin's REST surface for Abilities API opportunities                      |
| `wp-abilities-verify`                  | Verify registered Abilities match their annotations                                |
| `wp-performance`                       | Profile and optimize WordPress performance                                         |
| `wp-phpstan`                           | Configure and run PHPStan static analysis                                          |
| `wp-wpcli-and-ops`                     | WP-CLI commands, automation, multisite operations                                  |
| `wp-playground`                        | Test with disposable Playground instances; PHPUnit, Playwright E2E, CI             |
| `blueprint`                            | Write and edit WordPress Playground blueprint JSON                                 |
| `wpds`                                 | Build UIs with the WordPress Design System                                         |
| `wp-plugin-directory-guidelines`       | GPL compliance, naming, slug rules for WP.org submission                           |
| `wordpress-router`                     | Route/classify repository type and select appropriate skills                       |
| **`wp-wpengine`** _(custom)_           | WP Engine git push, install/domain/cache/backup management via wpe-labs skills     |
| **`wp-bootstrap`** _(custom)_          | Scaffold new projects: monorepo detection, Composer, SatisPress, Playground, CI    |
| **`wp-gravity-forms`** _(custom)_      | Gravity Forms: `wp gf` CLI, GFAPI, JSON form versioning, anti-spam, MCP schemas    |
| **`wp-gravity-smtp`** _(custom)_       | Gravity SMTP: delivery, credential isolation, CVE-2026-4020 patch check            |
| **`wp-gravity-connect`** _(custom)_    | Gravity Connect: OpenAI Fields/Feeds, token ceilings, OpenRouter, GPT Image        |
| **`wp-gravityview`** _(custom)_        | GravityView: front-end entry display, search, approval, ownership, GravityKit MCP  |
| **`wp-gravity-wiz`** _(custom)_        | Spellbook, Gravity Perks (GP Populate Anything, Nested Forms, Advanced Select)     |
| **`wp-gravity-stack`** _(custom)_      | Stack orchestrator: SatisPress `composer.json`, `.cursorrules`, `llms.txt`         |
| **`wp-pods`** _(custom)_               | Pods Framework: CPTs, ACTs, custom fields, relationship arrays, REST/Abilities API  |

---

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm dev

# Type-check
pnpm check

# Lint & format
pnpm lint:check
pnpm format

# Run tests
pnpm test:run

# Build for distribution
pnpm build

# Full pre-publish check (build + lint + test)
pnpm prepublishOnly
```

---

## Documentation

- **[CLI_REVIEW.md](CLI_REVIEW.md)** — Initial architecture review and design decisions
- **[CHANGELOG.md](CHANGELOG.md)** — Version history and release notes
- **[AGENTS.md](AGENTS.md)** — Agent instructions for this repository

---

## Credits

- **[AgentSkills.io](https://agentskills.io)** — The agent skills specification
- **[AGENTS.md](https://agentskills.io)** — The agent configuration standard
- **[WordPress/agent-skills](https://github.com/WordPress/agent-skills)** — Upstream skills repository
