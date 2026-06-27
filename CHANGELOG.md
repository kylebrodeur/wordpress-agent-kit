## [0.7.1] - 2026-06-27

### Fixed

- **Pi skill collision** (26 duplicate warnings per session): Removed `pi.skills: "./.agents/skills"`
  from `package.json`. Pi auto-discovers `.agents/skills/` from the project cwd via the
  AgentSkills.io convention — having the same directory registered at both the package level
  (`pi.skills`) and the project level (auto-discovery) produced 26 name-collision warnings
  every time Pi started, in both the dev project and any user project that had run `install`.

- **`resources_discover` — cwd-aware, zero-collision logic**: The handler now reads `event.cwd`
  (typed on `ResourcesDiscoverEvent`) to determine whether the current project already has its
  own `.agents/skills/`. If yes, it stays silent (Pi's project-level scan handles discovery).
  If no, it serves the package's canonical `.agents/skills/` so all 26 skills are immediately
  available even before `wp-agent-kit install` is run.

## [0.7.0] - 2026-06-27

### Added

- **`wp-gravity-forms` skill** (`skills-custom/wp-gravity-forms/`): Dedicated Gravity Forms skill
  covering `wp gf` CLI (install, update, form/entry management), `GFAPI` PHP patterns, JSON
  form versioning, Cloudflare Turnstile anti-spam, MCP-compatible form schema serialization,
  and remote WP Engine management. Includes `references/gravity-forms-cli.md` and
  `scripts/gf-inspect.sh` (local + remote audit script).

- **`wp-gravity-smtp` skill** (`skills-custom/wp-gravity-smtp/`): Gravity SMTP skill covering
  provider configuration (SendGrid, Mailgun, Postmark, Brevo, SES, M365, Google, custom SMTP),
  credential isolation in `wp-config.php` (not `wp_options`), backup sender/alert setup, and
  a mandatory **CVE-2026-4020** version check (`wp gf version gravitysmtp` must be ≥ 2.1.5).

- **`wp-gravity-connect` skill** (`skills-custom/wp-gravity-connect/`): Gravity Connect / OpenAI
  Connection skill. Documents the Fields-vs-Feeds architectural decision (real-time pre-submission
  vs async post-submission), token ceiling recommendations by task type, OpenRouter model
  hot-swapping via custom base URL, GPT Image generation, and voice-to-text transcription.

- **`wp-gravityview` skill** (`skills-custom/wp-gravityview/`): GravityKit / GravityView skill
  covering View creation (list, table, DataTables, map), search/filter, entry approval workflows,
  edit-entry front-end forms, role/ownership-based access restrictions, shortcodes, GravityActions,
  GravityBoard, and the **GravityKit WordPress MCP** for surgical block-level AI editing.
  Developer docs linked to the new [gravitykit.dev](https://www.gravitykit.dev/) portal.

- **`wp-gravity-wiz` skill** (`skills-custom/wp-gravity-wiz/`): Gravity Wiz / Spellbook skill
  covering unified Spellbook platform installation (replaces legacy individual perk installs),
  Gravity Perks ecosystem (GP Populate Anything + AI feed hooks, Nested Forms, Advanced Select,
  Live Preview, Copy Cat, Limit Submissions), and memory-footprint optimization for LLM loops.

- **`wp-pods` skill** (`skills-custom/wp-pods/`): Pods Framework skill. Critical guardrail: always
  declare `wp_postmeta` vs ACT (Advanced Content Type / custom table) storage to AI agents before
  writing any queries. Covers `pods_field()` vs `get_post_meta()` patterns, relationship ID arrays,
  REST API exposure, WordPress Abilities API integration, and the `pods-gravity-forms` add-on.

- **`wp-gravity-stack` skill** (refactored to orchestrator): Repurposed as a meta-skill for full
  stack setup — SatisPress `composer.json` with version-pinned packages (`gravitysmtp ≥ 2.1.5`),
  cross-product architecture overview, and links to all individual product skills.

- **`wordpress-ai-gravity-reference.md`** (`wp-gravity-stack/references/`): Comprehensive
  WordPress + AI development reference guide covering Pods/GF/SMTP/Spellbook/Connect/GravityView
  architectural patterns, security guardrails (CVE-2026-4020), developer matrix, `.cursorrules`
  template, and `llms.txt` workspace context template for MCP pipelines.

- **Documentation links updated** across all new skills: `gravitykit.dev` (developer hook docs,
  Foundation framework, 37 products), `docs.gravityforms.com/category/user-guides/` (incl. 3.0
  beta), `gravitywiz.com/documentation/gravity-connect/`, `gravitywiz.com/documentation/gravity-perks/`.

### Changed

- **Skill count**: 18 → 26 total skills (17 upstream + 9 custom). New custom skills: `wp-gravity-forms`,
  `wp-gravity-smtp`, `wp-gravity-connect`, `wp-gravityview`, `wp-gravity-wiz`, `wp-pods`
  (plus existing `wp-bootstrap`, `wp-wpengine`, `wp-gravity-stack`).
- **`wp-gravity-stack`**: Removed `gravity-forms-cli.md` (moved to `wp-gravity-forms/references/`)
  and `gf-inspect.sh` (moved to `wp-gravity-forms/scripts/`). Now functions as a lean orchestrator.
- **`AGENTS.template.md`**: Extended skill routing table with all 9 custom Gravity/Pods/Bootstrap
  skills so new projects get correct routing from day one.
- **`README.md`**: Updated version badge, intro paragraph, directory tree comment, and skills
  reference table to reflect all 26 skills.
- **`AGENTS.md`**: Updated skill counts and custom skill list.
- **Extension (`extensions/wp-agent-kit/index.ts`)**: Updated skill count references (18 → 26).

## [0.6.0] - 2026-06-27

### Added
- **`wp-bootstrap` skill** (`skills-custom/wp-bootstrap/`): Full project bootstrapper covering
  monorepo detection, Composer/WPackagist/SatisPress, Playground, WP Engine CI/CD, git hooks.
  Inspired by patterns from the wp-agent-os project (setup.sh, package-plugins.sh, run-playground.sh,
  run-local-verify.sh). References: `monorepo-patterns.md`, `composer-setup.md`.
- **`wp-bootstrap` CLI command** (`wp-agent-kit bootstrap`): Detects project structure and scaffolds
  tooling. Supports `--detect-only`, `--auto`, `--wpe-prod/staging/dev`, `--with-wpackagist`,
  `--with-satispress`, `--dry-run`, `--json`.
- **`bootstrapApi`** in programmatic API: `import { bootstrapApi } from 'wordpress-agent-kit/api'`.
- **`wp_bootstrap` Pi tool** + `/wp-bootstrap` command: structure detection and bootstrap in Pi.
- **Agent scripts** in `wp-bootstrap/scripts/`:
  - `detect-structure.mjs` — probe repo → JSON: monorepo, WP packages, tooling, WPE remotes
  - `bootstrap.sh` — one-command setup (hooks + PHP + JS deps), reads `wp-bootstrap.config.json`
  - `package-wp.sh` — build + zip WP plugins/themes for upload
  - `playground-start.sh` — multi-mount interactive Playground
  - `playground-verify.sh` — headless WP verification

### Fixed
- **WP Engine URL format**: Portal-first approach — formats vary by account. `SKILL.md` now shows
  both forms and always defers to the portal. GitHub Actions workflows use `WPE_*_GIT_URL` secrets
  (exact URL from portal) with bare-slug fallback.

### Changed
- `AGENTS.md`: updated for v0.6.0, added `wp_bootstrap` to tools/commands lists.
- Extension header: updated description to include bootstrapping.

## [0.5.1] - 2026-06-27

### Added
- **`wp-wpengine` skill — WP-CLI via SSH gateway**: New comprehensive section covering three
  methods (direct SSH, `--ssh` flag, `wp-cli.yml` aliases), common operations (cache flush,
  plugin management, DB export, search-replace, cron), and `wp-cli.yml` alias setup.
- **`wp-wpengine` skill — GitHub Actions CI/CD pipeline**: Full branch-gated deploy workflow
  with `develop` → dev, `staging` → staging, `main` → production. Safety escalation table
  by environment. Reference: `references/github-actions-deploy.md`.
- **`wp-wpengine` skill — CI gate**: Two-gate model (PHP + JS/TS parallel jobs) that makes
  `--no-verify` irrelevant — CI re-runs every check regardless. `gate-passed` summary job
  as the single branch-protection required check. Reference: `references/ci-gate.md`.
- **Agent-runnable scripts** in `wp-wpengine/scripts/`:
  - `ci-gate.sh` — run the full PHP + JS/TS gate locally before pushing (`--php-only` / `--js-only`)
  - `wpe-preflight.sh` — pre-deploy sanity check: SSH, WP-CLI, siteurl/home, HTTP health, REST API
  - `wpe-check.sh` — SSH connectivity diagnostic, reads installs from `wp-cli.yml` `@aliases`
- **`wp-wpcli-and-ops` skill**: Cross-reference note pointing to `wp-wpengine` for remote SSH on WP Engine.

### Fixed
- **`wp-wpengine` remote URL format**: WP Engine requires an environment prefix.
  Correct: `git@git.wpengine.com:production/<install>.git`. Previous form
  (`git@git.wpengine.com:<install>.git`) is an older format that may no longer work.
  All `git remote add` commands updated; SKILL.md now directs users to the portal URL.
- **`wp-wpengine` `ssh-keyscan`**: Added `-t rsa` flag for `git.wpengine.com` —
  WP Engine's git push host serves RSA keys; all real-world CI implementations specify
  `-t rsa` explicitly.
- **Key type note**: RSA 4096-bit is the proven key type for WP Engine git push.
  Ed25519 is supported on current infrastructure but RSA is recommended for new setups.

### Changed
- **Dev tooling**: Dropped ESLint and Prettier; Biome is now the sole linter + formatter
  for this project. Eliminates the Prettier (spaces) vs Biome (tabs) conflict. Pre-commit
  runs `biome check` only; pre-push runs the full gate (`biome + tsc + vitest + build`).
  CI uses `biome ci` (strict mode).
- **`.npmignore`**: Removed stale ESLint/Prettier references; added `biome.json`, `.husky/`,
  `.github/workflows/` (CI configs excluded, but `.github/agents/` and `.github/instructions/`
  remain included as they are installed into user projects).

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
