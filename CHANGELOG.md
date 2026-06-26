## [0.5.0] - 2026-06-27

### Added

- **AgentSkills.io convention**: Skills are now installed to `.agents/skills/` (universal, AgentSkills.io convention) instead of platform-specific directories. This makes skills discoverable by any agent that follows the spec (Pi, Claude, Cursor, Copilot).
- **`wp_clean_skills` tool and CLI**: New tool to detect and remove orphaned skills from installed projects. Supports `--dry-run` (default) and `--remove` modes. Available as Pi tool, Pi command `/wp-clean-skills`, and CLI command `wp-agent-kit clean-skills`.
- **`cleanSkillsApi`**: Programmatic API for detecting and removing orphaned skills.
- **Custom skills merge in `installKit`**: `installKit` now merges `skills-custom/` into the target's `.agents/skills/`, ensuring custom skills are installed even without running `sync-skills` first.
- **`customMerged` field in `SyncResult`**: `syncSkillsApi` now reports how many custom skills were merged separately from the total count.
- **Migration support**: `installKit` and `cleanSkillsApi` handle migration from legacy `.github/skills/` and platform-specific skill directories to `.agents/skills/`.

### Changed

- **Skill directory**: Canonical skill location changed from `.github/skills/` to `.agents/skills/`. The `.github/skills/` directory is now a sync buffer (gitignored). Skills are committed in `.agents/skills/`.
- **`pi.skills` in package.json**: Changed from `./.github/skills` to `./.agents/skills` (AgentSkills.io convention).
- **Pi `resources_discover`**: No longer returns `.agents/skills/` (handled by `pi.skills` auto-discovery). Only supplements with unsynced custom skills from `skills-custom/`.
- **Pi `wp_install_kit`**: Now copies skills to `.agents/skills/` (universal) instead of platform-specific `skills/` subdirectory.
- **Pi `wp_sync_skills`**: Now copies synced skills to `.agents/skills/` after upstream sync.
- **Pi `wp_install` command**: Version status now reads dynamically from `package.json` instead of hardcoded string.
- **`syncSkillsApi`**: After upstream sync to `.github/skills/`, also copies to `.agents/skills/` and merges custom skills there. Only increments count for new custom skills (not overwrites).

### Fixed

- **Pi skill collision**: Removed duplicate skill discovery — `.agents/skills/` is only registered once via `pi.skills`, not also via `resources_discover`.
- **Pi `wp_sync_skills`**: Result now shows custom skills merge note when applicable.
- **Pi extension**: Added `import fs from 'node:fs'` (was using CJS `require`), removed hardcoded version string.
- **`AGENTS.template.md`**: Expanded skill routing table from 5 to 13 entries.

## [0.4.0] - 2026-06-26

### Added

- **Custom skills system** (`skills-custom/`): A new directory for skills not from the WordPress/agent-skills upstream. `syncSkillsApi` now merges `skills-custom/` into `.github/skills/` after every upstream sync, so custom skills survive upstream updates.
- **`wp-wpengine` skill** (`skills-custom/wp-wpengine/`): Optional skill covering WP Engine SSH-based git push, environment management via the `wpe-labs` Claude Code skills (account-usage, installs, domains, backups, cache, users, offload, monthly-report), and API credentials via 1Password.
- **`wp-playground` skill — PHPUnit testing** (Step 8): Run PHPUnit inside Playground via `npx @wp-playground/cli@latest php --auto-mount`. No database or Docker required.
- **`wp-playground` skill — E2E Playwright testing** (Step 9): Full setup guide for `@playwright/test` + `@wp-playground/cli` `runCLI`, including locator priority for WordPress admin, server lifecycle patterns (shared vs. per-test), and version matrix testing.
- **`wp-playground` skill — programmatic `runCLI` API** (Step 10): Vitest integration pattern, `Symbol.asyncDispose` cleanup, `wordpressInstallMode: 'do-not-attempt-installing'` for pure PHP tests.
- **`references/e2e-playwright.md`**: New reference doc covering Playwright config, fixtures, Page Object Model, GitHub Actions CI workflow, and troubleshooting.

### Changed

- `wp-playground` skill description updated to reflect PHPUnit, E2E, and CI capabilities.

## [0.3.2] - 2026-06-09

### Fixed

- **Skills committed to git**: `.github/skills/` removed from `.gitignore` — no more publish-time drift.
- **All 17 skills included**: Sync restored `blueprint`, `wp-abilities-audit`, `wp-abilities-verify`, `wp-plugin-directory-guidelines`.
- **Pi extension rewritten**: Uses dynamic import (dist first, src fallback), proper `resources_discover` with explicit paths, checks both `pi` and `github` platforms on `session_start`, removes unused imports.
- **Verbose output trimmed**: Console.log removed from installer (caller handles messaging). File lists summarized by directory instead of dumping 85+ individual paths.

## [0.3.1]

### Fixed

- Console.log spam in JSON mode removed
- filesCreated summarized by directory instead of listing every file

## [0.3.0] - 2026-06-09

### Added

- **Safe update system** (`src/lib/updater.ts`): Manifest-based diff with SHA-256 hash tracking. Re-running `install` on an existing project now preserves user modifications instead of nuking everything.
- **Manifest tracking**: `.wp-agent-kit-manifest.{platform}.json` records file hashes at install time for future diff comparison.
- **Conflict detection**: Shows which files were modified by both the user and upstream. `--force` overwrites user mods.
- **Backup creation**: `.wp-agent-kit-backup-{timestamp}/` created before any file modification.
- **Pi Coding Agent extension** (`extensions/wp-agent-kit/`): Registers 4 custom tools (`wp_triage`, `wp_install_kit`, `wp_sync_skills`, `wp_upgrade`) and 4 commands (`/wp-triage`, `/wp-install`, `/wp-sync-skills`, `/wp-upgrade`).
- **Pi package manifest**: `pi.extensions` and `pi.skills` in `package.json` for install via `pi install npm:wordpress-agent-kit`.
- **`--no-safe` flag**: Disable safe update mode and force full nuke-and-replace on re-install.
- **`--no-backup` flag**: Skip backup creation before overwriting files.
- **`isUpdate` field** in install results: Indicates whether this was a fresh install or an update.
- **`conflicts` array** in install results: Lists files with merge conflicts (user + upstream both modified).

### Changed

- `installKit()` now returns `InstallKitResult` (was `void`) with detailed file lists and update status.
- **Default behavior**: Re-running `install` on an existing project uses safe update (manifest-based diff) instead of full replacement.
- **AGENTS.template.md**: Enhanced with placeholder sections for architecture, commands, conventions — filled in by project triage.
- **AGENTS.md (project-level)**: Updated with package exports, programmatic API details, and Pi extension info.
- **README.md**: Restructured as Getting Started guide with three distinct scenarios (brand new, existing project, upgrade).
- All 13 WordPress skills now include `license: GPL-2.0-or-later` in SKILL.md frontmatter.
- **Platform support**: `pi` platform now installs to `.pi/agent/` (was `.pi/agent/skills/`).

### Fixed

- Running `install` on an existing project no longer destroys user-added files in `.github/`.
- `--force` flag now actually gates destructive operations (was previously ignored in upgrade path).

## [0.2.2] - 2026-06-09

### Added

- **JSON output mode** (`--json`): All commands output structured JSON for programmatic use
- **Semantic exit codes**: 0=OK, 2=Invalid Args, 3=Not Found, 4=Permission Denied, 5=Already Exists, 6=Git Error, 7=Network Error, 8=Validation Error, 130=Cancelled
- **Programmatic API**: Import core functions directly (`import { installKitApi, syncSkillsApi, runTriageApi, configureAgentsMdApi } from 'wordpress-agent-kit/api'`)
- **Headless setup mode**: `--auto`, `--project-type`, `--tech-stack`, `--yes` flags for CI/agent automation
- **Dry-run/preview** (`--dry-run`): Preview actions without executing on all commands
- **Upgrade command**: Detect and upgrade existing installations (`wp-agent-kit upgrade [--check-only] [--force]`)
- **NDJSON streaming** (`--ndjson`): Progress events for long-running operations
- **Biome** formatter/linter integration with Husky pre-commit hooks
- **GitHub Actions CI pipeline**: Lint, typecheck, test, build on PR/push

### Changed

- `setup` command: Now supports both interactive and non-interactive modes
- All commands: Return structured `CliResult<T>` with `success`, `data`, `error`, `meta` fields
- Error handling: Consistent error envelopes with `code`, `message`, `exitCode`
- Quality gates: `prepublishOnly` runs build + lint + tests before npm publish

### Fixed

- `setup` command no longer requires TTY in headless mode
- Version detection in `upgrade` command reads from AGENTS.md and package.json

## [0.2.1] - 2026-06-05

- Bumped @earendil-works/pi-coding-agent SDK to 0.78.1.
- Updated tool `execute` signatures to match the new SDK API.
