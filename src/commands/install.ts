import path from 'node:path';
import { Command } from 'commander';
import {
	type CliResult,
	type DryRunResult,
	type InstallOptions,
	installKitApi,
	isKitInstalled,
	loadManifest,
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
 * Command to install the WordPress Agent Kit into a target directory.
 * Takes an optional directory argument, defaulting to the current working directory.
 * Supports --json, --quiet, --ndjson, --dry-run global flags.
 * Safe update mode preserves user modifications on re-install.
 */
export const installCommand = new Command('install')
	.description('Install the WordPress Agent Kit into a target directory')
	.argument('[dir]', 'Target directory to install into', process.cwd())
	.option('--platform <platform>', 'Target platform (github, cursor, claude, agent, pi)', 'github')
	.option('--force', 'Overwrite user modifications on update', false)
	.option('--no-safe', 'Disable safe update (use full nuke-and-replace)')
	.option('--no-backup', 'Skip creating a backup before overwriting files')
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

		const targetDir = path.resolve(dir);
		const isUpdate = isKitInstalled(targetDir, platform as InstallOptions['platform']);
		const existingManifest = loadManifest(targetDir, platform as InstallOptions['platform']);

		const installOptions: InstallOptions = {
			targetDir,
			platform: platform as InstallOptions['platform'],
			force: options.force,
			dryRun: globalOpts.dryRun,
			safe: options.safe !== false, // Default: true (safe)
			backup: options.backup !== false, // Default: true
		};

		const result = await installKitApi(installOptions);

		if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		// Human-readable output
		if (isRegularResult(result)) {
			const data = result.data;
			if (isUpdate) {
				console.log(`✓ Updated WordPress Agent Kit (${platform}) in ${targetDir}`);
				if (existingManifest) {
					console.log(`  Previous version: ${existingManifest.version}`);
				}
				console.log(`  Files: ${data.filesCreated.length} created/updated`);
				if (data.filesSkipped.length > 0) {
					console.log(`  Skipped: ${data.filesSkipped.length} files (user-modified, preserved)`);
				}
				if (data.conflicts && data.conflicts.length > 0) {
					console.log(`\n⚠  ${data.conflicts.length} conflict(s) detected:`);
					for (const conflict of data.conflicts) {
						console.log(`   - ${conflict}`);
					}
					console.log('   Re-run with --force to overwrite.');
				}
				if (data.backupDir) {
					console.log(`  Backup: ${data.backupDir}`);
				}
			} else {
				console.log(`✓ Installed WordPress Agent Kit (${platform}) to ${targetDir}`);
				console.log(
					`  Files: ${data.filesCreated.length} created, ${data.filesSkipped.length} skipped`
				);
			}
			console.log(`  Duration: ${data.durationMs}ms`);
		} else if (isDryRunResult(result)) {
			const summary = result.data.summary;
			if (isUpdate) {
				console.log(`✓ Dry-run update (${platform}) for ${targetDir}:`);
			} else {
				console.log(`✓ Dry-run install (${platform}) to ${targetDir}:`);
			}
			console.log(`  Would create: ${summary.filesCreated.length} files`);
			if (summary.filesSkipped && summary.filesSkipped.length > 0) {
				console.log(`  Would skip: ${summary.filesSkipped.length} files (user-modified)`);
			}
			if (summary.conflicts && summary.conflicts.length > 0) {
				console.log(`  Conflicts: ${summary.conflicts.length} files (use --force to overwrite)`);
			}
		} else {
			console.error(`✗ Installation failed: ${result.error?.message}`);
		}

		process.exit(result.success ? 0 : 1);
	});
