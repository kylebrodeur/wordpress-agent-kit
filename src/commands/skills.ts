import path from 'node:path';
import { Command } from 'commander';
import {
	type CliResult,
	type DryRunResult,
	type SkillsApiResult,
	installSkillsApi,
	updateSkillsApi,
} from '../lib/api.js';
import { OutputFormatter } from '../utils/output.js';

function isDryRunResult<T>(
	result: CliResult<T | DryRunResult<T>>
): result is CliResult<DryRunResult<T>> & { success: true; data: DryRunResult<T> } {
	return result.success && 'wouldExecute' in (result.data || {});
}

function isRegularResult<T>(
	result: CliResult<T | DryRunResult<T>>
): result is CliResult<T> & { success: true; data: T } {
	return result.success && !('wouldExecute' in (result.data || {}));
}

/** Print each `npx skills` source step and its outcome. */
function printSources(data: SkillsApiResult, verb: string): void {
	for (const s of data.sources) {
		if (s.success) {
			console.log(`✓ ${verb} ${s.source}`);
			console.log(`  ${s.command}`);
		} else {
			console.warn(`⚠ ${verb} ${s.source} failed`);
			console.warn(`  ${s.command}`);
			if (s.error) console.warn(`  ${s.error}`);
		}
	}
	for (const warning of data.warnings) {
		console.warn(`⚠ ${warning}`);
	}
	console.log(`  Duration: ${data.durationMs}ms`);
}

/**
 * Parent `skills` command with install/update subcommands.
 */
export const skillsCommand = new Command('skills')
	.description('Manage WordPress Agent Kit skills')
	.addHelpText(
		'after',
		`
Skills are pulled fresh via the \`skills\` CLI (npx skills) — none are vendored.
  • Our 9 custom skills:  npx skills add kylebrodeur/wordpress-agent-kit
  • 17 upstream skills:   npx skills add WordPress/agent-skills
Both target the universal .agents/skills/ directory.

Examples:
  $ wp-agent-kit skills install
  $ wp-agent-kit skills install ./my-project
  $ wp-agent-kit skills update
  $ wp-agent-kit skills install --dry-run
`
	);

const installSubcommand = new Command('install')
	.description('Install WordPress Agent Kit skills into a target directory')
	.argument('[dir]', 'Target directory', process.cwd())
	.action(async (dir: string, _options, command) => {
		const globalOpts = command.parent?.parent?.opts() || {};
		const targetDir = path.resolve(dir);

		const result = await installSkillsApi({ targetDir, dryRun: globalOpts.dryRun });

		if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		if (isRegularResult(result)) {
			printSources(result.data, 'installed');
		} else if (isDryRunResult(result)) {
			console.log('✓ Dry-run: would run the following:');
			for (const a of result.data.actions) {
				console.log(`  - ${a.description}`);
			}
		} else {
			console.error(`✗ Skills install failed: ${result.error?.message}`);
		}

		process.exit(result.success ? 0 : 1);
	});

const updateSubcommand = new Command('update')
	.description('Update WordPress Agent Kit skills in a target directory')
	.argument('[dir]', 'Target directory', process.cwd())
	.action(async (dir: string, _options, command) => {
		const globalOpts = command.parent?.parent?.opts() || {};
		const targetDir = path.resolve(dir);

		const result = await updateSkillsApi({ targetDir, dryRun: globalOpts.dryRun });

		if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		if (isRegularResult(result)) {
			printSources(result.data, 'updated');
		} else if (isDryRunResult(result)) {
			console.log('✓ Dry-run: would run the following:');
			for (const a of result.data.actions) {
				console.log(`  - ${a.description}`);
			}
		} else {
			console.error(`✗ Skills update failed: ${result.error?.message}`);
		}

		process.exit(result.success ? 0 : 1);
	});

skillsCommand.addCommand(installSubcommand);
skillsCommand.addCommand(updateSubcommand);
