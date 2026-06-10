/**
 * Programmatic API for WordPress Agent Kit.
 * Can be imported directly by agents/scripts: `import { installKit } from 'wordpress-agent-kit/api'`
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ExitCode, withExitCode } from '../utils/exit-codes.js';
import { type CliResult, type DryRunResult, OutputFormatter } from '../utils/output.js';
import { PACKAGE_ROOT } from '../utils/paths.js';
import { type Platform, installKit } from './installer.js';
import { computeChanges, isKitInstalled } from './updater.js';

/** Result of install operation */
export interface InstallResult {
	targetDir: string;
	platform: Platform;
	filesCreated: string[];
	filesSkipped: string[];
	errors: string[];
	durationMs: number;
	isUpdate: boolean;
	backupDir: string | null;
	conflicts?: string[];
}

/** Options for installKit */
export interface InstallOptions {
	targetDir: string;
	platform: Platform;
	force?: boolean;
	dryRun?: boolean;
	/** Use safe update logic instead of full nuke-and-replace (default: true) */
	safe?: boolean;
	/** Create backup before overwriting files (default: true) */
	backup?: boolean;
}

/** Result of sync-skills operation */
export interface SyncResult {
	targetDir: string;
	skillsSynced: number;
	sourceUrl: string;
	ref: string;
	durationMs: number;
	method: 'skillpack' | 'direct-copy';
}

/** Options for syncSkills */
export interface SyncOptions {
	targetDir?: string;
	ref?: string;
	dryRun?: boolean;
}

/** Triage detection result */
export interface TriageResult {
	project: {
		primary: string;
		confidence: number;
	} | null;
	signals: {
		blockJsonFiles: string[];
		usesInteractivityApi: boolean;
		usesWpCli: boolean;
		usesRestApi: boolean;
		hasPlaygroundBlueprint: boolean;
	};
	tooling: {
		php?: { hasComposerJson: boolean; hasPhpStan: boolean };
		node?: { hasPackageJson: boolean; packageManager?: string };
	};
}

/** Options for runTriage */
export interface TriageOptions {
	targetDir: string;
	platform?: Platform;
}

/** Project configuration for setup */
export interface ProjectConfig {
	projectType: 'plugin' | 'theme' | 'block-theme' | 'site' | 'blocks' | 'other';
	techStack: string[];
	packageManager?: string;
}

/** Options for configureAgentsMd */
export interface ConfigureOptions {
	targetDir: string;
	platform: Platform;
	config: ProjectConfig;
	dryRun?: boolean;
}

/** Result of configure operation */
export interface ConfigureResult {
	targetDir: string;
	modified: string[];
	skipped: string[];
	dryRun: boolean;
}

/** Union type for results that can be either real or dry-run */
export type ApiResult<T> = CliResult<T> | CliResult<DryRunResult<T>>;

/**
 * Install the WordPress Agent Kit programmatically.
 */
export async function installKitApi(options: InstallOptions): Promise<ApiResult<InstallResult>> {
	const startTime = Date.now();
	const formatter = new OutputFormatter('json', 'install', '0.0.0');

	try {
		const {
			targetDir,
			platform,
			force = false,
			dryRun = false,
			safe = true,
			backup = true,
		} = options;

		if (dryRun) {
			return dryRunInstall(targetDir, platform, { force, safe, backup });
		}

		await withExitCode(async () => {
			installKit(targetDir, platform, { force, safe, backup });
			return { success: true };
		});

		const filesCreated = getInstalledSummary(targetDir, platform);
		const durationMs = Date.now() - startTime;

		return formatter.success({
			targetDir,
			platform,
			filesCreated,
			filesSkipped: [],
			errors: [],
			durationMs,
			isUpdate: isKitInstalled(targetDir, platform),
			backupDir: null,
		});
	} catch (error: unknown) {
		const err = error as Error & { code?: string; exitCode?: ExitCode };
		return formatter.fail({
			code: err.code || 'INSTALL_FAILED',
			message: err.message || 'Installation failed',
			exitCode: err.exitCode ?? ExitCode.ERROR,
			details: { platform: options.platform, targetDir: options.targetDir },
		});
	}
}

/**
 * Dry-run preview for install.
 */
function dryRunInstall(
	targetDir: string,
	platform: Platform,
	options: { force?: boolean; safe?: boolean; backup?: boolean }
): CliResult<DryRunResult<InstallResult>> {
	const { force = false, safe = true } = options;
	const platformFolder = getPlatformFolder(platform);
	const formatter = new OutputFormatter('json', 'install', '0.0.0');

	// Use change-computation for safe updates on existing installations
	if (safe && isKitInstalled(targetDir, platform)) {
		const changes = computeChanges(targetDir, platform, force);
		const actions: DryRunResult['actions'] = changes.map((c) => {
			const target = path.join(targetDir, platformFolder, c.relativePath);
			return {
				type: c.action === 'created' ? 'create' : c.action === 'updated' ? 'update' : 'skip',
				target,
				description: `${c.action}: ${c.relativePath}${c.reason ? ` (${c.reason})` : ''}`,
			};
		});

		// AGENTS.md check
		const targetAgents = path.join(targetDir, 'AGENTS.md');
		if (!fs.existsSync(targetAgents)) {
			actions.push({
				type: 'create',
				target: targetAgents,
				description: 'Create AGENTS.md from template',
			});
		} else {
			actions.push({
				type: 'skip',
				target: targetAgents,
				description: 'AGENTS.md exists (preserved)',
			});
		}

		return formatter.success({
			wouldExecute: true,
			actions,
			summary: {
				targetDir,
				platform,
				filesCreated: changes
					.filter((c) => c.action === 'created')
					.map((c) => path.join(platformFolder, c.relativePath)),
				filesSkipped: changes
					.filter((c) => c.action === 'skipped' || c.action === 'conflict')
					.map((c) => `${path.join(platformFolder, c.relativePath)} (${c.reason})`),
				errors: [],
				durationMs: 0,
				isUpdate: true,
				backupDir: null,
				conflicts: changes
					.filter((c) => c.action === 'conflict')
					.map((c) => path.join(platformFolder, c.relativePath)),
			},
		});
	}

	// Legacy dry-run for fresh installs
	const actions: DryRunResult['actions'] = [];
	const sourceGithub = path.join(PACKAGE_ROOT, '.github');
	const targetPlatform = path.join(targetDir, platformFolder);
	const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
	const targetAgentsTemplate = path.join(targetDir, 'AGENTS.template.md');
	const targetAgents = path.join(targetDir, 'AGENTS.md');

	if (fs.existsSync(sourceGithub)) {
		if (fs.existsSync(targetPlatform) && !force) {
			actions.push({
				type: 'update',
				target: targetPlatform,
				description: `Would update ${platformFolder} (use --force to overwrite)`,
			});
		} else {
			actions.push({
				type: 'copy',
				source: sourceGithub,
				target: targetPlatform,
				description: `Copy ${platformFolder} from kit`,
			});
		}
	}

	if (fs.existsSync(templatePath)) {
		actions.push({
			type: 'copy',
			source: templatePath,
			target: targetAgentsTemplate,
			description: 'Copy AGENTS.template.md',
		});
	}

	if (!fs.existsSync(targetAgents) || force) {
		if (fs.existsSync(templatePath)) {
			actions.push({
				type: 'copy',
				source: templatePath,
				target: targetAgents,
				description: 'Create AGENTS.md from template',
			});
		}
	} else {
		actions.push({
			type: 'update',
			target: targetAgents,
			description: 'AGENTS.md exists (use --force to overwrite)',
		});
	}

	return formatter.success({
		wouldExecute: true,
		actions,
		summary: {
			targetDir,
			platform,
			filesCreated: actions.filter((a) => a.type === 'copy').map((a) => a.target),
			filesSkipped: actions.filter((a) => a.type === 'update').map((a) => a.target),
			errors: [],
			durationMs: 0,
			isUpdate: false,
			backupDir: null,
		},
	});
}

/**
 * Sync skills from WordPress/agent-skills programmatically.
 */
export async function syncSkillsApi(options: SyncOptions = {}): Promise<ApiResult<SyncResult>> {
	const startTime = Date.now();
	const formatter = new OutputFormatter('json', 'sync-skills', '0.0.0');
	const targetDir = options.targetDir || process.cwd();
	const ref = options.ref || 'trunk';

	if (options.dryRun) {
		return dryRunSyncSkills(targetDir, ref);
	}

	try {
		const result = await withExitCode(async () => {
			const repoRoot = targetDir;
			const submodulePath = path.join('vendor', 'wp-agent-skills');
			const vendorSkillsDir = path.join(repoRoot, submodulePath);
			const submoduleGitDir = path.join(vendorSkillsDir, '.git');

			// Clone or update
			if (!fs.existsSync(submoduleGitDir)) {
				fs.mkdirSync(path.join(repoRoot, 'vendor'), { recursive: true });
				const cloneResult = spawnSync(
					'git',
					['clone', 'https://github.com/WordPress/agent-skills.git', submodulePath],
					{
						cwd: repoRoot,
						encoding: 'utf-8',
					}
				);
				if (cloneResult.status !== 0) {
					throw new Error(`Git clone failed: ${cloneResult.stderr?.toString()}`);
				}
			} else {
				const fetchResult = spawnSync('git', ['fetch', '--all', '--tags'], {
					cwd: vendorSkillsDir,
					encoding: 'utf-8',
				});
				if (fetchResult.status !== 0) {
					throw new Error(`Git fetch failed: ${fetchResult.stderr?.toString()}`);
				}
			}

			// Checkout ref
			const checkoutResult = spawnSync('git', ['checkout', ref], {
				cwd: vendorSkillsDir,
				encoding: 'utf-8',
			});
			if (checkoutResult.status !== 0) {
				throw new Error(`Git checkout failed: ${checkoutResult.stderr?.toString()}`);
			}

			const pullResult = spawnSync('git', ['pull', 'origin', ref], {
				cwd: vendorSkillsDir,
				encoding: 'utf-8',
			});
			if (pullResult.status !== 0) {
				throw new Error(`Git pull failed: ${pullResult.stderr?.toString()}`);
			}

			const targetSkills = path.join(repoRoot, '.github', 'skills');
			const upstreamBuildScript = path.join(
				vendorSkillsDir,
				'shared',
				'scripts',
				'skillpack-build.mjs'
			);
			const upstreamInstallScript = path.join(
				vendorSkillsDir,
				'shared',
				'scripts',
				'skillpack-install.mjs'
			);

			let method: 'skillpack' | 'direct-copy' = 'direct-copy';
			let skillsSynced = 0;

			if (fs.existsSync(upstreamBuildScript) && fs.existsSync(upstreamInstallScript)) {
				if (fs.existsSync(targetSkills)) {
					fs.rmSync(targetSkills, { recursive: true, force: true });
				}
				fs.mkdirSync(path.join(repoRoot, '.github'), { recursive: true });

				const buildResult = spawnSync(
					'node',
					['shared/scripts/skillpack-build.mjs', '--clean', '--targets=vscode'],
					{
						cwd: vendorSkillsDir,
						encoding: 'utf-8',
					}
				);
				if (buildResult.status !== 0) {
					throw new Error(`Skillpack build failed: ${buildResult.stderr?.toString()}`);
				}

				const installResult = spawnSync(
					'node',
					[
						'shared/scripts/skillpack-install.mjs',
						`--dest=${repoRoot}`,
						'--targets=vscode',
						'--from=dist',
						'--mode=replace',
					],
					{ cwd: vendorSkillsDir, encoding: 'utf-8' }
				);
				if (installResult.status !== 0) {
					throw new Error(`Skillpack install failed: ${installResult.stderr?.toString()}`);
				}

				method = 'skillpack';
				if (fs.existsSync(targetSkills)) {
					skillsSynced = fs.readdirSync(targetSkills).length;
				}
			} else {
				const sourceSkills = path.join(vendorSkillsDir, '.github', 'skills');
				if (!fs.existsSync(sourceSkills)) {
					throw new Error(`Upstream skills not found at ${sourceSkills}`);
				}
				if (fs.existsSync(targetSkills)) {
					fs.rmSync(targetSkills, { recursive: true, force: true });
				}
				fs.mkdirSync(path.join(repoRoot, '.github'), { recursive: true });
				fs.cpSync(sourceSkills, targetSkills, { recursive: true });
				skillsSynced = fs.readdirSync(targetSkills).length;
			}

			return { success: true, skillsSynced, method };
		});

		return formatter.success({
			targetDir,
			skillsSynced: result.skillsSynced,
			sourceUrl: 'https://github.com/WordPress/agent-skills.git',
			ref,
			durationMs: Date.now() - startTime,
			method: result.method,
		});
	} catch (error: unknown) {
		const err = error as Error & { code?: string; exitCode?: ExitCode };
		return formatter.fail({
			code: err.code || 'SYNC_FAILED',
			message: err.message || 'Sync failed',
			exitCode: err.exitCode ?? ExitCode.ERROR,
			details: { ref, targetDir },
		});
	}
}

/**
 * Dry-run preview for sync-skills.
 */
function dryRunSyncSkills(targetDir: string, ref: string): CliResult<DryRunResult<SyncResult>> {
	const actions: DryRunResult['actions'] = [];
	const targetSkills = path.join(targetDir, '.github', 'skills');
	const vendorDir = path.join(targetDir, 'vendor', 'wp-agent-skills');

	actions.push({
		type: 'mkdir',
		target: path.join(targetDir, 'vendor'),
		description: 'Create vendor directory',
	});

	if (!fs.existsSync(vendorDir)) {
		actions.push({
			type: 'create',
			target: vendorDir,
			description: 'Clone WordPress/agent-skills repository',
		});
	} else {
		actions.push({
			type: 'update',
			target: vendorDir,
			description: `Fetch and checkout ${ref}`,
		});
	}

	if (fs.existsSync(targetSkills)) {
		actions.push({
			type: 'delete',
			target: targetSkills,
			description: 'Remove existing skills directory',
		});
	}

	actions.push({
		type: 'create',
		target: targetSkills,
		description: 'Install synced skills',
	});

	return new OutputFormatter('json', 'sync-skills', '0.0.0').success({
		wouldExecute: true,
		actions,
		summary: {
			targetDir,
			skillsSynced: 0,
			sourceUrl: 'https://github.com/WordPress/agent-skills.git',
			ref,
			durationMs: 0,
			method: 'skillpack',
		},
	});
}

/**
 * Run project triage detection programmatically.
 */
export async function runTriageApi(options: TriageOptions): Promise<CliResult<TriageResult>> {
	const formatter = new OutputFormatter('json', 'triage', '0.0.0');
	const { targetDir, platform = 'github' } = options;

	try {
		const platformFolder = getPlatformFolder(platform);
		const triageScriptPaths = [
			path.join(
				targetDir,
				platformFolder,
				'skills/wp-project-triage/scripts/detect_wp_project.mjs'
			),
			path.join(
				PACKAGE_ROOT,
				'vendor/wp-agent-skills/skills/wp-project-triage/scripts/detect_wp_project.mjs'
			),
		];

		const triageScriptPath = triageScriptPaths.find((p) => fs.existsSync(p));

		if (!triageScriptPath) {
			return formatter.fail({
				code: 'TRIAGE_NOT_FOUND',
				message: 'Project triage script not found. Run sync-skills first.',
				exitCode: ExitCode.NOT_FOUND,
			});
		}

		const result = spawnSync('node', [triageScriptPath], {
			cwd: targetDir,
			encoding: 'utf-8',
		});

		if (result.status !== 0) {
			return formatter.fail({
				code: 'TRIAGE_FAILED',
				message: result.stderr?.toString() || 'Triage script failed',
				exitCode: ExitCode.ERROR,
			});
		}

		const triageResult = JSON.parse(result.stdout.trim());
		return formatter.success(triageResult as TriageResult);
	} catch (error: unknown) {
		const err = error as Error;
		return formatter.fail({
			code: 'TRIAGE_ERROR',
			message: err.message || 'Triage failed',
			exitCode: ExitCode.ERROR,
		});
	}
}

/**
 * Configure AGENTS.md with project details programmatically.
 */
export async function configureAgentsMdApi(
	options: ConfigureOptions
): Promise<ApiResult<ConfigureResult>> {
	const formatter = new OutputFormatter('json', 'configure', '0.0.0');
	const { targetDir, platform, config, dryRun = false } = options;

	try {
		const platformFolder = getPlatformFolder(platform);
		const agentsPath = path.join(targetDir, 'AGENTS.md');
		const platformInstructionsPath = path.join(
			targetDir,
			platformFolder,
			'instructions',
			'wordpress-workflow.instructions.md'
		);

		if (dryRun) {
			const actions: DryRunResult['actions'] = [];
			if (fs.existsSync(agentsPath)) {
				actions.push({
					type: 'update',
					target: agentsPath,
					description: `Update AGENTS.md with project type: ${config.projectType}, tech: ${config.techStack.join(', ')}`,
				});
			} else {
				actions.push({
					type: 'create',
					target: agentsPath,
					description: 'Create AGENTS.md with project configuration',
				});
			}
			if (fs.existsSync(platformInstructionsPath)) {
				actions.push({
					type: 'update',
					target: platformInstructionsPath,
					description: 'Workflow instructions available for customization',
				});
			}
			return formatter.success({
				wouldExecute: true,
				actions,
				summary: {
					targetDir,
					modified: [agentsPath],
					skipped: [],
					dryRun: true,
				},
			});
		}

		const modified: string[] = [];
		const skipped: string[] = [];

		// Update AGENTS.md
		if (fs.existsSync(agentsPath)) {
			let agentsContent = fs.readFileSync(agentsPath, 'utf-8');
			const pm = config.packageManager || 'npm/pnpm';

			agentsContent = agentsContent.replace(
				/\*\*Tooling\*\*: .*/,
				`**Tooling**: ${config.techStack.includes('composer') ? 'Composer for PHP' : ''}${config.techStack.includes('npm') ? `, ${pm} for JS` : ''}.`
			);

			fs.writeFileSync(agentsPath, agentsContent, 'utf-8');
			modified.push(agentsPath);
		} else {
			skipped.push(agentsPath);
		}

		// Note workflow instructions
		if (fs.existsSync(platformInstructionsPath)) {
			modified.push(platformInstructionsPath);
		} else {
			skipped.push(platformInstructionsPath);
		}

		return formatter.success({
			targetDir,
			modified,
			skipped,
			dryRun: false,
		});
	} catch (error: unknown) {
		const err = error as Error;
		return formatter.fail({
			code: 'CONFIGURE_FAILED',
			message: err.message || 'Configuration failed',
			exitCode: ExitCode.ERROR,
		});
	}
}

/**
 * Get platform folder name.
 */
function getPlatformFolder(platform: Platform): string {
	const folders: Record<Platform, string> = {
		github: '.github',
		cursor: '.cursor',
		claude: '.claude',
		agent: '.agent',
		pi: '.pi/agent',
	};
	return folders[platform];
}

/**
 * Get summary of installed files grouped by directory.
 */
function getInstalledSummary(targetDir: string, platform: Platform): string[] {
	const platformFolder = getPlatformFolder(platform);
	const summary: string[] = [];
	const targetPlatform = path.join(targetDir, platformFolder);

	if (fs.existsSync(targetPlatform)) {
		// Walk top-level entries for clean summary
		const topEntries = fs.readdirSync(targetPlatform);
		for (const entry of topEntries) {
			const fullPath = path.join(targetPlatform, entry);
			const stat = fs.statSync(fullPath);
			if (stat.isDirectory()) {
				let totalFiles = 0;
				let totalDirs = 0;
				function countAll(dir: string): void {
					const items = fs.readdirSync(dir);
					for (const item of items) {
						const itemPath = path.join(dir, item);
						const s = fs.statSync(itemPath);
						if (s.isDirectory()) {
							totalDirs++;
							countAll(itemPath);
						} else {
							totalFiles++;
						}
					}
				}
				countAll(fullPath);
				summary.push(`${platformFolder}/${entry}/ (${totalDirs + 1} dirs, ${totalFiles} files)`);
			}
		}
	}

	const agentsPath = path.join(targetDir, 'AGENTS.md');
	if (fs.existsSync(agentsPath)) {
		summary.push('AGENTS.md');
	}

	const agentsTemplatePath = path.join(targetDir, 'AGENTS.template.md');
	if (fs.existsSync(agentsTemplatePath)) {
		summary.push('AGENTS.template.md');
	}

	return summary;
}

/** Re-export types */
export type { Platform } from './installer.js';
export type { FileChange, UpdateOptions, UpdateResult } from './updater.js';
export type { CliResult, DryRunResult, OutputFormat, ProgressEvent } from '../utils/output.js';
export { ExitCode } from '../utils/exit-codes.js';
export { OutputFormatter, createFormatter, parseOutputFormat } from '../utils/output.js';
export { computeChanges, isKitInstalled, loadManifest, updateKit } from './updater.js';
