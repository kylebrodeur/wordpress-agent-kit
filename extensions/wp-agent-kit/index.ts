import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * WordPress Agent Kit — Pi Extension
 *
 * Provides Pi Coding Agent with WordPress development tools:
 * - 18 WordPress agent skills (17 upstream + wp-wpengine custom) at .agents/skills/ (AgentSkills.io convention)
 * - Project triage detection
 * - Skill installation, syncing, upgrade, and orphan cleanup
 *
 * Follows Pi Coding Agent SDK conventions (extensions.md, packages.md, skills.md).
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

// Resolve the API import dynamically — works in both dev (src/) and npm (dist/)
let apiModule: typeof import('../../dist/lib/api.js');
try {
	apiModule = await import('../../dist/lib/api.js');
} catch {
	// Fallback for dev: import from source via jiti
	apiModule = (await import('../../src/lib/api.js')) as typeof import('../../dist/lib/api.js');
}

const { installKitApi, syncSkillsApi, runTriageApi, cleanSkillsApi, isKitInstalled, loadManifest } =
	apiModule;

export default function (pi: ExtensionAPI) {
	// =========================================================================
	// Skills Registration
	// =========================================================================
	// Primary skills (.agents/skills/) are registered via `pi.skills` in package.json.
	// Pi also auto-discovers from .agents/skills/ at the project level (AgentSkills.io convention).
	// The resources_discover handler ONLY supplements skills that aren't already
	// covered by the static manifest — specifically, custom skills from
	// skills-custom/ that haven't been synced into .agents/skills/ yet.
	// This avoids name collisions (Pi keeps first-loaded, warns on duplicates).
	pi.on('resources_discover', async (_event, _ctx) => {
		const canonicalSkillsDir = path.join(PACKAGE_ROOT, '.agents', 'skills');
		const customSkillsDir = path.join(PACKAGE_ROOT, 'skills-custom');
		const promptsDir = path.join(PACKAGE_ROOT, '.github', 'prompts');

		// Only discover custom skills that aren't already in .agents/skills/
		// (which is registered via pi.skills in package.json).
		const skillPaths: string[] = [];
		if (fs.existsSync(customSkillsDir)) {
			const existingSkills = fs.existsSync(canonicalSkillsDir)
				? new Set(fs.readdirSync(canonicalSkillsDir))
				: new Set<string>();
			for (const entry of fs.readdirSync(customSkillsDir)) {
				if (!existingSkills.has(entry)) {
					const entryPath = path.join(customSkillsDir, entry);
					if (fs.statSync(entryPath).isDirectory()) {
						skillPaths.push(entryPath);
					}
				}
			}
		}

		return {
			skillPaths: skillPaths.length > 0 ? skillPaths : undefined,
			promptPaths: [promptsDir],
		};
	});

	// =========================================================================
	// Session notifications
	// =========================================================================
	pi.on('session_start', async (_event, ctx) => {
		const platforms: Array<'pi' | 'github'> = ['pi', 'github'];
		for (const p of platforms) {
			if (isKitInstalled(ctx.cwd, p)) {
				const manifest = loadManifest(ctx.cwd, p);
				if (manifest) {
					ctx.ui.setStatus('wp-agent-kit', `WP Agent Kit v${manifest.version}`);
				}
				break;
			}
		}
	});

	// =========================================================================
	// Custom Tools
	// =========================================================================

	// --- wp_triage ---
	pi.registerTool({
		name: 'wp_triage',
		label: 'WP Triage',
		description:
			'Detect WordPress project type (plugin, theme, block theme, site, Gutenberg), signals (block.json, Interactivity API, WP-CLI, REST API), and tooling (PHP/Node). Use before making changes to any WordPress project.',
		promptSnippet: 'Detect WordPress project type, signals, and tooling',
		promptGuidelines: [
			'Use wp_triage before making changes to any WordPress project to understand the codebase.',
			'Use wp_triage output to route to the correct WordPress development skill.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'WordPress project directory (defaults to current working directory)',
				})
			),
		}),
		async execute(_callId, params, _signal, _onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();
			const result = await runTriageApi({
				targetDir,
				platform: 'pi',
			});

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

			const t = result.data;
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								project: t.project,
								signals: t.signals,
								tooling: t.tooling,
								recommendation: t.project
									? `${t.project.primary} project (confidence: ${t.project.confidence}). Use the matching wp-* skill.`
									: 'Could not determine project type. Review signals manually.',
							},
							null,
							2
						),
					},
				],
				details: t,
			};
		},
	});

	// --- wp_install_kit ---
	pi.registerTool({
		name: 'wp_install_kit',
		label: 'WP Install Kit',
		description:
			'Install WordPress Agent Kit into a project directory. Copies 18 WordPress skills to .agents/skills/ (AgentSkills.io convention), platform-specific agents/instructions/prompts, and an AGENTS.md template. Safe by default — preserves user modifications on re-run.',
		promptSnippet: 'Install WordPress AI agent skills and configuration into a project',
		promptGuidelines: [
			'Use wp_install_kit when setting up a new WordPress project for AI agent development.',
			'Use wp_install_kit with dryRun: true to preview changes before applying.',
		],
		parameters: Type.Object({
			targetDir: Type.String({
				description: 'WordPress project root directory to install into',
			}),
			dryRun: Type.Optional(
				Type.Boolean({
					description: 'Preview changes without applying (default: false)',
				})
			),
			force: Type.Optional(
				Type.Boolean({
					description: 'Overwrite user modifications on update (default: false)',
				})
			),
		}),
		async execute(_callId, params, _signal, onUpdate, _ctx) {
			const opts = {
				targetDir: params.targetDir,
				platform: 'pi' as const,
				dryRun: params.dryRun ?? false,
				force: params.force ?? false,
				safe: !(params.force ?? false),
				backup: true,
			};

			if (opts.dryRun) {
				onUpdate?.({ content: [{ type: 'text', text: 'Computing changes (dry-run)...' }] });
			}

			const result = await installKitApi(opts);

			if (!result.success) {
				return {
					content: [
						{ type: 'text', text: `Install failed: ${result.error?.message || 'Unknown error'}` },
					],
					isError: true,
				};
			}

			// Dry-run: show change preview
			if (opts.dryRun && 'wouldExecute' in (result.data || {})) {
				const dr = result.data as {
					wouldExecute: boolean;
					actions: Array<{ type: string; description: string }>;
				};
				return {
					content: [
						{
							type: 'text',
							text: [
								'# WordPress Agent Kit — Dry Run',
								'',
								'## Changes',
								...dr.actions.map((a) => `- **${a.type}**: ${a.description}`),
								'',
								'Run without `dryRun` to apply.',
							].join('\n'),
						},
					],
					details: dr,
				};
			}

			// Real result
			const data = result.data as {
				filesCreated: string[];
				filesSkipped: string[];
				isUpdate: boolean;
				backupDir: string | null;
				conflicts?: string[];
			};

			const lines = [
				data.isUpdate ? '# Updated' : '# Installed',
				'',
				`**Target**: ${opts.targetDir}`,
				`**Files**: ${data.filesCreated.length} created/updated`,
			];

			if (data.filesSkipped.length > 0) {
				lines.push(`**Preserved**: ${data.filesSkipped.length} files (user-modified)`);
			}

			if (data.conflicts?.length) {
				lines.push('', '⚠ **Conflicts** (re-run with `force: true` to overwrite):');
				for (const c of data.conflicts.slice(0, 5)) lines.push(`- ${c}`);
			}

			if (data.backupDir) lines.push('', `**Backup**: ${data.backupDir}`);

			lines.push(
				'',
				'## Next Steps',
				'1. Run `wp_triage` to detect project type',
				'2. Review `AGENTS.md` for guidance'
			);

			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				details: data,
			};
		},
	});

	// --- wp_sync_skills ---
	pi.registerTool({
		name: 'wp_sync_skills',
		label: 'WP Sync Skills',
		description:
			'Sync WordPress agent skills from the upstream WordPress/agent-skills repository. Fetches the latest upstream skill definitions and merges custom skills from skills-custom/ — custom skills survive upstream syncs.',
		promptSnippet: 'Sync latest WordPress agent skills from upstream',
		promptGuidelines: [
			'Use wp_sync_skills to pull the latest WordPress development skills from WordPress/agent-skills.',
		],
		parameters: Type.Object({
			ref: Type.Optional(
				Type.String({
					description: 'Git ref to sync from (default: trunk)',
				})
			),
		}),
		async execute(_callId, params, _signal, onUpdate, _ctx) {
			onUpdate?.({ content: [{ type: 'text', text: 'Syncing from WordPress/agent-skills...' }] });

			const result = await syncSkillsApi({
				targetDir: PACKAGE_ROOT,
				ref: params.ref || 'trunk',
			});

			if (!result.success) {
				return {
					content: [
						{ type: 'text', text: `Sync failed: ${result.error?.message || 'Unknown error'}` },
					],
					isError: true,
				};
			}

			const data = result.data as { skillsSynced: number; method: string };
			const customSkillNote = fs.existsSync(path.join(PACKAGE_ROOT, 'skills-custom'))
				? '\n**Custom skills**: Merged from skills-custom/'
				: '';
			return {
				content: [
					{
						type: 'text',
						text: `# Skills Synced\n\n**Synced**: ${data.skillsSynced} skills\n**Method**: ${data.method}${customSkillNote}`,
					},
				],
				details: data,
			};
		},
	});

	// --- wp_upgrade ---
	pi.registerTool({
		name: 'wp_upgrade',
		label: 'WP Upgrade',
		description:
			'Check for WordPress Agent Kit updates. Shows current vs latest version and can preview or apply upgrades.',
		promptSnippet: 'Check WordPress Agent Kit version',
		promptGuidelines: [
			'Use wp_upgrade to check if the installed WordPress Agent Kit is up to date.',
			'Use wp_upgrade with checkOnly: true to preview without applying.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'Project directory to check (defaults to cwd)',
				})
			),
			checkOnly: Type.Optional(
				Type.Boolean({
					description: 'Only check for updates, do not apply (default: false)',
				})
			),
		}),
		async execute(_callId, params, _signal, _onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();
			const checkOnly = params.checkOnly ?? false;
			const manifest = loadManifest(targetDir, 'pi') || loadManifest(targetDir, 'github');
			const currentVersion = manifest?.version || 'not installed';
			const latestVersion = (() => {
				try {
					return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'))
						.version;
				} catch {
					return 'unknown';
				}
			})();

			const installed = isKitInstalled(targetDir, 'pi') || isKitInstalled(targetDir, 'github');

			if (checkOnly) {
				return {
					content: [
						{
							type: 'text',
							text: [
								'# WordPress Agent Kit — Version Check',
								'',
								`**Installed**: ${installed ? 'yes' : 'no'}`,
								`**Current**: ${currentVersion}`,
								`**Latest**: ${latestVersion}`,
								'',
								currentVersion !== latestVersion && installed
									? '⚠ Update available. Run without `checkOnly` to apply.'
									: installed
										? '✅ Up to date.'
										: 'Not installed. Use `wp_install_kit` to install.',
							].join('\n'),
						},
					],
					details: { currentVersion, latestVersion, installed },
				};
			}

			if (!installed) {
				return {
					content: [{ type: 'text', text: 'Kit not installed. Use `wp_install_kit` first.' }],
					isError: true,
				};
			}

			const result = await installKitApi({
				targetDir,
				platform: 'pi',
				safe: true,
				backup: true,
			});

			if (!result.success) {
				return {
					content: [{ type: 'text', text: `Upgrade failed: ${result.error?.message}` }],
					isError: true,
				};
			}

			const data = result.data as {
				filesCreated: string[];
				filesSkipped: string[];
				conflicts?: string[];
			};
			const lines = [
				'# Upgraded',
				'',
				`**Version**: ${currentVersion} → ${latestVersion}`,
				`**Files updated**: ${data.filesCreated.length}`,
			];
			if (data.filesSkipped.length)
				lines.push(`**Preserved**: ${data.filesSkipped.length} (user-modified)`);
			if (data.conflicts?.length)
				lines.push(`⚠ ${data.conflicts.length} conflicts (use force: true)`);

			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				details: data,
			};
		},
	});

	// --- wp_clean_skills ---
	pi.registerTool({
		name: 'wp_clean_skills',
		label: 'WP Clean Skills',
		description:
			'Detect and remove orphaned skills from a WordPress Agent Kit installation. Compares installed skills against the canonical set (upstream + custom) and reports or removes skills that are no longer part of the kit. Safe by default — use dryRun first to preview.',
		promptSnippet: 'Clean up orphaned WordPress agent skills',
		promptGuidelines: [
			'Use wp_clean_skills after upgrading to remove skills that are no longer part of the kit.',
			'Always run with dryRun: true first to preview what would be removed.',
			'This only removes skill directories — it does not modify AGENTS.md or other config files.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'WordPress project directory (defaults to current working directory)',
				})
			),
			dryRun: Type.Optional(
				Type.Boolean({
					description: 'Preview changes without applying (default: true for safety)',
				})
			),
			remove: Type.Optional(
				Type.Boolean({
					description: 'Actually remove orphaned skills (default: false — report only)',
				})
			),
		}),
		async execute(_callId, params, _signal, _onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();
			const dryRun = params.dryRun ?? true;
			const remove = params.remove ?? false;

			const result = await cleanSkillsApi({
				targetDir,
				platform: 'pi',
				dryRun,
				remove,
			});

			if (!result.success) {
				return {
					content: [
						{ type: 'text', text: `Clean failed: ${result.error?.message || 'Unknown error'}` },
					],
					isError: true,
				};
			}

			const data = result.data as {
				orphanedSkills: string[];
				removedSkills: string[];
				legacySkillDirs: string[];
				migratedSkills: string[];
				dryRun: boolean;
			};

			const hasNoIssues = data.orphanedSkills.length === 0 && data.legacySkillDirs.length === 0;
			if (hasNoIssues) {
				return {
					content: [
						{
							type: 'text',
							text: '# All Clean\n\nAll installed skills match the canonical set. No orphaned or legacy skills found.',
						},
					],
					details: data,
				};
			}

			const lines = [dryRun ? '# Skills Cleanup Preview (Dry Run)' : '# Skills Cleaned Up', ''];

			if (data.orphanedSkills.length > 0) {
				lines.push(`**Orphaned skills** (${data.orphanedSkills.length}):`);
				for (const skill of data.orphanedSkills) {
					lines.push(`- ${skill}`);
				}
			}

			if (data.legacySkillDirs.length > 0) {
				lines.push('', `**Legacy skill directories** (${data.legacySkillDirs.length}):`);
				for (const dir of data.legacySkillDirs) {
					lines.push(`- ${dir}`);
				}
				lines.push('These will be migrated to `.agents/skills/` and then removed.');
			}

			if (dryRun) {
				lines.push('', 'Run with `remove: true` to clean up.');
			} else {
				if (data.removedSkills.length > 0) {
					lines.push('', `Removed **${data.removedSkills.length}** orphaned skill(s).`);
				}
				if (data.migratedSkills.length > 0) {
					lines.push(
						`Migrated **${data.migratedSkills.length}** skill(s) from legacy directories.`
					);
				}
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
			const result = await runTriageApi({ targetDir, platform: 'pi' });
			if (!result.success) {
				ctx.ui.notify(`Triage failed: ${result.error?.message}`, 'error');
				return;
			}
			const t = result.data;
			const summary = t.project
				? `${t.project.primary} (confidence: ${t.project.confidence})`
				: 'unknown';
			ctx.ui.notify(`Project: ${summary}`, 'info');
			ctx.ui.setStatus('wp-triage', summary);
		},
	});

	pi.registerCommand('wp-install', {
		description: 'Install WordPress Agent Kit into current project',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-install', 'Installing...');
			const result = await installKitApi({ targetDir, platform: 'pi', safe: true, backup: true });
			if (!result.success) {
				ctx.ui.notify(`Install failed: ${result.error?.message}`, 'error');
				return;
			}
			const data = result.data as { filesCreated: string[]; isUpdate: boolean };
			ctx.ui.notify(
				`${data.isUpdate ? 'Updated' : 'Installed'} (${data.filesCreated.length} entries)`,
				'info'
			);
			const pkgVersion = (() => {
				try {
					return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'))
						.version;
				} catch {
					return 'unknown';
				}
			})();
			ctx.ui.setStatus('wp-agent-kit', `v${pkgVersion} installed`);
		},
	});

	pi.registerCommand('wp-sync-skills', {
		description: 'Sync WordPress skills from upstream',
		handler: async (args, ctx) => {
			ctx.ui.setStatus('wp-sync', 'Syncing...');
			const result = await syncSkillsApi({ targetDir: PACKAGE_ROOT, ref: args?.trim() || 'trunk' });
			if (!result.success) {
				ctx.ui.notify(`Sync failed: ${result.error?.message}`, 'error');
				return;
			}
			const data = result.data as { skillsSynced: number };
			ctx.ui.notify(`Synced ${data.skillsSynced} skills`, 'info');
			ctx.ui.setStatus('wp-agent-kit', `${data.skillsSynced} skills`);
		},
	});

	pi.registerCommand('wp-clean-skills', {
		description: 'Detect and remove orphaned/legacy skills from WordPress Agent Kit',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-clean', 'Checking for orphaned and legacy skills...');
			const result = await cleanSkillsApi({
				targetDir,
				platform: 'pi',
				dryRun: true,
				remove: false,
			});
			if (!result.success) {
				ctx.ui.notify(`Clean failed: ${result.error?.message}`, 'error');
				return;
			}
			const data = result.data as { orphanedSkills: string[]; legacySkillDirs: string[] };
			const total = data.orphanedSkills.length + data.legacySkillDirs.length;
			if (total === 0) {
				ctx.ui.notify('No orphaned or legacy skills found', 'info');
			} else {
				const parts: string[] = [];
				if (data.orphanedSkills.length > 0) parts.push(`${data.orphanedSkills.length} orphaned`);
				if (data.legacySkillDirs.length > 0)
					parts.push(`${data.legacySkillDirs.length} legacy dir(s)`);
				ctx.ui.notify(`Found ${parts.join(', ')}`, 'info');
			}
			ctx.ui.setStatus('wp-clean', total === 0 ? 'clean' : `${total} issues`);
		},
	});
}
