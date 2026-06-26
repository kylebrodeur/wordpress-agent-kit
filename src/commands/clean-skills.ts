import { Command } from 'commander';
import { type CleanResult, type CliResult, type DryRunResult, cleanSkillsApi } from '../lib/api.js';
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

/**
 * Command to detect and remove orphaned skills from an installation.
 * Compares installed skills against the canonical set (upstream + custom).
 */
export const cleanSkillsCommand = new Command('clean-skills')
	.description('Detect and remove orphaned skills from a WordPress Agent Kit installation')
	.argument('[dir]', 'Target directory', process.cwd())
	.option('--platform <platform>', 'Platform to clean (github, cursor, claude, agent, pi)', 'pi')
	.option('--dry-run', 'Preview changes without applying (default: true)', true)
	.option('--remove', 'Actually remove orphaned skills (default: false — report only)', false)
	.option('--json', 'Output as JSON')
	.option('--quiet', 'Suppress non-essential output')
	.action(async (dir: string, options) => {
		const targetDir = dir || process.cwd();
		const platform = options.platform || 'pi';

		const result = await cleanSkillsApi({
			targetDir,
			platform,
			dryRun: !options.remove, // dry-run unless --remove is specified
			remove: options.remove,
		});

		if (options.json || options.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		if (isRegularResult<CleanResult>(result)) {
			const data = result.data;
			if (data.orphanedSkills.length === 0) {
				console.log('✓ No orphaned skills found. All skills match the canonical set.');
			} else if (data.dryRun) {
				console.log(`Found ${data.orphanedSkills.length} orphaned skill(s):`);
				for (const skill of data.orphanedSkills) {
					console.log(`  - ${skill}`);
				}
				console.log('\nRun with --remove to remove them.');
			} else {
				console.log(`✓ Removed ${data.removedSkills.length} orphaned skill(s):`);
				for (const skill of data.removedSkills) {
					console.log(`  - ${skill}`);
				}
			}
		} else if (isDryRunResult(result)) {
			const data = result.data;
			console.log(
				`Dry-run: ${data.summary.orphanedSkills.length} orphaned skill(s) would be removed:`
			);
			for (const skill of data.summary.orphanedSkills as string[]) {
				console.log(`  - ${skill}`);
			}
		} else {
			console.error(`✗ Clean failed: ${result.error?.message}`);
		}

		process.exit(result.success ? 0 : 1);
	});
