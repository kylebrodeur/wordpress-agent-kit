# Project: WordPress Agent Kit (CLI)

This is a Node.js CLI tool (`wp-agent-kit`) designed to scaffold AI agent configuration for WordPress projects. It helps developers quickly set up `AGENTS.md` and `.agents/skills/` in their repositories.

## Tech Stack

- **Language**: TypeScript (Node.js)
- **Framework**: Commander.js
- **Prompting**: `@clack/prompts`
- **Build**: `tsc` (TypeScript Compiler)
- **Test**: `vitest`
- **Lint/Format**: Biome + ESLint

## Architecture

- **Entry Point**: `src/cli.ts`
- **Commands**: `src/commands/*.ts` (e.g., `install`, `setup`, `sync-skills`, `playground`, `upgrade`)
- **Core Logic**: `src/lib/*.ts` (e.g., `installer.ts` for file copying, `triage-mapper.ts` for project detection, `api.ts` for programmatic API)
- **Utilities**: `src/utils/*.ts` (e.g., `paths.ts`, `run.ts`, `output.ts`, `exit-codes.ts`)
- **Assets**:
  - `AGENTS.template.md`: The template file copied to user projects.
  - `.github/`: Platform-specific agents, instructions, and prompts (copied to target platform dir).
  - `.agents/skills/`: Universal skills directory (AgentSkills.io convention), copied to target `.agents/skills/`.
  - `skills-custom/`: Custom skills that survive upstream syncs, merged into `.agents/skills/` on install.

## Package Exports

- `wordpress-agent-kit` → CLI entry (`dist/cli.js`)
- `wordpress-agent-kit/api` → Programmatic API (`dist/lib/api.js`)

## Development Workflow

- **Run locally**: `npm run dev` (uses `tsx src/cli.ts`)
- **Build**: `npm run build` (outputs to `dist/`)
- **TypeCheck**: `npm run check` (no-emit type checking)
- **Test**: `npm test` (runs Vitest)
- **Lint**: `npm run lint:check` (ESLint + Biome)
- **Format**: `npm run format` (Prettier + Biome)
- **Pre-commit**: Husky runs lint:check + test:run

## Key Commands

- `install`: Copies `.agents/skills/` (universal convention), platform agents/instructions, and `AGENTS.md` template to a target directory. Supports `--json`, `--dry-run`, `--ndjson`. Merges custom skills from `skills-custom/`.
- `setup`: Interactive wizard that detects project type and configures the kit. Supports `--auto`, `--project-type`, `--tech-stack`, `--yes`.
- `sync-skills`: Pulls skills from `WordPress/agent-skills` into `.agents/skills/` (canonical, AgentSkills.io convention), merging custom skills from `skills-custom/`. Supports `--json`, `--dry-run`.
- `clean-skills`: Detects and removes orphaned skills that are no longer part of the kit. Supports `--dry-run`, `--remove`, `--json`.
- `playground`: Launches a local WordPress Playground instance using a blueprint.
- `upgrade`: Checks for and applies newer versions. Supports `--check-only`, `--force`, `--json`.

## Agent-Friendly Features (v0.3.0+)

- `--json`: Structured JSON output with success/data/error/time fields
- `--dry-run`: Preview mode showing what would happen without making changes
- `--ndjson`: Newline-delimited JSON for streaming long operations
- `--quiet`: Suppress non-essential output
- **Semantic exit codes**: 0=OK, 2=Invalid Args, 3=Not Found, 4=Permission Denied, 5=Already Exists, 6=Git Error, 7=Network Error, 8=Validation Error, 130=Cancelled
- **Programmatic API**: `import { installKitApi, syncSkillsApi, runTriageApi, configureAgentsMdApi, cleanSkillsApi } from 'wordpress-agent-kit/api'`

## Notes for Agents

- When modifying commands, ensure you update the corresponding JSDoc comments.
- The `src/lib/installer.ts` file is critical as it handles the file copying logic.
- The `src/lib/triage-mapper.ts` file contains logic for mapping project detection results to configuration options.
- The `src/lib/api.ts` file exposes the programmatic API — all changes to command logic should flow through to the API.
- The `vendor` directory is gitignored and populated via submodule or script. Upstream skills sync to `.github/skills/` (sync buffer) then copy to `.agents/skills/` (canonical).
- The `.agents/skills/` directory contains 18 WordPress skills (17 upstream + 1 custom `wp-wpengine`) following the AgentSkills.io spec. Skills are installed to `.agents/skills/` (universal convention) instead of platform-specific directories.
- CI runs on every push: lint, typecheck, test, build. No publish workflow (manual npm publish only).

## Pi Extension (Package)

- `pi.extensions`: `./extensions/wp-agent-kit` — registers WordPress agent tools
- `pi.skills`: `./.agents/skills` — 18 WordPress skills discoverable by Pi (17 upstream + `wp-wpengine` custom from `skills-custom/`). Uses AgentSkills.io convention.
- Tools: `wp_triage`, `wp_install_kit`, `wp_sync_skills`, `wp_upgrade`, `wp_clean_skills`
- Commands: `/wp-triage`, `/wp-install`, `/wp-sync-skills`, `/wp-upgrade`, `/wp-clean-skills`
