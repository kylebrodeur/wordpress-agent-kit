#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { installCommand } from './commands/install.js';
import { runPlaygroundCommand } from './commands/run-playground.js';
import { setupCommand } from './commands/setup.js';
import { syncSkillsCommand } from './commands/sync-skills.js';
import { upgradeCommand } from './commands/upgrade.js';
import { ExitCode } from './utils/exit-codes.js';
import { createFormatter } from './utils/output.js';
import { OutputFormatter } from './utils/output.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

// Global options for all commands
program
	.name('wp-agent-kit')
	.description('Utilities for WordPress Agent Kit')
	.version(version)
	.option('--json', 'Output JSON result to stdout', false)
	.option('--quiet', 'Suppress all output except errors', false)
	.option('--ndjson', 'Output NDJSON progress events (for long operations)', false)
	.option('--dry-run', 'Preview actions without executing', false)
	.configureHelp({
		sortSubcommands: true,
	});

// Add commands
program.addCommand(installCommand);
program.addCommand(setupCommand);
program.addCommand(syncSkillsCommand);
program.addCommand(runPlaygroundCommand);
program.addCommand(upgradeCommand);

// Global error handler
program.exitOverride((err) => {
	if (err.code === 'commander.helpDisplayed' || err.code === 'commander.versionDisplayed') {
		process.exit(ExitCode.OK);
	}
	if (err.code === 'commander.unknownOption' || err.code === 'commander.invalidArgument') {
		const formatter = createFormatter({ json: true }, 'wp-agent-kit', version);
		const result = formatter.fail({
			code: 'INVALID_ARGS',
			message: err.message,
			exitCode: ExitCode.INVALID_ARGS,
		});
		process.exit(OutputFormatter.getExitCode(result));
	}
	throw err;
});

// Custom help with examples
program.addHelpText(
	'after',
	`
Examples:
  $ wp-agent-kit install --platform github
  $ wp-agent-kit setup --auto --json
  $ wp-agent-kit sync-skills --ref trunk --ndjson
  $ wp-agent-kit install --platform pi --dry-run --json
  $ wp-agent-kit upgrade --check-only --json

Programmatic API:
  import { installKit, syncSkills, runTriage } from 'wordpress-agent-kit/api';

For more info: https://github.com/kylebrodeur/wordpress-agent-kit
`
);

try {
	program.parse(process.argv);
} catch (error: unknown) {
	// Handle errors from commands that use process.exit
	const err = error as { exitCode?: number };
	if (err.exitCode !== undefined) {
		process.exit(err.exitCode);
	}
	// Fallback for unexpected errors
	const formatter = createFormatter({ json: true }, 'wp-agent-kit', version);
	const result = formatter.fail({
		code: 'UNEXPECTED_ERROR',
		message: error instanceof Error ? error.message : 'Unknown error',
		exitCode: ExitCode.ERROR,
	});
	process.exit(OutputFormatter.getExitCode(result));
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason: unknown) => {
	const formatter = createFormatter({ json: true }, 'wp-agent-kit', version);
	const result = formatter.fail({
		code: 'UNHANDLED_REJECTION',
		message: reason instanceof Error ? reason.message : String(reason),
		exitCode: ExitCode.ERROR,
	});
	process.exit(OutputFormatter.getExitCode(result));
});
