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
import {
	CUSTOM_SKILL_NAMES,
	type SkillsInstallOptions,
	type SkillsResult,
	type SkillsUpdateOptions,
	UPSTREAM_SKILL_NAMES,
	installSkills,
	updateSkills,
} from './skills-lifecycle.js';
import { computeChanges, isKitInstalled } from './updater.js';

/** Result of clean-skills operation */
export interface CleanResult {
	targetDir: string;
	platform: Platform;
	orphanedSkills: string[];
	removedSkills: string[];
	legacySkillDirs: string[];
	migratedSkills: string[];
	dryRun: boolean;
}

/** Options for cleanSkillsApi */
export interface CleanOptions {
	targetDir: string;
	platform: Platform;
	/** Only report orphans without removing them (default: false) */
	dryRun?: boolean;
	/** Remove orphaned skills (default: false — report only unless true) */
	remove?: boolean;
}

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

/** Result of a skills install/update operation */
export interface SkillsApiResult {
	targetDir: string;
	customSkills: string[];
	upstreamSuccess: boolean;
	upstreamCommand?: string;
	upstreamError?: string;
	warnings: string[];
	durationMs: number;
	dryRun: boolean;
}

/** Options for installSkillsApi */
export interface InstallSkillsOptions {
	targetDir: string;
	dryRun?: boolean;
	force?: boolean;
	agent?: string;
	projectDir?: string;
	global?: boolean;
}

/** Options for updateSkillsApi */
export interface UpdateSkillsOptions {
	targetDir: string;
	dryRun?: boolean;
	force?: boolean;
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
 * Install skills programmatically.
 * Copies our nine vendored custom skills, then fetches upstream skills via `npx skills`.
 */
export async function installSkillsApi(
	options: InstallSkillsOptions
): Promise<ApiResult<SkillsApiResult>> {
	const startTime = Date.now();
	const formatter = new OutputFormatter('json', 'skills-install', '0.0.0');

	try {
		if (options.dryRun) {
			const plan = installSkills(options.targetDir, { dryRun: true });
			const actions: DryRunResult<SkillsApiResult>['actions'] = [
				{
					type: 'copy',
					source: path.join(PACKAGE_ROOT, 'skills'),
					target: path.join(plan.targetDir, '.agents', 'skills'),
					description: `Copy ${plan.customSkills.length} custom skills`,
				},
				{
					type: 'create',
					target: plan.targetDir,
					description: plan.upstreamCommand || 'Install upstream skills',
				},
			];
			return formatter.success<DryRunResult<SkillsApiResult>>({
				wouldExecute: true,
				actions,
				summary: plan as SkillsApiResult,
			});
		}

		const result = installSkills(options.targetDir, options);

		return formatter.success({
			targetDir: result.targetDir,
			customSkills: result.customSkills,
			upstreamSuccess: result.upstreamSuccess,
			upstreamCommand: result.upstreamCommand,
			upstreamError: result.upstreamError,
			warnings: result.warnings,
			durationMs: Date.now() - startTime,
			dryRun: false,
		});
	} catch (error: unknown) {
		const err = error as Error & { code?: string; exitCode?: ExitCode };
		return formatter.fail({
			code: err.code || 'SKILLS_INSTALL_FAILED',
			message: err.message || 'Skills install failed',
			exitCode: err.exitCode ?? ExitCode.ERROR,
			details: { targetDir: options.targetDir },
		});
	}
}

/**
 * Update skills programmatically.
 * Re-copies our nine vendored custom skills and runs `npx skills update`.
 */
export async function updateSkillsApi(
	options: UpdateSkillsOptions
): Promise<ApiResult<SkillsApiResult>> {
	const startTime = Date.now();
	const formatter = new OutputFormatter('json', 'skills-update', '0.0.0');

	try {
		if (options.dryRun) {
			const plan = updateSkills(options.targetDir, { dryRun: true });
			const actions: DryRunResult<SkillsApiResult>['actions'] = [
				{
					type: 'copy',
					source: path.join(PACKAGE_ROOT, 'skills'),
					target: path.join(plan.targetDir, '.agents', 'skills'),
					description: `Update ${plan.customSkills.length} custom skills`,
				},
				{
					type: 'update',
					target: plan.targetDir,
					description: plan.upstreamCommand || 'Update upstream skills',
				},
			];
			return formatter.success<DryRunResult<SkillsApiResult>>({
				wouldExecute: true,
				actions,
				summary: plan as SkillsApiResult,
			});
		}

		const result = updateSkills(options.targetDir, options);

		return formatter.success({
			targetDir: result.targetDir,
			customSkills: result.customSkills,
			upstreamSuccess: result.upstreamSuccess,
			upstreamCommand: result.upstreamCommand,
			upstreamError: result.upstreamError,
			warnings: result.warnings,
			durationMs: Date.now() - startTime,
			dryRun: false,
		});
	} catch (error: unknown) {
		const err = error as Error & { code?: string; exitCode?: ExitCode };
		return formatter.fail({
			code: err.code || 'SKILLS_UPDATE_FAILED',
			message: err.message || 'Skills update failed',
			exitCode: err.exitCode ?? ExitCode.ERROR,
			details: { targetDir: options.targetDir },
		});
	}
}

/**
 * Run project triage detection programmatically.
 */
export async function runTriageApi(options: TriageOptions): Promise<CliResult<TriageResult>> {
	const formatter = new OutputFormatter('json', 'triage', '0.0.0');
	const { targetDir, platform = 'github' } = options;

	try {
		const triageScriptPaths = [
			// Canonical location (AgentSkills.io convention)
			path.join(targetDir, '.agents', 'skills/wp-project-triage/scripts/detect_wp_project.mjs'),
			// Legacy platform-specific location
			path.join(
				targetDir,
				getPlatformFolder(platform),
				'skills/wp-project-triage/scripts/detect_wp_project.mjs'
			),
			// Source repo
			path.join(PACKAGE_ROOT, '.agents', 'skills/wp-project-triage/scripts/detect_wp_project.mjs'),
			path.join(
				PACKAGE_ROOT,
				'vendor/wp-agent-skills/skills/wp-project-triage/scripts/detect_wp_project.mjs'
			),
		];
		const triageScriptPath = triageScriptPaths.find((p) => fs.existsSync(p));

		if (!triageScriptPath) {
			return formatter.fail({
				code: 'TRIAGE_NOT_FOUND',
				message: 'Project triage script not found. Run `wp-agent-kit skills install` first.',
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

/**
 * Detect and optionally remove orphaned skills from a target installation.
 * Compares the skills in the target platform directory against the source kit
 * (upstream .agents/skills + skills-custom/) and identifies skills that exist
 * in the target but not in the source.
 */
export async function cleanSkillsApi(options: CleanOptions): Promise<ApiResult<CleanResult>> {
	const startTime = Date.now();
	const formatter = new OutputFormatter('json', 'clean-skills', '0.0.0');
	const { targetDir, platform, dryRun = false, remove = false } = options;

	try {
		// Canonical skills = our nine vendored custom skills (top-level skills/)
		// plus the static list of upstream skills installed via `npx skills`.
		const customSkillsDir = path.join(PACKAGE_ROOT, 'skills');
		const targetSkillsDir = path.join(targetDir, '.agents', 'skills');

		// Build set of canonical skill names (upstream + custom)
		const canonicalSkills = new Set<string>([...UPSTREAM_SKILL_NAMES]);

		if (fs.existsSync(customSkillsDir)) {
			for (const entry of fs.readdirSync(customSkillsDir)) {
				const entryPath = path.join(customSkillsDir, entry);
				if (fs.statSync(entryPath).isDirectory()) {
					canonicalSkills.add(entry);
				}
			}
		}

		// Find orphaned skills in target .agents/skills/
		const orphanedSkills: string[] = [];
		if (fs.existsSync(targetSkillsDir)) {
			for (const entry of fs.readdirSync(targetSkillsDir)) {
				const entryPath = path.join(targetSkillsDir, entry);
				if (fs.statSync(entryPath).isDirectory() && !canonicalSkills.has(entry)) {
					orphanedSkills.push(entry);
				}
			}
		}

		// Detect legacy skill directories (platform-specific skills/ dirs)
		const platformFolder = getPlatformFolder(platform);
		const legacySkillsDir = path.join(targetDir, platformFolder, 'skills');
		const legacySkillDirs: string[] = [];
		if (fs.existsSync(legacySkillsDir)) {
			legacySkillDirs.push(legacySkillsDir);
		}
		// Also check .github/skills for github platform (common legacy location)
		if (platform !== 'github') {
			const githubSkills = path.join(targetDir, '.github', 'skills');
			if (fs.existsSync(githubSkills)) {
				legacySkillDirs.push(githubSkills);
			}
		}

		// Migrate legacy skills to .agents/skills/ and remove legacy dirs
		const migratedSkills: string[] = [];
		if (remove && !dryRun && legacySkillDirs.length > 0) {
			for (const legacyDir of legacySkillDirs) {
				for (const entry of fs.readdirSync(legacyDir)) {
					const entryPath = path.join(legacyDir, entry);
					if (!fs.statSync(entryPath).isDirectory()) continue;
					const destPath = path.join(targetSkillsDir, entry);
					if (!fs.existsSync(destPath)) {
						fs.mkdirSync(path.dirname(destPath), { recursive: true });
						fs.cpSync(entryPath, destPath, { recursive: true });
						migratedSkills.push(entry);
					}
				}
				// Remove the legacy skills directory
				fs.rmSync(legacyDir, { recursive: true, force: true });
			}
		}

		// Remove orphans if requested
		const removedSkills: string[] = [];
		if (remove && !dryRun) {
			for (const orphan of orphanedSkills) {
				const orphanPath = path.join(targetSkillsDir, orphan);
				fs.rmSync(orphanPath, { recursive: true, force: true });
				removedSkills.push(orphan);
			}
		}

		const _durationMs = Date.now() - startTime;

		if (dryRun) {
			const actions: DryRunResult['actions'] = orphanedSkills.map((s) => ({
				type: 'delete' as const,
				target: path.join('.agents', 'skills', s),
				description: `Remove orphaned skill: ${s}`,
			}));
			for (const legacyDir of legacySkillDirs) {
				actions.push({
					type: 'delete' as const,
					target: legacyDir,
					description: `Migrate and remove legacy skill directory: ${path.relative(targetDir, legacyDir)}`,
				});
			}
			return formatter.success({
				wouldExecute: true,
				actions,
				summary: {
					targetDir,
					platform,
					orphanedSkills,
					removedSkills: [],
					legacySkillDirs,
					migratedSkills: [],
					dryRun: true,
				},
			});
		}

		return formatter.success({
			targetDir,
			platform,
			orphanedSkills,
			removedSkills,
			legacySkillDirs,
			migratedSkills,
			dryRun: false,
		});
	} catch (error: unknown) {
		const err = error as Error & { code?: string; exitCode?: ExitCode };
		return formatter.fail({
			code: err.code || 'CLEAN_FAILED',
			message: err.message || 'Clean failed',
			exitCode: err.exitCode ?? ExitCode.ERROR,
			details: { platform, targetDir },
		});
	}
}

/** Re-export types */
export type { Platform } from './installer.js';
export type { FileChange, UpdateOptions, UpdateResult } from './updater.js';
export type { CliResult, DryRunResult, OutputFormat, ProgressEvent } from '../utils/output.js';
export { ExitCode } from '../utils/exit-codes.js';
export { OutputFormatter, createFormatter, parseOutputFormat } from '../utils/output.js';
export { computeChanges, isKitInstalled, loadManifest, updateKit } from './updater.js';

/** Bootstrap API */
export type { BootstrapOptions, BootstrapResult } from './bootstrap.js';
export { bootstrapApi } from './bootstrap.js';
