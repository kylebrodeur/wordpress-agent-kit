# WordPress Agent Kit

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/Written%20in-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![Version](https://img.shields.io/badge/version-0.2.2-blue?style=flat-square)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20.18-green?style=flat-square)](package.json)

**WordPress-focused AI agent starter kit** for GitHub Copilot, Cursor, Claude, and other LLM coding agents. Includes instructions, specialized WordPress skills, and workflow automation aligned with industry standards.

Maintained by [Kyle Brodeur](https://brodeur.me).

## Quick Start

### Option 1: CLI (Recommended)

#### Interactive Setup Wizard
```bash
npx wp-agent-kit setup
# or
pnpm dlx wp-agent-kit setup
```

#### Non-Interactive (CI/Agent-Friendly)
```bash
# Auto-detect project type and tech stack
pnpm dlx wp-agent-kit setup --auto --json

# Or specify explicitly (for full automation)
pnpm dlx wp-agent-kit setup --project-type plugin --tech-stack gutenberg,rest-api,composer --platform github --yes --json
```

#### Install Only (No Configuration)
```bash
# For GitHub Copilot / VS Code
pnpm dlx wp-agent-kit@latest install --platform github

# For Cursor IDE
pnpm dlx wp-agent-kit@latest install --platform cursor

# For Pi Coding Agent (recommended)
pnpm dlx wp-agent-kit@latest install --platform pi

# For generic .agent workflows
pnpm dlx wp-agent-kit@latest install --platform agent
```

### Option 2: Pre-built Bundles

Download from the [latest release](https://github.com/kylebrodeur/wordpress-agent-kit/releases):
- `wordpress-agent-kit-github.tar.gz` — GitHub Copilot
- `wordpress-agent-kit-cursor.tar.gz` — Cursor IDE
- `wordpress-agent-kit-claude.tar.gz` — Claude
- `wordpress-agent-kit-agent.tar.gz` — Generic `.agent`

```bash
cd /path/to/your-wordpress-project
tar -xzf wordpress-agent-kit-github.tar.gz
```

## Agent-Friendly Features (v0.2.2+)

### Structured JSON Output (`--json`)
All commands output machine-readable JSON for programmatic use:
```bash
wp-agent-kit install --platform github --json
# {"success":true,"data":{"targetDir":"/path","platform":"github","filesCreated":[...],"durationMs":35}}
```

### Headless/Non-Interactive Mode
```bash
# Auto-detection
wp-agent-kit setup --auto --json

# Explicit config (CI/CD ready)
wp-agent-kit setup --project-type plugin --tech-stack gutenberg,rest-api --platform github --yes --json
```

### Dry-Run Preview (`--dry-run`)
```bash
wp-agent-kit install --platform github --dry-run --json
wp-agent-kit setup --project-type plugin --dry-run --json
```

### Upgrade Existing Installations
```bash
# Check for updates
wp-agent-kit upgrade --check-only --json

# Apply upgrade
wp-agent-kit upgrade --force --json
```

### Programmatic API
```typescript
import { installKitApi, syncSkillsApi, runTriageApi, configureAgentsMdApi } from 'wordpress-agent-kit/api';

await installKitApi({ targetDir: '/path', platform: 'github', force: true });
await syncSkillsApi({ ref: 'trunk' });
const triage = await runTriageApi({ targetDir: '/path' });
await configureAgentsMdApi({ targetDir: '/path', platform: 'github', config: { projectType: 'plugin', techStack: ['gutenberg'] }});
```

### Semantic Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Not found (ENOENT) |
| 4 | Permission denied |
| 5 | Already exists (use --force) |
| 6 | Git error |
| 7 | Network error |
| 8 | Validation failed |
| 130 | Cancelled (SIGINT) |

## Platform Comparison

| Platform | Target Dir | Interactive? | Best For |
|----------|------------|--------------|----------|
| `pi` | `.pi/agent/skills/` | ❌ | **Pi Coding Agent** |
| `github` | `.github/skills/` | ❌ | GitHub Copilot, VS Code |
| `cursor` | `.cursor/skills/` | ❌ | Cursor IDE |
| `agent` | `.agent/skills/` | ❌ | Generic `.agent` workflows |
| `claude` | `.claude/skills/` | ✅ | Claude Code (interactive) |

## Commands Reference

| Command | Description |
|---------|-------------|
| `install [dir] --platform <p> [--force] [--dry-run] [--json]` | Install kit to target directory |
| `setup [dir] [--auto] [--project-type] [--tech-stack] [--yes] [--json]` | Interactive or headless setup |
| `sync-skills [ref] [--dry-run] [--json]` | Sync skills from WordPress/agent-skills |
| `playground [--port] [--no-auto-mount] [--json]` | Run local WordPress Playground |
| `upgrade [dir] [--platform] [--force] [--check-only] [--json]` | Upgrade existing installation |

## Development

### Build CLI
```bash
pnpm build
```

### Run Tests
```bash
pnpm test:run
```

### Lint & Format
```bash
pnpm run lint:check    # Check only
pnpm run lint          # Auto-fix
pnpm run format:check  # Check formatting
pnpm run format        # Auto-format
```

### Build Release Bundles
```bash
pnpm sync:skills
pnpm build:bundles
```

### Pre-Publish (Runs All Checks)
```bash
pnpm run prepublishOnly
```

## Customization

**Quick method:** Run the interactive or headless setup.

**Manual method:** Edit files directly:
1. Edit `AGENTS.md` to match your project's tech stack and conventions.
2. Run WordPress project triage (via `wp-project-triage` skill) to generate tailored instructions.
3. Update `.github/instructions/wordpress-workflow.instructions.md` with your workflow.
4. Keep prompts in `.github/prompts/` accurate for your plugin/theme.

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Install WordPress Agent Kit
  run: pnpm dlx wordpress-agent-kit@latest install --platform github --json
```

## Credits

- **[AGENTS.md](https://agentskills.io)** - The agent configuration standard.
- **[AgentSkills.io](https://agentskills.io)** - The open directory of agent skills.
- **[WordPress/agent-skills](https://github.com/WordPress/agent-skills)** - Upstream skills repository.