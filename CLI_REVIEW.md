# WordPress Agent Kit CLI - Accessibility & Agent-Friendly Review

**Date**: 2026-06-08  
**Version**: 0.2.1

---

## Executive Summary

The current CLI is functional for **human developers** using interactive prompts (`@clack/prompts`), but lacks features for **programmatic/agent usage**:

- ❌ No JSON output mode
- ❌ No machine-readable result objects
- ❌ No programmatic API (only CLI entrypoint)
- ❌ No non-interactive "headless" mode for all commands
- ❌ No structured logging/event streaming
- ❌ Exit codes not consistently semantic

---

## Current Architecture

```
src/
├── cli.ts                    # Entry point, Commander setup
├── commands/
│   ├── install.ts           # Non-interactive (args + flags only) ✓
│   ├── setup.ts             # Interactive (prompts only) ✗
│   ├── skills.ts            # Non-interactive (args + flags only) ✓
│   └── run-playground.ts    # Non-interactive ✓
├── lib/
│   ├── installer.ts         # Core logic (pure functions) ✓
│   └── triage-mapper.ts     # Pure mappers ✓
└── utils/
    ├── paths.ts             # Path resolution
    └── run.ts              # Command runner
```

**Good**: Core logic (`installKit`, mappers) is pure and testable.  
**Gap**: `setup.ts` couples interactive prompts with business logic.

---

## Recommendations

### 1. Add JSON Output Mode (--json)

**Goal**: Every command outputs structured JSON to stdout when requested.

```bash
# Success
wp-agent-kit install /path/to/project --platform github --json
# {"success":true,"targetDir":"/path/to/project","platform":"github","filesCopied":["AGENTS.md",".github/..."],"durationMs":142}

# Failure
wp-agent-kit install /nonexistent --json
# {"success":false,"error":"E_NOT_FOUND","message":"Target directory does not exist","code":"ENOENT"}
```

**Implementation**:

- Add `--json` / `--output json` global flag in `cli.ts`
- Create `OutputFormatter` utility: `json`, `human`, `quiet`
- Return structured result objects from all command actions
- Separate stdout (JSON) from stderr (human diagnostics)

### 2. Add Machine-Readable Exit Codes

| Code | Meaning                          |
| ---- | -------------------------------- |
| 0    | Success                          |
| 1    | General error                    |
| 2    | Invalid arguments / usage        |
| 3    | Target not found / ENOENT        |
| 4    | Permission denied / EACCES       |
| 5    | Already exists (without --force) |
| 6    | Git/submodule error              |
| 7    | Network/fetch error              |
| 8    | Validation failed                |
| 130  | Cancelled (SIGINT)               |

### 3. Extract Programmatic API

Expose core functions for direct import by agents/scripts:

```typescript
// src/api.ts (new)
export interface InstallOptions {
  targetDir: string;
  platform: Platform;
  force?: boolean;
  dryRun?: boolean;
}

export interface InstallResult {
  success: boolean;
  targetDir: string;
  platform: Platform;
  filesCreated: string[];
  filesSkipped: string[];
  errors: string[];
  durationMs: number;
}

export async function installKit(options: InstallOptions): Promise<InstallResult>;
export async function installSkills(options: SkillsOptions): Promise<SkillsResult>;
export async function updateSkills(options: SkillsOptions): Promise<SkillsResult>;
export async function runTriage(targetDir: string): Promise<TriageResult>;
export async function configureAgentsMd(options: ConfigureOptions): Promise<ConfigureResult>;
```

**Benefits**:

- Agents can import and call directly: `import { installKit } from 'wordpress-agent-kit'`
- No subprocess overhead
- Full TypeScript types
- Testable in isolation

### 4. Make `setup` Command Headless-Capable

Current `setup.ts` is prompt-driven. Add non-interactive mode:

```bash
# Full non-interactive (requires all flags)
wp-agent-kit setup /path/to/project \
  --project-type plugin \
  --tech-stack gutenberg,rest-api,composer \
  --platform github \
  --yes \
  --json

# Hybrid: run triage, apply detected values, no prompts
wp-agent-kit setup /path/to/project --auto --json
```

**Flag Matrix for `setup`**:
| Flag | Description |
|------|-------------|
| `--project-type <type>` | plugin \| theme \| block-theme \| site \| blocks \| other |
| `--tech-stack <list>` | Comma-separated: gutenberg,interactivity,rest-api,wpcli,composer,phpstan,npm,playground |
| `--platform <platform>` | github \| cursor \| claude \| agent \| pi |
| `--package-manager <pm>` | npm \| pnpm \| yarn |
| `--auto` | Run triage, apply detected values, skip prompts |
| `--yes` / `-y` | Accept all confirmations (requires other flags) |
| `--reset` | Overwrite existing |
| `--dry-run` | Show what would be done |

### 5. Add Structured Logging / Event Stream

For long-running operations (skills install, playground), emit NDJSON events:

```bash
wp-agent-kit skills install --json-stream
# {"event":"start","phase":"upstream","timestamp":"..."}
# {"event":"progress","phase":"fetch","message":"npx skills add WordPress/agent-skills...","timestamp":"..."}
# {"event":"complete","phase":"install","result":{"skillsInstalled":26,"timestamp":"..."}}
```

**Events**: `start`, `progress`, `phase-change`, `warning`, `complete`, `error`

### 6. Add Dry-Run / Preview Mode

```bash
wp-agent-kit install /path --dry-run --json
# {"wouldCopy":[{"src":"AGENTS.template.md","dest":"/path/AGENTS.md"},{"src":".github/...","dest":"/path/.github/..."}],"wouldCreateDirs":[]}

wp-agent-kit setup /path --dry-run --auto --json
# {"wouldInstall":true,"detectedType":"plugin","detectedTech":["gutenberg","npm"],"wouldModify":["AGENTS.md"]}
```

### 7. Add Shell Completion (Modern CLI Standard)

```bash
# Generate completion scripts
wp-agent-kit completion bash > /etc/bash_completion.d/wp-agent-kit
wp-agent-kit completion zsh > ~/.zsh/completions/_wp-agent-kit
wp-agent-kit completion fish > ~/.config/fish/completions/wp-agent-kit.fish
```

Commander.js supports this natively: `program.enablePositionalOptions().addHelpCommand().configureOutput({ writeOut: ... })`

### 8. Add `--version` JSON Output

```bash
wp-agent-kit --version --json
# {"name":"wp-agent-kit","version":"0.2.1","node":"20.18.0","platform":"linux"}
```

---

## Priority Matrix

| Priority | Feature                 | Effort | Impact |
| -------- | ----------------------- | ------ | ------ |
| **P0**   | JSON output (`--json`)  | Low    | High   |
| **P0**   | Semantic exit codes     | Low    | High   |
| **P0**   | Programmatic API export | Medium | High   |
| **P1**   | Headless `setup` mode   | Medium | High   |
| **P1**   | Dry-run/preview         | Low    | Medium |
| **P2**   | NDJSON event streaming  | Medium | Medium |
| **P2**   | Shell completions       | Low    | Medium |
| **P3**   | Man page generation     | Low    | Low    |

---

## Example: Agent-Friendly Workflow

```bash
# 1. Agent detects WordPress project
wp-agent-kit setup /workspace/my-plugin --auto --json
# {"success":true,"applied":{"projectType":"plugin","techStack":["gutenberg","npm"]},"filesModified":["AGENTS.md"]}

# 2. Agent installs skills (our 9 via npx skills add kylebrodeur/wordpress-agent-kit + 17 upstream via npx skills add WordPress/agent-skills)
wp-agent-kit skills install --json
# {"success":true,"skillsInstalled":26,"custom":9,"upstream":17}

# 3. Agent installs for specific platform (e.g., Cursor)
wp-agent-kit install /workspace/my-plugin --platform cursor --json
# {"success":true,"platform":"cursor","targetDir":"/workspace/my-plugin","filesCreated":[".cursor/...","AGENTS.md"]}
```

---

## Implementation Notes

### Minimal Changes for P0

1. **cli.ts**: Add global `--json` flag, result formatter
2. **commands/\*.ts**: Return structured results instead of `process.exit()`
3. **lib/installer.ts**: Return `InstallResult` object (already close)
4. **package.json**: Add `"exports": { ".": "./dist/cli.js", "./api": "./dist/api.js" }`

### Testing Strategy

```typescript
// tests/api/install.api.test.ts
import { installKit } from '../../src/api.js';

it('returns structured result on success', async () => {
  const result = await installKit({ targetDir: '/tmp/test', platform: 'github' });
  expect(result.success).toBe(true);
  expect(result.filesCreated).toContain('AGENTS.md');
});
```

---

## References

- [Commander.js JSON output patterns](https://github.com/tj/commander.js/blob/master/Examples/options-json.ts)
- [CLI Guidelines - Output](https://clig.dev/#output)
- [12-factor CLI apps](https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46)
- [GitHub CLI `gh` JSON patterns](https://cli.github.com/manual/gh_help_formatting)
