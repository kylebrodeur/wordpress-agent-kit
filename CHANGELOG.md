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