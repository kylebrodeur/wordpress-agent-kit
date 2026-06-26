import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { Command } from 'commander';
import {
	type CliResult,
	type DryRunResult,
	type Platform,
	type ProjectConfig,
	configureAgentsMdApi,
	installKitApi,
} from '../lib/api.js';
import { PLATFORM_FOLDERS } from '../lib/installer.js';
import {
	type TriageResult as TriageResultType,
	formatDetectionResults,
	hasConfidentDetection,
	mapProjectType,
	mapTechStack,
} from '../lib/triage-mapper.js';
import { ExitCode } from '../utils/exit-codes.js';
import { OutputFormatter, createFormatter } from '../utils/output.js';
import { PACKAGE_ROOT } from '../utils/paths.js';

const VALID_PROJECT_TYPES = ['plugin', 'theme', 'block-theme', 'site', 'blocks', 'other'] as const;
type ProjectType = (typeof VALID_PROJECT_TYPES)[number];

function isValidProjectType(type: string): type is ProjectType {
	return VALID_PROJECT_TYPES.includes(type as ProjectType);
}

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
 * Interactive/Headless setup for WordPress Agent Kit.
 * Supports both interactive prompts and --auto/--project-type/--tech-stack for headless use.
 */
export const setupCommand = new Command('setup')
	.description('Interactive or headless setup for WordPress Agent Kit')
	.argument('[dir]', 'Target directory', process.cwd())
	.option('--reset', 'Reset and overwrite existing configuration')
	.option('--platform <platform>', 'Target platform (github, cursor, claude, agent, pi)', 'github')
	.option('--auto', 'Run triage, apply detected values, skip prompts', false)
	.option('--project-type <type>', 'Project type: plugin, theme, block-theme, site, blocks, other')
	.option(
		'--tech-stack <list>',
		'Comma-separated tech: gutenberg,interactivity,rest-api,wpcli,composer,phpstan,npm,playground'
	)
	.option('--package-manager <pm>', 'Package manager: npm, pnpm, yarn')
	.option('-y, --yes', 'Accept all confirmations (requires --project-type in headless mode)')
	.action(async (dir: string, options, command) => {
		const globalOpts = command.parent?.opts() || {};
		const platform = options.platform;
		const validPlatforms: Platform[] = ['github', 'cursor', 'claude', 'agent', 'pi'];

		if (!validPlatforms.includes(platform)) {
			const formatter = createFormatter(globalOpts, 'setup', '0.0.0');
			const result = formatter.fail({
				code: 'INVALID_PLATFORM',
				message: `Invalid platform: ${platform}. Valid options: ${validPlatforms.join(', ')}`,
				exitCode: ExitCode.INVALID_ARGS,
			});
			process.exit(OutputFormatter.getExitCode(result));
		}

		const formatter = createFormatter(globalOpts, 'setup', '0.0.0');
		const targetDir = path.resolve(dir);
		const platformFolder = PLATFORM_FOLDERS[platform as Platform];
		const isHeadless = options.auto || options.projectType || globalOpts.json || globalOpts.quiet;

		// Create target directory if needed
		if (!fs.existsSync(targetDir)) {
			if (isHeadless) {
				fs.mkdirSync(targetDir, { recursive: true });
			} else {
				const shouldCreate = await p.confirm({
					message: `Target directory doesn't exist: ${targetDir}\nCreate it?`,
					initialValue: true,
				});
				if (p.isCancel(shouldCreate) || !shouldCreate) {
					const result = formatter.fail({
						code: 'CANCELLED',
						message: 'Setup cancelled.',
						exitCode: ExitCode.CANCELLED,
					});
					process.exit(OutputFormatter.getExitCode(result));
				}
				fs.mkdirSync(targetDir, { recursive: true });
			}
		}

		// Install kit if not present or --reset
		const agentsPath = path.join(targetDir, 'AGENTS.md');
		const needsInstall = options.reset || !fs.existsSync(agentsPath);

		if (needsInstall) {
			if (!isHeadless) {
				const shouldInstall = await p.confirm({
					message: 'Kit not found in target repo. Install it first?',
					initialValue: true,
				});
				if (p.isCancel(shouldInstall) || !shouldInstall) {
					const result = formatter.fail({
						code: 'CANCELLED',
						message: 'Setup cancelled.',
						exitCode: ExitCode.CANCELLED,
					});
					process.exit(OutputFormatter.getExitCode(result));
				}
			}

			const installResult = await installKitApi({
				targetDir,
				platform,
				force: options.reset,
				dryRun: globalOpts.dryRun,
			});

			if (!installResult.success) {
				process.exit(OutputFormatter.getExitCode(installResult));
			}

			if (globalOpts.json || globalOpts.quiet) {
				// Continue silently in headless mode
			} else {
				console.log('✓ Kit installed');
			}
		}

		// Run project triage
		let triageResult: TriageResultType | null = null;
		let detectedType: string | null = null;
		let detectedTech: string[] = [];
		let detectedPackageManager = 'npm/pnpm';

		const triageScriptPaths = [
			// Canonical location (AgentSkills.io convention)
			path.join(targetDir, '.agents', 'skills/wp-project-triage/scripts/detect_wp_project.mjs'),
			// Legacy platform-specific location
			path.join(
				targetDir,
				platformFolder,
				'skills/wp-project-triage/scripts/detect_wp_project.mjs'
			),
			// Source repo
			path.join(PACKAGE_ROOT, '.agents', 'skills/wp-project-triage/scripts/detect_wp_project.mjs'),
		];

		const triageScriptPath = triageScriptPaths.find((p) => fs.existsSync(p));

		if (triageScriptPath) {
			const result = spawnSync('node', [triageScriptPath], {
				cwd: targetDir,
				encoding: 'utf-8',
			});

			if (result.status === 0 && result.stdout) {
				triageResult = JSON.parse(result.stdout.trim()) as TriageResultType;
				detectedType = mapProjectType(triageResult.project?.primary ?? '');
				detectedTech = mapTechStack(triageResult);
				if (triageResult.tooling?.node?.packageManager) {
					detectedPackageManager = triageResult.tooling.node.packageManager;
				}
			}
		}

		// Determine project config
		let projectConfig: ProjectConfig;

		if (options.auto && triageResult) {
			// Auto mode: use detected values
			if (!detectedType || detectedType === 'other') {
				const result = formatter.fail({
					code: 'AUTO_DETECTION_FAILED',
					message:
						'Auto-detection could not determine project type confidently. Use --project-type explicitly.',
					exitCode: ExitCode.VALIDATION_ERROR,
				});
				process.exit(OutputFormatter.getExitCode(result));
			}
			projectConfig = {
				projectType: detectedType as ProjectType,
				techStack: detectedTech,
				packageManager: detectedPackageManager,
			};
			if (!globalOpts.json && !globalOpts.quiet) {
				console.log(`Auto-detected: ${detectedType} (${detectedTech.join(', ')})`);
			}
		} else if (options.projectType) {
			// Explicit project type provided (headless)
			if (!isValidProjectType(options.projectType)) {
				const result = formatter.fail({
					code: 'INVALID_PROJECT_TYPE',
					message: `Invalid project type: ${options.projectType}. Valid: ${VALID_PROJECT_TYPES.join(', ')}`,
					exitCode: ExitCode.INVALID_ARGS,
				});
				process.exit(OutputFormatter.getExitCode(result));
			}
			projectConfig = {
				projectType: options.projectType as ProjectType,
				techStack: options.techStack
					? options.techStack.split(',').map((s: string) => s.trim())
					: detectedTech,
				packageManager: options.packageManager || detectedPackageManager,
			};
		} else if (isHeadless) {
			// Headless without enough info
			const result = formatter.fail({
				code: 'MISSING_CONFIG',
				message:
					'Headless mode requires --project-type (and optionally --tech-stack). Use --auto for auto-detection.',
				exitCode: ExitCode.INVALID_ARGS,
			});
			process.exit(OutputFormatter.getExitCode(result));
		} else {
			// Interactive mode - prompt user
			if (!globalOpts.json && !globalOpts.quiet) {
				console.clear();
				p.intro('WordPress Agent Kit Setup');
				console.log(`Setting up kit in: ${targetDir} (platform: ${platform})`);
			}

			let useDetected = false;
			if (triageResult && hasConfidentDetection(detectedType)) {
				if (!globalOpts.json && !globalOpts.quiet) {
					p.note(formatDetectionResults(detectedType, detectedTech), 'Auto-Detection Results');
					const confirm = await p.confirm({
						message: 'Use these detected values?',
						initialValue: true,
					});
					if (p.isCancel(confirm)) process.exit(ExitCode.CANCELLED);
					useDetected = confirm;
				}
			} else if (triageResult && (detectedType || detectedTech.length > 0)) {
				if (!globalOpts.json && !globalOpts.quiet) {
					p.note(
						formatDetectionResults(detectedType, detectedTech),
						'Partial Detection (used as defaults)'
					);
				}
			}

			if (useDetected) {
				projectConfig = {
					projectType: detectedType as ProjectType,
					techStack: detectedTech,
					packageManager: detectedPackageManager,
				};
			} else {
				// Interactive prompts
				const projectTypePrompt = p.select({
					message: 'What type of WordPress project is this?',
					options: [
						{ value: 'plugin', label: 'Plugin' },
						{ value: 'theme', label: 'Theme' },
						{ value: 'block-theme', label: 'Block Theme' },
						{ value: 'site', label: 'Full Site / Multisite' },
						{ value: 'blocks', label: 'Gutenberg Blocks' },
						{ value: 'other', label: 'Other / Mixed' },
						{ value: 'unsure', label: "I'm not sure" },
					],
					initialValue: detectedType || undefined,
				});

				const techStackPrompt = p.multiselect({
					message: 'Select technologies (or skip if unsure):',
					options: [
						{
							value: 'gutenberg',
							label: 'Gutenberg Blocks',
							hint: 'block.json, @wordpress/blocks',
						},
						{ value: 'interactivity', label: 'Interactivity API', hint: 'data-wp-* directives' },
						{ value: 'rest-api', label: 'REST API', hint: 'Custom endpoints' },
						{ value: 'wpcli', label: 'WP-CLI', hint: 'Custom commands' },
						{ value: 'composer', label: 'Composer', hint: 'PHP dependencies' },
						{ value: 'npm', label: 'npm/pnpm', hint: 'JS build process' },
						{ value: 'phpstan', label: 'PHPStan', hint: 'Static analysis' },
						{ value: 'playground', label: 'WordPress Playground', hint: 'Testing/demo' },
					],
					initialValues: detectedTech.length > 0 ? detectedTech : undefined,
					required: false,
				});

				const { projectType, techStack } = await p.group(
					{ projectType: () => projectTypePrompt, techStack: () => techStackPrompt },
					{ onCancel: () => process.exit(ExitCode.CANCELLED) }
				);

				projectConfig = {
					projectType: (projectType === 'unsure' ? 'other' : projectType) as ProjectType,
					techStack,
					packageManager: detectedPackageManager,
				};
			}
		}

		// Configure AGENTS.md
		const configureResult = await configureAgentsMdApi({
			targetDir,
			platform,
			config: projectConfig,
			dryRun: globalOpts.dryRun,
		});

		if (!configureResult.success) {
			process.exit(OutputFormatter.getExitCode(configureResult));
		}

		// Success output
		if (globalOpts.json || globalOpts.quiet) {
			let modified: string[] = [];
			let skipped: string[] = [];
			if (isRegularResult(configureResult)) {
				modified = configureResult.data.modified;
				skipped = configureResult.data.skipped;
			} else if (isDryRunResult(configureResult)) {
				// Dry-run
				modified = configureResult.data.summary.modified;
				skipped = configureResult.data.summary.skipped;
			}
			const result = formatter.success({
				targetDir,
				platform,
				config: projectConfig,
				modified,
				skipped,
			});
			process.exit(OutputFormatter.getExitCode(result));
		}

		// Human output
		console.log('✓ Setup complete');
		console.log(`  Project: ${projectConfig.projectType}`);
		console.log(`  Tech stack: ${projectConfig.techStack.join(', ') || 'none'}`);
		console.log(`  Package manager: ${projectConfig.packageManager}`);
		console.log('\nNext steps:');
		console.log(`  1. Review ${path.join(targetDir, 'AGENTS.md')}`);
		console.log(`  2. Customize ${path.join(targetDir, platformFolder, 'prompts/')}`);
		console.log(
			`  3. Run triage: node ${path.join(targetDir, '.agents', 'skills/wp-project-triage/scripts/detect_wp_project.mjs')}`
		);

		process.exit(0);
	});
