import path from 'node:path';
import { Command } from 'commander';
import {
	type CliResult,
	type DryRunResult,
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

/** Shared passthrough options for the upstream `npx skills` CLI. */
function addUpstreamOptions(command: Command): Command {
	return command
		.option('--agent <agent>', 'Passthrough --agent to npx skills')
		.option('--project-dir <dir>', 'Passthrough --project-dir to npx skills')
		.option('--global', 'Passthrough --global to npx skills', false)
		.option('--force', 'Overwrite existing custom skills', false);
}

/**
 * Parent `skills` command with install/update subcommands.
 */
export const skillsCommand = new Command('skills')
	.description('Manage WordPress Agent Kit skills')
	.addHelpText(
		'after',
		`
Examples:
  $ wp-agent-kit skills install
  $ wp-agent-kit skills install ./my-project --agent claude
  $ wp-agent-kit skills update --force
  $ wp-agent-kit skills install --dry-run
`
	);

const installSubcommand = addUpstreamOptions(
	new Command('install')
		.description('Install WordPress Agent Kit skills into a target directory')
		.argument('[dir]', 'Target directory', process.cwd())
		.action(async (dir: string, options, command) => {
			const globalOpts = command.parent?.parent?.opts() || {};
			const targetDir = path.resolve(dir);

			const result = await installSkillsApi({
				targetDir,
				dryRun: globalOpts.dryRun,
				force: options.force,
				agent: options.agent,
				projectDir: options.projectDir,
				global: options.global,
			});

			if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
				process.exit(OutputFormatter.getExitCode(result));
			}

			if (isRegularResult(result)) {
				const data = result.data;
				console.log(`✓ Installed ${data.customSkills.length} custom skills`);
				if (data.upstreamCommand) {
					if (data.upstreamSuccess) {
						console.log(`✓ Upstream step completed: ${data.upstreamCommand}`);
					} else {
						console.warn(`⚠ Upstream step failed: ${data.upstreamCommand}`);
						if (data.upstreamError) console.warn(`  ${data.upstreamError}`);
					}
				}
				for (const warning of data.warnings) {
					console.warn(`⚠ ${warning}`);
				}
				console.log(`  Duration: ${data.durationMs}ms`);
			} else if (isDryRunResult(result)) {
				console.log(
					`✓ Dry-run: would install ${result.data.summary.customSkills.length} custom skills`
				);
				if (result.data.summary.upstreamCommand) {
					console.log(`  Upstream step: ${result.data.summary.upstreamCommand}`);
				}
			} else {
				console.error(`✗ Skills install failed: ${result.error?.message}`);
			}

			process.exit(result.success ? 0 : 1);
		})
);

const updateSubcommand = addUpstreamOptions(
	new Command('update')
		.description('Update WordPress Agent Kit skills in a target directory')
		.argument('[dir]', 'Target directory', process.cwd())
		.action(async (dir: string, options, command) => {
			const globalOpts = command.parent?.parent?.opts() || {};
			const targetDir = path.resolve(dir);

			const result = await updateSkillsApi({
				targetDir,
				dryRun: globalOpts.dryRun,
				force: options.force,
			});

			if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
				process.exit(OutputFormatter.getExitCode(result));
			}

			if (isRegularResult(result)) {
				const data = result.data;
				console.log(`✓ Updated ${data.customSkills.length} custom skills`);
				if (data.upstreamCommand) {
					if (data.upstreamSuccess) {
						console.log(`✓ Upstream step completed: ${data.upstreamCommand}`);
					} else {
						console.warn(`⚠ Upstream step failed: ${data.upstreamCommand}`);
						if (data.upstreamError) console.warn(`  ${data.upstreamError}`);
					}
				}
				for (const warning of data.warnings) {
					console.warn(`⚠ ${warning}`);
				}
				console.log(`  Duration: ${data.durationMs}ms`);
			} else if (isDryRunResult(result)) {
				console.log(
					`✓ Dry-run: would update ${result.data.summary.customSkills.length} custom skills`
				);
				if (result.data.summary.upstreamCommand) {
					console.log(`  Upstream step: ${result.data.summary.upstreamCommand}`);
				}
			} else {
				console.error(`✗ Skills update failed: ${result.error?.message}`);
			}

			process.exit(result.success ? 0 : 1);
		})
);

skillsCommand.addCommand(installSubcommand);
skillsCommand.addCommand(updateSubcommand);
