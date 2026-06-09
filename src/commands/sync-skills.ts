import { Command } from 'commander';
import { type CliResult, type DryRunResult, type SyncResult, syncSkillsApi } from '../lib/api.js';
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
 * Command to sync skills from the official WordPress agent-skills repository.
 * Supports --json, --ndjson, --dry-run flags.
 */
export const syncSkillsCommand = new Command('sync-skills')
	.description('Sync skills from the official WordPress/agent-skills repository')
	.argument('[ref]', 'Branch or tag to checkout', 'trunk')
	.option('--ref <ref>', 'Branch or tag to checkout (alias for argument)')
	.action(async (refArg, options, command) => {
		const globalOpts = command.parent?.opts() || {};
		const ref = options.ref || refArg;
		const _formatter = createFormatter(globalOpts, 'sync-skills', '0.0.0');

		const result = await syncSkillsApi({
			targetDir: process.cwd(),
			ref,
			dryRun: globalOpts.dryRun,
		});

		if (globalOpts.json || globalOpts.ndjson || globalOpts.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		if (isRegularResult(result)) {
			const data = result.data;
			console.log(`✓ Synced ${data.skillsSynced} skills from WordPress/agent-skills@${ref}`);
			console.log(`  Method: ${data.method}`);
			console.log(`  Duration: ${data.durationMs}ms`);
		} else if (isDryRunResult(result)) {
			// Dry-run result
			console.log(`✓ Dry-run: ${result.data.summary.skillsSynced} skills would be synced`);
		} else {
			console.error(`✗ Sync failed: ${result.error?.message}`);
		}

		process.exit(result.success ? 0 : 1);
	});
