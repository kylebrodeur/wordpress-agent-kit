import path from 'node:path';
import { Command } from 'commander';
import {
	type CliResult,
	type DryRunResult,
	type InstallOptions,
	type InstallResult,
	installKitApi,
} from '../lib/api.js';
import { OutputFormatter, createFormatter } from '../utils/output.js';

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

/**
 * Extracts the actual data from a result, handling both regular and dry-run results.
 */
function getResultData<T>(
	result: CliResult<T | DryRunResult<T>>
): (T | DryRunResult<T>) | undefined {
	if (!result.success || !result.data) return undefined;
	if (isDryRunResult(result)) {
		return result.data.summary;
	}
	return result.data;
}

/**
 * Command to install the WordPress Agent Kit into a target directory.
 * Takes an optional directory argument, defaulting to the current working directory.
 * Supports --json, --quiet, --ndjson, --dry-run global flags.
 */
export const installCommand = new Command('install')
	.description('Install the WordPress Agent Kit into a target directory')
	.argument('[dir]', 'Target directory to install into', process.cwd())
	.option('--platform <platform>', 'Target platform (github, cursor, claude, agent, pi)', 'github')
	.option('--force', 'Overwrite existing installation', false)
	.action(async (dir: string, options, command) => {
		const globalOpts = command.parent?.opts() || {};
		const platform = options.platform;
		const validPlatforms = ['github', 'cursor', 'claude', 'agent', 'pi'];

		if (!validPlatforms.includes(platform)) {
			const formatter = createFormatter(globalOpts, 'install', '0.0.0');
			const result = formatter.fail({
				code: 'INVALID_PLATFORM',
				message: `Invalid platform: ${platform}. Valid options: ${validPlatforms.join(', ')}`,
				exitCode: 2,
			});
			process.exit(OutputFormatter.getExitCode(result));
		}

		const _formatter = createFormatter(globalOpts, 'install', '0.0.0');
		const targetDir = path.resolve(dir);

		const installOptions: InstallOptions = {
			targetDir,
			platform: platform as InstallOptions['platform'],
			force: options.force,
			dryRun: globalOpts.dryRun,
		};

		const result = await installKitApi(installOptions);

		if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		// Human-readable output
		if (isRegularResult(result)) {
			const data = result.data;
			console.log(`✓ Installed WordPress Agent Kit (${platform}) to ${targetDir}`);
			console.log(
				`  Files: ${data.filesCreated.length} created, ${data.filesSkipped.length} skipped`
			);
			console.log(`  Duration: ${data.durationMs}ms`);
		} else if (isDryRunResult(result)) {
			// Dry-run result - just show summary
			console.log(`✓ Dry-run: ${result.data.summary.filesCreated.length} files would be created`);
		} else {
			console.error(`✗ Installation failed: ${result.error?.message}`);
		}

		process.exit(result.success ? 0 : 1);
	});
