# WordPress Agent Kit

**WordPress-focused AI agent starter kit** for GitHub Copilot, Claude, and other LLM coding agents. Includes instructions, specialized WordPress skills, and workflow automation aligned with [agents.md](https://agents.md/) and [agentsskills.io](https://agentsskills.io).

## Quick Start

**1. Clone or fork this repository:**

```bash
# Clone
git clone https://github.com/kylebrodeur/wordpress-agent-kit.git
cd wordpress-agent-kit

# Or fork via GitHub, then clone your fork
```

**2. Sync the latest WordPress skills:**

```bash
npm install
npm run sync:skills
```

**3. Install into your WordPress project:**

```bash
npm run install:kit -- /path/to/your-wp-project
```

**4. Personalize for your project:**

```bash
npm run setup -- /path/to/your-wp-project
```

This interactive setup helps you:
- **Automatically detect** your project type and technologies
- Customize `AGENTS.md` for your tech stack
- Configure workflow instructions
- Set up prompt templates

The setup will analyze your project first and either:
- Auto-configure if confident (1 confirmation prompt)
- Pre-fill smart defaults if partially detected
- Ask questions if detection is unclear

This copies:
- `.github/` (agents, skills, instructions, prompts)
- `AGENTS.md` (agent onboarding)

**Note:** Skills are pulled fresh from the official [WordPress/agent-skills](https://github.com/WordPress/agent-skills) repository and are not committed to this repo. Always run `sync:skills` to get the latest.

## Who This Is For

- **WordPress plugin/theme developers** who want AI agents to understand WordPress conventions (hooks, sanitization, Settings API, block registration, etc.)
- **Teams adopting GitHub Copilot or Claude** for WordPress codebases
- **Anyone building custom WordPress workflows** who needs agents to follow WordPress Coding Standards, security best practices, and core APIs

## What You Get

- **Agent Skills**: WordPress-specific knowledge modules (blocks, Interactivity API, REST API, WP-CLI, performance, security, theme.json, Playground, PHPStan, etc.)
- **Instructions & Workflows**: Pre-built guidance for common WordPress dev cycles
- **AGENTS.md**: Single-file agent onboarding that loads skills on demand
- **Sync Scripts**: Pull latest skills from official [WordPress/agent-skills](https://github.com/WordPress/agent-skills) repo

## Install into another repo

Run:

- `npm run install:kit -- /path/to/target-repo`

Or copy these into the root of another repository:

- `.github/`
- `AGENTS.md`

## Customize

**Quick method:** Run the interactive setup:

```bash
npm run setup -- /path/to/your-wp-project
```

**Manual method:** Edit files directly:

1. Edit `AGENTS.md` to match your project's tech stack and conventions
2. Run WordPress project triage (via `wp-project-triage` skill) to generate tailored instructions
3. Update `.github/instructions/wordpress-workflow.instructions.md` with your workflow
4. Keep prompts in `.github/prompts/` accurate for your plugin/theme

## Sync Latest Skills

**Required before first use.** Skills are not committed to this repo and must be synced from upstream:

```bash
npm run sync:skills -- [ref]
```

This command:
- Clones official `https://github.com/WordPress/agent-skills.git` into `vendor/wp-agent-skills/`
- Defaults to `trunk` branch (or specify a git ref)
- Runs upstream build scripts to prepare skills
- Installs skills into `.github/skills/` (VS Code/GitHub Copilot format)

Re-run periodically to pull latest WordPress guidance and best practices.

## WordPress Playground

```bash
npm run playground
```

Quick-start a disposable WordPress instance with your plugin/theme auto-mounted. Uses `playground/blueprint.json`.

## Build Release

```bash
npm run build:release
```

Creates `dist/wordpress-agent-kit.tar.gz` for distribution (excludes `.git`, `node_modules`, build artifacts).

## Available Skills

Current skills include:

- **Blocks & Interactivity**: `@wordpress/blocks`, Interactivity API, block.json, dynamic rendering
- **Themes**: Block themes, theme.json, templates, patterns, style variations
- **REST API**: Custom endpoints, controllers, schema, authentication
- **Security**: Sanitization, escaping, nonces, capabilities, safe database access
- **Performance**: Profiling, Query Monitor, object caching, autoloaded options
- **DevOps**: WP-CLI, Playground blueprints, PHPStan, debugging
- **Router**: Auto-classify repos and route to correct skill

See `.github/skills/` for full list after sync.

## Usage Tips

- Agents find `AGENTS.md` at repo root and load skills on-demand
- Skills are lazy-loaded only when relevant to the user's question
- Update skills regularly with `npm run sync:skills` to get latest WordPress guidance
- Use `wp-router` skill first when agents need to understand your repo structure

## Node Scripts

```bash
npm run install:kit -- /path/to/target-repo  # Install kit files
npm run setup -- /path/to/target-repo        # Interactive setup & customization
npm run sync:skills -- [ref]                 # Sync skills from upstream
npm run playground                           # Launch WordPress Playground
npm run build:release                        # Build release tarball
```

## Credits

- [WordPress Agent Skills](https://github.com/WordPress/agent-skills) – Official skill repository
- [Agent Skills Spec](https://agentsskills.io) – Skills format standard
- [AGENTS Spec](https://agents.md/) – Agent onboarding standard

## License

GPL-2.0-or-later (same as WordPress)