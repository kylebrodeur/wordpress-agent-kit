import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { type CliResult, type DryRunResult, type Platform, installKitApi } from '../lib/api.js';
import { PLATFORM_FOLDERS } from '../lib/installer.js';
import { ExitCode } from '../utils/exit-codes.js';
import { OutputFormatter, createFormatter } from '../utils/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

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

/** Current package version */
const CURRENT_VERSION = (() => {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
		return pkg.version;
	} catch {
		return '0.0.0';
	}
})();

/** Version detection from installed kit */
function detectInstalledVersion(targetDir: string): string | null {
	// Check AGENTS.md for version marker
	const agentsPath = path.join(targetDir, 'AGENTS.md');
	if (fs.existsSync(agentsPath)) {
		const content = fs.readFileSync(agentsPath, 'utf-8');
		const match = content.match(/wp-agent-kit[:\s]+v?(\d+\.\d+\.\d+)/i);
		if (match) return match[1];
	}
	// Check package.json if exists in target
	const pkgPath = path.join(targetDir, 'package.json');
	if (fs.existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
			if (pkg.devDependencies?.['wordpress-agent-kit']) {
				return pkg.devDependencies['wordpress-agent-kit'].replace(/^[\^~]/, '');
			}
		} catch {
			// ignore
		}
	}
	return null;
}

/** Detect which platforms are installed */
function detectInstalledPlatforms(targetDir: string): Platform[] {
	const platforms: Platform[] = ['github', 'cursor', 'claude', 'agent', 'pi'];
	return platforms.filter((p) => fs.existsSync(path.join(targetDir, PLATFORM_FOLDERS[p])));
}

/** Compare semantic versions */
function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) return pa[i] - pb[i];
	}
	return 0;
}

/** Upgrade command */
export const upgradeCommand = new Command('upgrade')
	.description('Upgrade existing WordPress Agent Kit installation to latest version')
	.argument('[dir]', 'Target directory', process.cwd())
	.option(
		'--platform <platform>',
		'Specific platform to upgrade (github, cursor, claude, agent, pi, all)',
		'all'
	)
	.option('--force', 'Overwrite local modifications', false)
	.option('--check-only', 'Only check for updates, do not apply', false)
	.option('--from-version <version>', 'Override detected current version')
	.action(async (dir: string, options, command) => {
		const globalOpts = command.parent?.opts() || {};
		const targetDir = path.resolve(dir);
		const formatter = createFormatter(globalOpts, 'upgrade', CURRENT_VERSION);

		if (!fs.existsSync(targetDir)) {
			const result = formatter.fail({
				code: 'NOT_FOUND',
				message: `Target directory does not exist: ${targetDir}`,
				exitCode: ExitCode.NOT_FOUND,
			});
			process.exit(OutputFormatter.getExitCode(result));
		}

		// Detect installed platforms
		const platformsToCheck =
			options.platform === 'all'
				? detectInstalledPlatforms(targetDir)
				: [options.platform as Platform];

		if (platformsToCheck.length === 0) {
			const result = formatter.fail({
				code: 'NOT_INSTALLED',
				message: `No WordPress Agent Kit installation found in ${targetDir}`,
				exitCode: ExitCode.NOT_FOUND,
			});
			process.exit(OutputFormatter.getExitCode(result));
		}

		// Detect or override version
		let currentVersion = options.fromVersion;
		if (!currentVersion) {
			currentVersion = detectInstalledVersion(targetDir);
		}
		currentVersion = currentVersion || 'unknown';

		const hasUpdate =
			currentVersion !== 'unknown' && compareVersions(CURRENT_VERSION, currentVersion) > 0;

		const upgradeInfo = {
			targetDir,
			currentVersion,
			latestVersion: CURRENT_VERSION,
			hasUpdate,
			platforms: platformsToCheck,
			checkOnly: options.checkOnly,
		};

		if (globalOpts.json || globalOpts.quiet) {
			const result = formatter.success(upgradeInfo);
			process.exit(OutputFormatter.getExitCode(result));
		}

		// Human output
		console.log('WordPress Agent Kit Upgrade Check');
		console.log(`  Target: ${targetDir}`);
		console.log(`  Current: ${currentVersion}`);
		console.log(`  Latest:  ${CURRENT_VERSION}`);
		console.log(`  Platforms: ${platformsToCheck.join(', ')}`);

		if (!hasUpdate && currentVersion !== 'unknown') {
			console.log('\n✓ Already up to date');
			process.exit(0);
		}

		if (currentVersion === 'unknown') {
			console.log('\n⚠ Could not detect current version');
		} else {
			console.log('\n✓ Update available');
		}

		if (options.checkOnly) {
			console.log('\nDry run (--check-only): no changes made');
			process.exit(0);
		}

		// Confirm upgrade in interactive mode
		if (!globalOpts.json && !globalOpts.quiet) {
			if (!options.force) {
				console.log('\nUse --force to apply upgrade, or --check-only to preview');
				process.exit(0);
			}
		}

		// Perform upgrade for each platform
		const results = [];
		for (const platform of platformsToCheck) {
			const installResult = await installKitApi({
				targetDir,
				platform,
				force: options.force,
				dryRun: globalOpts.dryRun,
			});
			results.push({ platform, ...installResult });
		}

		const successCount = results.filter((r) => r.success).length;
		const totalFiles = results.reduce((sum, r) => {
			if (!r.success) return sum;
			if (isRegularResult(r)) {
				return sum + (r.data.filesCreated.length || 0);
			}
			if (isDryRunResult(r)) {
				// Dry-run - summary has filesCreated
				return sum + (r.data.summary.filesCreated.length || 0);
			}
			return sum;
		}, 0);

		console.log(`\n✓ Upgraded ${successCount}/${results.length} platform(s)`);
		console.log(`  Files updated: ${totalFiles}`);
		console.log(`  Version: ${currentVersion} → ${CURRENT_VERSION}`);

		const failed = results.filter((r) => !r.success);
		if (failed.length > 0) {
			console.error('\nFailures:');
			for (const f of failed) {
				console.error(`  ${f.platform}: ${f.error?.message}`);
			}
			process.exit(1);
		}

		process.exit(0);
	});
