# Release v0.2.0

## Features

- **CLI Refactor**: Complete rewrite of the CLI using `commander.js` and TypeScript.
- **New Setup Command**: Interactive setup wizard available via `wp-agent-kit setup`.
- **Reset Flag**: Use `--reset` to force overwrite existing configurations.
- **Multi-Platform Bundles**: Pre-built bundles for `.agent`, `.claude`, `.github`, and `.cursor` workflows.
- **Complete Agent Context**: Bundles now include agents, instructions, and prompts folders alongside skills.
- **Documentation**: Updated README with modern branding and comprehensive usage instructions.
- **Build System**: Separate CLI compilation and agent bundle generation with proper file exclusions.

## Installation

**CLI (recommended):**

```bash
pnpm dlx wp-agent-kit setup
```

**Direct Bundle Download:**
Download one of the pre-built bundles from the release assets:

- `wordpress-agent-kit-github.tar.gz` - For GitHub Copilot
- `wordpress-agent-kit-claude.tar.gz` - For Claude Code
- `wordpress-agent-kit-agent.tar.gz` - For generic .agent workflows
- `wordpress-agent-kit-cursor.tar.gz` - For Cursor IDE

Extract into your WordPress project root.

## Changes

- Created `scripts/build-bundles.ts` for multi-platform bundle generation
- Added agents and instructions folders to bundles
- Excluded system files (.DS_Store, Thumbs.db, editor temp files) from distribution
- Excluded personal development prompts from public distribution
- Added standard badges to README
- Bundles contain AGENTS.md, WordPress skills, agents, and instructions
