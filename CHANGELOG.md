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