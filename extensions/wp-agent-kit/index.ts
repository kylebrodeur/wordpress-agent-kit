/**
 * WordPress Agent Kit Pi Extension
 *
 * Provides Pi agents with WordPress development tools:
 * - WordPress agent skills (13 skills covering plugin/theme/block dev, REST API, WP-CLI, etc.)
 * - Project triage detection
 * - Skill installation and syncing
 * - Version upgrade management
 *
 * Compatible with Pi Coding Agent SDK (extensions.md spec).
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

// Import programmatic API for WordPress Agent Kit operations
import {
	type InstallOptions,
	type SyncOptions,
	type TriageOptions,
	computeChanges,
	installKitApi,
	isKitInstalled,
	loadManifest,
	runTriageApi,
	syncSkillsApi,
} from '../../dist/lib/api.js';

export default function (pi: ExtensionAPI) {
	// =========================================================================
	// Skills Registration
	// =========================================================================
	// Register WordPress skills via resources_discover so Pi agents can use them.
	// Skills are loaded from .github/skills/ (also declared in package.json pi.skills).
	pi.on('resources_discover', async (_event, _ctx) => {
		// Skills are auto-discovered from pi.skills in package.json.
		// No additional configuration needed here — the manifest handles it.
		return {};
	});

	// =========================================================================
	// Session notifications
	// =========================================================================
	pi.on('session_start', async (_event, ctx) => {
		const cwd = ctx.cwd;
		if (isKitInstalled(cwd, 'github')) {
			const manifest = loadManifest(cwd, 'github');
			if (manifest) {
				ctx.ui.setStatus('wp-agent-kit', `WP Agent Kit v${manifest.version}`);
			}
		}
	});

	// =========================================================================
	// Custom Tools
	// =========================================================================

	// --- wp_triage ---
	// Run WordPress project triage to detect project type, signals, and tooling.
	pi.registerTool({
		name: 'wp_triage',
		label: 'WP Triage',
		description:
			'Run WordPress project detection to classify the codebase (plugin, theme, block theme, WP core, Gutenberg). Returns project kind, signals (block.json, Interactivity API, WP-CLI, REST API), and tooling (PHP/Node). Use before making changes to a WordPress project.',
		promptSnippet: 'Detect WordPress project type, signals, and tooling',
		promptGuidelines: [
			'Use wp_triage before making changes to any WordPress project to understand the codebase structure.',
			'Use wp_triage output to route to the correct WordPress development skill.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'Target directory to triage (defaults to current working directory)',
				})
			),
			platform: Type.Optional(
				Type.String({
					description:
						'Platform where skills are installed (github, cursor, claude, agent, pi). Default: github',
				})
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const options: TriageOptions = {
				targetDir: params.targetDir || process.cwd(),
				platform: (params.platform as TriageOptions['platform']) || 'github',
			};

			const result = await runTriageApi(options);

			if (!result.success) {
				return {
					content: [
						{
							type: 'text',
							text: `Triage failed: ${result.error?.message || 'Unknown error'}`,
						},
					],
					details: { error: result.error },
					isError: true,
				};
			}

			const triage = result.data;
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								project: triage.project,
								signals: triage.signals,
								tooling: triage.tooling,
								recommendation: triage.project
									? `This appears to be a ${triage.project.primary} project (confidence: ${triage.project.confidence}). Use the appropriate wp-* skill for development.`
									: 'Could not determine project type. Review signals manually.',
							},
							null,
							2
						),
					},
				],
				details: triage,
			};
		},
	});

	// --- wp_install_kit ---
	// Install WordPress Agent Kit skills into a target directory.
	pi.registerTool({
		name: 'wp_install_kit',
		label: 'WP Install Kit',
		description:
			'Install the WordPress Agent Kit into a project directory. Copies .github/skills (13 WordPress development skills), agent definitions, instructions, and AGENTS.md template. Supports safe update mode that preserves user modifications. Use when setting up a new WordPress project or adding AI agent support.',
		promptSnippet: 'Install WordPress AI agent skills and configuration into a project',
		promptGuidelines: [
			'Use wp_install_kit when setting up a new WordPress project for AI agent development.',
			'Use wp_install_kit with dryRun:true to preview changes before applying.',
		],
		parameters: Type.Object({
			targetDir: Type.String({
				description: 'Target directory to install into (the WordPress project root)',
			}),
			platform: Type.Optional(
				Type.String({
					description: 'Target platform: github, cursor, claude, agent, or pi. Default: github',
				})
			),
			dryRun: Type.Optional(
				Type.Boolean({
					description: 'If true, preview changes without making them. Default: false',
				})
			),
			force: Type.Optional(
				Type.Boolean({
					description: 'Overwrite user modifications on update. Default: false',
				})
			),
		}),
		async execute(_toolCallId, params, _signal, onUpdate, _ctx) {
			const options: InstallOptions = {
				targetDir: params.targetDir,
				platform: (params.platform as InstallOptions['platform']) || 'github',
				dryRun: params.dryRun ?? false,
				force: params.force ?? false,
				safe: !params.force, // Default: safe unless forced
				backup: true,
			};

			if (options.dryRun) {
				onUpdate?.({
					content: [
						{
							type: 'text',
							text: 'Computing changes (dry-run)...',
						},
					],
				});
			}

			const result = await installKitApi(options);

			if (!result.success) {
				return {
					content: [
						{
							type: 'text',
							text: `Install failed: ${result.error?.message || 'Unknown error'}`,
						},
					],
					details: { error: result.error },
					isError: true,
				};
			}

			// Handle dry-run results
			if (options.dryRun && 'wouldExecute' in (result.data || {})) {
				const dryRun = result.data as {
					wouldExecute: boolean;
					actions: Array<{ type: string; description: string }>;
					summary: Record<string, unknown>;
				};
				return {
					content: [
						{
							type: 'text',
							text: [
								'# WordPress Agent Kit — Dry Run Preview',
								'',
								`Target: ${options.targetDir}`,
								`Platform: ${options.platform}`,
								'',
								'## Changes',
								...dryRun.actions.map((a) => `- ${a.type}: ${a.description}`),
								'',
								'Run without dryRun to apply these changes.',
							].join('\n'),
						},
					],
					details: dryRun,
				};
			}

			// Handle real results
			const data = result.data as {
				filesCreated: string[];
				filesSkipped: string[];
				isUpdate: boolean;
				backupDir: string | null;
				conflicts?: string[];
			};

			const lines = [
				data.isUpdate ? '# WordPress Agent Kit — Updated' : '# WordPress Agent Kit — Installed',
				'',
				`Target: ${options.targetDir}`,
				`Platform: ${options.platform}`,
				`Files created/updated: ${data.filesCreated.length}`,
			];

			if (data.filesSkipped.length > 0) {
				lines.push(`Files preserved: ${data.filesSkipped.length} (user-modified)`);
				for (const skipped of data.filesSkipped.slice(0, 10)) {
					lines.push(`  - ${skipped}`);
				}
			}

			if (data.conflicts && data.conflicts.length > 0) {
				lines.push(
					'',
					`⚠ ${data.conflicts.length} conflict(s) — re-run with force:true to overwrite:`
				);
				for (const conflict of data.conflicts.slice(0, 5)) {
					lines.push(`  - ${conflict}`);
				}
			}

			if (data.backupDir) {
				lines.push('', `Backup created: ${data.backupDir}`);
			}

			lines.push(
				'',
				'## Next Steps',
				'1. Run wp_triage to detect project type',
				'2. Review AGENTS.md for project-specific guidance',
				'3. Use `/skill:wp-project-triage` to begin development'
			);

			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				details: data,
			};
		},
	});

	// --- wp_sync_skills ---
	// Sync WordPress skills from upstream WordPress/agent-skills repo.
	pi.registerTool({
		name: 'wp_sync_skills',
		label: 'WP Sync Skills',
		description:
			'Sync WordPress agent skills from the upstream WordPress/agent-skills repository into the local project. Fetches the latest skill definitions and replaces the local .github/skills directory. Use when skills need updating from upstream.',
		promptSnippet: 'Sync latest WordPress agent skills from upstream',
		promptGuidelines: [
			'Use wp_sync_skills to pull the latest WordPress development skills from WordPress/agent-skills.',
			'Use wp_sync_skills with dryRun:true to preview before syncing.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'Target directory (defaults to the project root running wp-agent-kit)',
				})
			),
			ref: Type.Optional(
				Type.String({
					description: 'Git ref to sync from (default: trunk)',
				})
			),
			dryRun: Type.Optional(
				Type.Boolean({
					description: 'If true, preview without applying. Default: false',
				})
			),
		}),
		async execute(_toolCallId, params, _signal, onUpdate, _ctx) {
			const options: SyncOptions = {
				targetDir: params.targetDir || process.cwd(),
				ref: params.ref || 'trunk',
				dryRun: params.dryRun ?? false,
			};

			onUpdate?.({
				content: [
					{
						type: 'text',
						text: params.dryRun
							? 'Previewing skill sync (dry-run)...'
							: `Syncing skills from WordPress/agent-skills@${options.ref}...`,
					},
				],
			});

			const result = await syncSkillsApi(options);

			if (!result.success) {
				return {
					content: [
						{
							type: 'text',
							text: `Sync failed: ${result.error?.message || 'Unknown error'}`,
						},
					],
					details: { error: result.error },
					isError: true,
				};
			}

			if (options.dryRun && 'wouldExecute' in (result.data || {})) {
				const dryRun = result.data as {
					wouldExecute: boolean;
					actions: Array<{ type: string; description: string }>;
				};
				return {
					content: [
						{
							type: 'text',
							text: [
								'# Skill Sync — Dry Run',
								'',
								`Source: WordPress/agent-skills@${options.ref}`,
								'',
								'## Actions',
								...dryRun.actions.map((a) => `- ${a.type}: ${a.description}`),
								'',
								'Run without dryRun to apply.',
							].join('\n'),
						},
					],
					details: dryRun,
				};
			}

			const data = result.data as {
				skillsSynced: number;
				method: string;
				sourceUrl: string;
			};

			return {
				content: [
					{
						type: 'text',
						text: [
							'# Skills Synced',
							'',
							`Skills synced: ${data.skillsSynced}`,
							`Method: ${data.method}`,
							`Source: ${data.sourceUrl}`,
						].join('\n'),
					},
				],
				details: data,
			};
		},
	});

	// --- wp_upgrade ---
	// Check and apply WordPress Agent Kit upgrades.
	pi.registerTool({
		name: 'wp_upgrade',
		label: 'WP Upgrade',
		description:
			'Check for WordPress Agent Kit updates and apply them. Shows current vs latest version, detects installed platforms, and can preview or apply the upgrade. Use to keep agent skills and configuration current.',
		promptSnippet: 'Check and apply WordPress Agent Kit version upgrades',
		promptGuidelines: [
			'Use wp_upgrade to check if the installed WordPress Agent Kit is up to date.',
			'Use wp_upgrade with checkOnly:true to preview without applying.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'Target directory to check/upgrade (defaults to current working directory)',
				})
			),
			checkOnly: Type.Optional(
				Type.Boolean({
					description: 'Only check for updates, do not apply. Default: false',
				})
			),
			force: Type.Optional(
				Type.Boolean({
					description: 'Overwrite user modifications on upgrade. Default: false',
				})
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();
			const force = params.force ?? false;
			const checkOnly = params.checkOnly ?? false;

			// Detect installed platforms and current version
			const fs = await import('node:fs');
			const path = await import('node:path');
			const pkgPath = path.join(
				path.dirname(new URL(import.meta.url).pathname),
				'..',
				'..',
				'..',
				'package.json'
			);
			let latestVersion = 'unknown';
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
				latestVersion = pkg.version;
			} catch {
				// fallback
			}

			const manifest = loadManifest(targetDir, 'github');
			const currentVersion = manifest?.version || 'unknown';
			const isInstalled = isKitInstalled(targetDir, 'github');

			if (checkOnly) {
				return {
					content: [
						{
							type: 'text',
							text: [
								'# WordPress Agent Kit — Version Check',
								'',
								`Target: ${targetDir}`,
								`Installed: ${isInstalled ? 'yes' : 'no'}`,
								`Current version: ${currentVersion}`,
								`Latest version: ${latestVersion}`,
								'',
								currentVersion !== latestVersion && isInstalled
									? '⚠ Update available. Run without checkOnly to apply.'
									: isInstalled
										? '✓ Up to date.'
										: 'Not installed. Use wp_install_kit to install.',
							].join('\n'),
						},
					],
					details: {
						targetDir,
						currentVersion,
						latestVersion,
						isInstalled,
					},
				};
			}

			// Apply upgrade
			if (!isInstalled) {
				return {
					content: [
						{
							type: 'text',
							text: 'Kit not installed. Use wp_install_kit to install first.',
						},
					],
					isError: true,
				};
			}

			const result = await installKitApi({
				targetDir,
				platform: 'github',
				force,
				safe: !force,
				backup: true,
			});

			if (!result.success) {
				return {
					content: [
						{
							type: 'text',
							text: `Upgrade failed: ${result.error?.message || 'Unknown error'}`,
						},
					],
					isError: true,
				};
			}

			const data = result.data as {
				filesCreated: string[];
				filesSkipped: string[];
				conflicts?: string[];
				backupDir: string | null;
			};

			const lines = [
				'# WordPress Agent Kit — Upgraded',
				'',
				`Version: ${currentVersion} → ${latestVersion}`,
				`Files updated: ${data.filesCreated.length}`,
			];

			if (data.filesSkipped.length > 0) {
				lines.push(`Files preserved: ${data.filesSkipped.length} (user-modified)`);
			}
			if (data.conflicts && data.conflicts.length > 0) {
				lines.push(
					'',
					`⚠ ${data.conflicts.length} conflict(s) — re-run with force:true to overwrite.`
				);
			}
			if (data.backupDir) {
				lines.push(`Backup: ${data.backupDir}`);
			}

			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				details: data,
			};
		},
	});

	// =========================================================================
	// Commands
	// =========================================================================

	pi.registerCommand('wp-triage', {
		description: 'Run WordPress project triage detection',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-triage', 'Running triage...');
			const result = await runTriageApi({ targetDir });

			if (!result.success) {
				ctx.ui.notify(`Triage failed: ${result.error?.message}`, 'error');
				return;
			}

			const triage = result.data;
			const summary = triage.project
				? `${triage.project.primary} (confidence: ${triage.project.confidence})`
				: 'unknown';
			ctx.ui.notify(`Project: ${summary}`, 'info');
			ctx.ui.setStatus('wp-triage', `Detected: ${summary}`);
		},
	});

	pi.registerCommand('wp-install', {
		description: 'Install WordPress Agent Kit into a project',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-install', 'Installing...');
			const result = await installKitApi({
				targetDir,
				platform: 'github',
				safe: true,
				backup: true,
			});

			if (!result.success) {
				ctx.ui.notify(`Install failed: ${result.error?.message}`, 'error');
				return;
			}

			const data = result.data as { filesCreated: string[]; isUpdate: boolean };
			const verb = data.isUpdate ? 'Updated' : 'Installed';
			ctx.ui.notify(`${verb} (${data.filesCreated.length} files)`, 'info');
			ctx.ui.setStatus('wp-install', `${verb} ${data.filesCreated.length} files`);
		},
	});

	pi.registerCommand('wp-sync-skills', {
		description: 'Sync WordPress skills from upstream',
		handler: async (args, ctx) => {
			ctx.ui.setStatus('wp-sync', 'Syncing skills...');
			const result = await syncSkillsApi({
				ref: args?.trim() || 'trunk',
			});

			if (!result.success) {
				ctx.ui.notify(`Sync failed: ${result.error?.message}`, 'error');
				return;
			}

			const data = result.data as { skillsSynced: number; method: string };
			ctx.ui.notify(`Synced ${data.skillsSynced} skills (${data.method})`, 'info');
			ctx.ui.setStatus('wp-sync', `${data.skillsSynced} skills`);
		},
	});

	pi.registerCommand('wp-upgrade', {
		description: 'Check or apply WordPress Agent Kit upgrades',
		handler: async (_args, ctx) => {
			const targetDir = ctx.cwd;
			const manifest = loadManifest(targetDir, 'github');
			const currentVersion = manifest?.version || 'not installed';

			const pkgPath = `${ctx.cwd}/node_modules/wordpress-agent-kit/package.json`;
			let latestVersion = 'unknown';
			try {
				const fs = await import('node:fs');
				if (fs.existsSync(pkgPath)) {
					const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
					latestVersion = pkg.version;
				}
			} catch {
				// fallback
			}

			ctx.ui.notify(`WP Agent Kit: ${currentVersion} → ${latestVersion}`, 'info');
		},
	});
}
