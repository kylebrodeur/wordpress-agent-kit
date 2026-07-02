# Project: WordPress Agent Kit (CLI)

This is a Node.js CLI tool (`wp-agent-kit`) designed to scaffold AI agent configuration for WordPress projects. It helps developers quickly set up `AGENTS.md` and `.agents/skills/` in their repositories.

## Tech Stack

- **Language**: TypeScript (Node.js)
- **Framework**: Commander.js
- **Prompting**: `@clack/prompts`
- **Build**: `tsc` (TypeScript Compiler)
- **Test**: `vitest`
- **Lint/Format**: Biome

## Architecture

- **Entry Point**: `src/cli.ts`
- **Commands**: `src/commands/*.ts` (e.g., `install`, `setup`, `skills`, `playground`, `upgrade`)
- **Core Logic**: `src/lib/*.ts` (e.g., `installer.ts` for file copying, `triage-mapper.ts` for project detection, `api.ts` for programmatic API)
- **Utilities**: `src/utils/*.ts` (e.g., `paths.ts`, `run.ts`, `output.ts`, `exit-codes.ts`)
- **Assets**:
  - `AGENTS.template.md`: The template file copied to user projects.
  - `.github/`: Platform-specific agents, instructions, and prompts (copied to target platform dir).
  - `skills/`: Marketplace source for our 9 custom skills (wp-bootstrap, wp-gravity-*, wp-pods, wp-wpengine). Committed to git (pulled by `npx skills add kylebrodeur/wordpress-agent-kit`), but EXCLUDED from the npm package (.npmignore). NOT vendored into the npm package.
  - `.agents/skills/`: Dev-only generated skills directory (AgentSkills.io convention), populated by `wp-agent-kit skills install` via `npx skills add` (our 9 + the 17 upstream). Gitignored. NOT shipped.

## Package Exports

- `wordpress-agent-kit` → CLI entry (`dist/cli.js`)
- `wordpress-agent-kit/api` → Programmatic API (`dist/lib/api.js`)

## Development Workflow

- **Run locally**: `pnpm dev` (uses `tsx src/cli.ts`)
- **Build**: `pnpm build` (outputs to `dist/`)
- **TypeCheck**: `pnpm check` (no-emit type checking)
- **Test**: `pnpm test:run` (runs Vitest)
- **Lint**: `pnpm lint:check` (Biome)
- **Format**: `pnpm format` (Biome)
- **Pre-commit**: Husky runs lint:check + test:run

## Key Commands

- `install`: Copies platform-specific agents/instructions/prompts and the `AGENTS.md` template to a target directory. No longer copies skills — prints a hint to run `skills install` separately. Supports `--json`, `--dry-run`, `--ndjson`.
- `setup`: Interactive wizard that detects project type and configures the kit. Supports `--auto`, `--project-type`, `--tech-stack`, `--yes`.
- `skills install [dir]`: Installs all 26 skills into `<target>/.agents/skills/` (AgentSkills.io convention) by running two `npx skills add` commands, both targeting the universal `.agents/skills/` directory only (via `--agent cursor`, which maps to the shared `.agents/skills/` dir — no per-agent directories): (1) `npx skills add kylebrodeur/wordpress-agent-kit --agent cursor --yes` (our 9), (2) `npx skills add WordPress/agent-skills --agent cursor --yes` (the 17 upstream). Requires network + npx. Accepts `[dir]` (defaults to cwd) and `--dry-run`. No other skill flags. Supports `--json`, `--quiet`.
- `skills update [dir]`: Refreshes all installed skills in `.agents/skills/` by running `npx skills update --yes` (the vercel-labs/skills CLI). Accepts `[dir]` (defaults to cwd) and `--dry-run`. Supports `--json`, `--quiet`.
- `clean-skills`: Detects and removes orphaned skills that are no longer part of the kit. Supports `--dry-run`, `--remove`, `--json`.
- `playground`: Launches a local WordPress Playground instance using a blueprint.
- `upgrade`: Checks for and applies newer versions. Supports `--check-only`, `--force`, `--json`.

## Agent-Friendly Features (v0.3.0+)

- `--json`: Structured JSON output with success/data/error/time fields
- `--dry-run`: Preview mode showing what would happen without making changes
- `--ndjson`: Newline-delimited JSON for streaming long operations
- `--quiet`: Suppress non-essential output
- **Semantic exit codes**: 0=OK, 2=Invalid Args, 3=Not Found, 4=Permission Denied, 5=Already Exists, 6=Git Error, 7=Network Error, 8=Validation Error, 130=Cancelled
- **Programmatic API**: `import { installKitApi, installSkillsApi, updateSkillsApi, runTriageApi, configureAgentsMdApi, cleanSkillsApi } from 'wordpress-agent-kit/api'`

## Notes for Agents

- When modifying commands, ensure you update the corresponding JSDoc comments.
- The `src/lib/installer.ts` file is critical as it handles the file copying logic.
- The `src/lib/triage-mapper.ts` file contains logic for mapping project detection results to configuration options.
- The `src/lib/api.ts` file exposes the programmatic API — all changes to command logic should flow through to the API.
- The npm package ships ONLY the CLI (`dist/`), platform-specific agents/instructions/prompts (`.github/`), and `AGENTS.template.md`. NO skills are shipped in the npm package — zero vendoring.
- Skills installed to `.agents/skills/` (AgentSkills.io spec, universal convention) total 26: our 9 custom skills — committed to git under the top-level `skills/` directory (marketplace source for `npx skills add kylebrodeur/wordpress-agent-kit`, but NOT shipped in the npm package) — `wp-wpengine`, `wp-bootstrap`, `wp-gravity-forms`, `wp-gravity-smtp`, `wp-gravity-connect`, `wp-gravityview`, `wp-gravity-wiz`, `wp-gravity-stack`, `wp-pods` — plus 17 upstream pulled via `npx skills add WordPress/agent-skills`. We do NOT maintain or vendor the upstream skills. `.agents/skills/` is generated by `wp-agent-kit skills install` and gitignored (dev-only). Requires network + npx.
- CI runs on every push: lint, typecheck, test, build. No publish workflow (manual npm publish only).

## Pi Extension (Package)

- `pi.extensions`: `./extensions/wp-agent-kit` — registers WordPress agent tools
- `pi.skills`: removed — Pi auto-discovers `.agents/skills/` from the project cwd (AgentSkills.io convention). The extension's `resources_discover` handler serves the repo's bundled custom skills (`skills/`, our 9) as a convenience when the project has no `.agents/skills/` of its own and `skills/` is present (dev checkout); in an npm install (skills/ not shipped) it is a no-op — run `wp_skills_install` to populate `.agents/skills/`. Stays silent once `.agents/skills/` exists to avoid name-collision warnings.
- Tools: `wp_triage`, `wp_install_kit`, `wp_skills_install`, `wp_skills_update`, `wp_upgrade`, `wp_clean_skills`
- Commands: `/wp-triage`, `/wp-install`, `/wp-skills-install`, `/wp-skills-update`, `/wp-upgrade`, `/wp-clean-skills`
