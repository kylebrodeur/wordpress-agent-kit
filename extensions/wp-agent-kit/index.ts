import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * WordPress Agent Kit — Pi Extension
 *
 * Provides Pi Coding Agent with WordPress development tools:
 * - 9 custom WordPress skills (vendored in skills/, shipped in the npm package) +
 *   17 upstream skills (pulled via `npx skills add WordPress/agent-skills`, NOT vendored).
 *   Custom skills are served by resources_discover (cwd-aware, zero collision).
 * - Project triage detection
 * - Skill install/update lifecycle, kit install, upgrade, orphan cleanup, project bootstrapping
 *
 * Follows Pi Coding Agent SDK conventions (extensions.md, packages.md, skills.md).
 *
 * Collision-free skill loading:
 *   Pi auto-discovers .agents/skills/ from the project cwd. We must NOT register the
 *   same directory via pi.skills in package.json (removed) — that would cause duplicate
 *   name warnings every session. resources_discover instead checks event.cwd: if the
 *   project already has .agents/skills/, it stays silent; otherwise it serves the
 *   package's bundled custom skills (skills/) so they work before `skills install` is run.
 *   The 17 upstream skills are not bundled — they arrive via `wp_skills_install`
 *   (which runs `npx skills add WordPress/agent-skills`).
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

const {
	installKitApi,
	installSkillsApi,
	updateSkillsApi,
	runTriageApi,
	cleanSkillsApi,
	bootstrapApi,
	isKitInstalled,
	loadManifest,
} = apiModule;

export default function (pi: ExtensionAPI) {
	// =========================================================================
	// Skills Registration
	// =========================================================================
	// Skills: our 9 custom skills are vendored in skills/ (shipped in the npm package);
	// the 17 upstream skills are NOT bundled — they are pulled via
	// `npx skills add WordPress/agent-skills` by `wp_skills_install`.
	// Pi auto-discovers .agents/skills/ from the project cwd — we must NOT also
	// register the same directory via pi.skills in package.json, otherwise every
	// skill collides (package-level registration + project-level auto-discovery).
	//
	// Strategy (cwd-aware):
	//   • If the project already has its own .agents/skills/ (after running
	//     `wp-agent-kit skills install`), stay silent — Pi's project-level scan handles it.
	//   • If the project has no .agents/skills/ yet, serve the package's bundled
	//     custom skills (skills/) so they are available before install is run.
	pi.on('resources_discover', async (event, _ctx) => {
		const canonicalSkillsDir = path.join(PACKAGE_ROOT, 'skills');
		const promptsDir = path.join(PACKAGE_ROOT, '.github', 'prompts');

		// Check if the current project already has .agents/skills/ installed.
		// If so, Pi's project-level discovery handles it — returning skillPaths
		// here would produce duplicate-name warnings for identical skill names.
		const projectSkillsDir = path.join(event.cwd, '.agents', 'skills');
		if (fs.existsSync(projectSkillsDir)) {
			return { promptPaths: [promptsDir] };
		}

		// Project has no .agents/skills/ yet — serve the bundled custom skills
		// (skills/) so they are available even before `wp-agent-kit skills install`.
		if (fs.existsSync(canonicalSkillsDir)) {
			return {
				skillPaths: [canonicalSkillsDir],
				promptPaths: [promptsDir],
			};
		}

		return { promptPaths: [promptsDir] };
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
			'Install WordPress Agent Kit into a project directory. Copies platform-specific agents/instructions/prompts and an AGENTS.md template (does NOT copy skills — run `wp_skills_install` for skills). Safe by default — preserves user modifications on re-run.',
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
				'1. Run `wp_skills_install` to install skills (9 custom + 17 upstream via npx skills)',
				'2. Run `wp_triage` to detect project type',
				'3. Review `AGENTS.md` for guidance'
			);

			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				details: data,
			};
		},
	});

	// --- wp_skills_install ---
	pi.registerTool({
		name: 'wp_skills_install',
		label: 'WP Skills Install',
		description:
			'Install WordPress Agent Kit skills into a project. Copies our 9 vendored custom skills (from skills/) into .agents/skills/, then pulls the 17 upstream skills via `npx skills add WordPress/agent-skills`. The upstream step never aborts the custom-skill copy on failure. Use dryRun: true to preview.',
		promptSnippet: 'Install WordPress agent skills (custom bundle + upstream via npx skills)',
		promptGuidelines: [
			'Use wp_skills_install after wp_install_kit to bring skills into the project.',
			'Use wp_skills_install with dryRun: true to preview before applying.',
			'The 17 upstream skills require `npx skills` (vercel-labs/skills) and network access.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'WordPress project directory (defaults to current working directory)',
				})
			),
			dryRun: Type.Optional(
				Type.Boolean({ description: 'Preview without applying (default: false)' })
			),
			force: Type.Optional(
				Type.Boolean({ description: 'Overwrite existing custom skills (default: false)' })
			),
			agent: Type.Optional(Type.String({ description: 'Passthrough to `npx skills add --agent`' })),
			projectDir: Type.Optional(
				Type.String({ description: 'Passthrough to `npx skills add --project-dir`' })
			),
			global: Type.Optional(
				Type.Boolean({ description: 'Passthrough to `npx skills add --global`' })
			),
		}),
		async execute(_callId, params, _signal, onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();
			const opts = {
				targetDir,
				dryRun: params.dryRun ?? false,
				force: params.force ?? false,
				agent: params.agent,
				projectDir: params.projectDir,
				global: params.global ?? false,
			};

			if (opts.dryRun) {
				onUpdate?.({ content: [{ type: 'text', text: 'Planning skills install (dry-run)...' }] });
			} else {
				onUpdate?.({
					content: [{ type: 'text', text: 'Installing skills (custom + upstream)...' }],
				});
			}

			const result = await installSkillsApi(opts);
			if (!result.success) {
				return {
					content: [
						{
							type: 'text',
							text: `Skills install failed: ${result.error?.message || 'Unknown error'}`,
						},
					],
					isError: true,
				};
			}

			// Dry-run: show plan
			if (opts.dryRun && 'wouldExecute' in (result.data || {})) {
				const dr = result.data as {
					actions: Array<{ type: string; description: string }>;
				};
				return {
					content: [
						{
							type: 'text',
							text: [
								'# Skills Install — Dry Run',
								'',
								'## Plan',
								...dr.actions.map((a) => `- **${a.type}**: ${a.description}`),
								'',
								'Run without `dryRun` to apply.',
							].join('\n'),
						},
					],
					details: dr,
				};
			}

			const data = result.data as {
				customSkills: string[];
				upstreamSuccess: boolean;
				upstreamCommand?: string;
				upstreamError?: string;
				warnings: string[];
			};
			const lines = [
				'# Skills Installed',
				'',
				`**Custom skills**: ${data.customSkills.length} copied (from skills/)`,
				`**Upstream**: ${data.upstreamSuccess ? '✅ pulled via npx skills' : '⚠ skipped (see warnings)'}`,
			];
			if (data.upstreamCommand) lines.push(`  - ${data.upstreamCommand}`);
			if (data.upstreamError) lines.push(`  - Error: ${data.upstreamError}`);
			if (data.warnings.length) {
				lines.push('', '**Warnings**:');
				for (const w of data.warnings) lines.push(`- ${w}`);
			}
			return {
				content: [{ type: 'text', text: lines.join('\n') }],
				details: data,
			};
		},
	});

	// --- wp_skills_update ---
	pi.registerTool({
		name: 'wp_skills_update',
		label: 'WP Skills Update',
		description:
			'Update WordPress Agent Kit skills in a project. Re-copies our 9 vendored custom skills (from skills/) into .agents/skills/, then runs `npx skills update` to refresh the 17 upstream skills. The upstream step never aborts the custom-skill refresh on failure. Use dryRun: true to preview.',
		promptSnippet: 'Update WordPress agent skills (custom bundle + upstream via npx skills update)',
		promptGuidelines: [
			'Use wp_skills_update to refresh skills in an existing project after a kit upgrade.',
			'Use wp_skills_update with dryRun: true to preview before applying.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'WordPress project directory (defaults to current working directory)',
				})
			),
			dryRun: Type.Optional(
				Type.Boolean({ description: 'Preview without applying (default: false)' })
			),
			force: Type.Optional(
				Type.Boolean({ description: 'Overwrite existing custom skills (default: false)' })
			),
		}),
		async execute(_callId, params, _signal, onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();
			const opts = {
				targetDir,
				dryRun: params.dryRun ?? false,
				force: params.force ?? false,
			};

			onUpdate?.({
				content: [
					{
						type: 'text',
						text: opts.dryRun ? 'Planning skills update (dry-run)...' : 'Updating skills...',
					},
				],
			});

			const result = await updateSkillsApi(opts);
			if (!result.success) {
				return {
					content: [
						{
							type: 'text',
							text: `Skills update failed: ${result.error?.message || 'Unknown error'}`,
						},
					],
					isError: true,
				};
			}

			if (opts.dryRun && 'wouldExecute' in (result.data || {})) {
				const dr = result.data as { actions: Array<{ type: string; description: string }> };
				return {
					content: [
						{
							type: 'text',
							text: [
								'# Skills Update — Dry Run',
								'',
								'## Plan',
								...dr.actions.map((a) => `- **${a.type}**: ${a.description}`),
								'',
								'Run without `dryRun` to apply.',
							].join('\n'),
						},
					],
					details: dr,
				};
			}

			const data = result.data as {
				customSkills: string[];
				upstreamSuccess: boolean;
				upstreamCommand?: string;
				upstreamError?: string;
				warnings: string[];
			};
			const lines = [
				'# Skills Updated',
				'',
				`**Custom skills**: ${data.customSkills.length} refreshed (from skills/)`,
				`**Upstream**: ${data.upstreamSuccess ? '✅ refreshed via npx skills update' : '⚠ skipped (see warnings)'}`,
			];
			if (data.upstreamCommand) lines.push(`  - ${data.upstreamCommand}`);
			if (data.upstreamError) lines.push(`  - Error: ${data.upstreamError}`);
			if (data.warnings.length) {
				lines.push('', '**Warnings**:');
				for (const w of data.warnings) lines.push(`- ${w}`);
			}
			return {
				content: [{ type: 'text', text: lines.join('\n') }],
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

	// --- wp_bootstrap ---
	pi.registerTool({
		name: 'wp_bootstrap',
		label: 'WP Bootstrap',
		description:
			'Bootstrap a WordPress project: detect monorepo structure, install agent kit, scaffold Composer/WPackagist/SatisPress, WP-CLI aliases, git hooks, Playground scripts, and WP Engine CI/CD. Supports single plugins/themes and monorepos (multiple WP packages + JS workspaces).',
		promptSnippet: 'Detect WordPress project structure and bootstrap full tooling',
		promptGuidelines: [
			'Always run wp_bootstrap with detectOnly: true first to understand the project structure.',
			'Use the structure report to identify monorepo patterns before scaffolding.',
			'For monorepos, confirm WP package paths before proceeding.',
		],
		parameters: Type.Object({
			targetDir: Type.Optional(
				Type.String({
					description: 'Project root directory (defaults to current working directory)',
				})
			),
			detectOnly: Type.Optional(
				Type.Boolean({
					description: 'Only detect structure, do not scaffold anything (default: false)',
				})
			),
			platform: Type.Optional(
				Type.String({
					description: 'Agent kit platform: github, pi, cursor, claude (default: github)',
				})
			),
			wpeProd: Type.Optional(Type.String({ description: 'WP Engine production install slug' })),
			wpeStaging: Type.Optional(Type.String({ description: 'WP Engine staging install slug' })),
			wpeDev: Type.Optional(Type.String({ description: 'WP Engine development install slug' })),
			withWpackagist: Type.Optional(
				Type.Boolean({ description: 'Add WPackagist to composer.json' })
			),
			withSatispress: Type.Optional(
				Type.String({ description: 'SatisPress URL to add to composer.json' })
			),
			dryRun: Type.Optional(
				Type.Boolean({ description: 'Preview without making changes (default: false)' })
			),
		}),
		async execute(_callId, params, _signal, onUpdate, _ctx) {
			const targetDir = params.targetDir || process.cwd();

			onUpdate?.({ content: [{ type: 'text', text: '▶ Detecting project structure...' }] });

			const result = await bootstrapApi({
				targetDir,
				platform: (params.platform as 'github' | 'pi' | 'cursor' | 'claude') ?? 'github',
				detectOnly: params.detectOnly ?? false,
				dryRun: params.dryRun ?? false,
				wpeEnvironments: {
					production: params.wpeProd,
					staging: params.wpeStaging,
					development: params.wpeDev,
				},
				withWpackagist: params.withWpackagist,
				withSatispress: params.withSatispress,
			});

			if (!result.success) {
				return {
					content: [
						{ type: 'text', text: `Bootstrap failed: ${result.error?.message || 'Unknown error'}` },
					],
					isError: true,
				};
			}

			const data = result.data as {
				detectOnly: boolean;
				structure: {
					isMonorepo: boolean;
					wpPackages: Array<{ type: string; name: string; path: string }>;
					wpRoot: string | null;
					packageManager: string;
					wpeRemotes: Array<{ name: string; install: string }>;
				};
				actions: string[];
				filesCreated: string[];
			};

			if (data.detectOnly) {
				const s = data.structure;
				const lines = [
					'# Project Structure',
					'',
					`**Monorepo**: ${s.isMonorepo ? 'yes' : 'no'}  |  **Package manager**: ${s.packageManager ?? 'none'}  |  **WP root**: ${s.wpRoot ?? 'Playground-only'}`,
					'',
					`**WP packages** (${s.wpPackages.length}):`,
					...s.wpPackages.map(
						(p) => `- ${p.type === 'plugin' ? '🔌' : '🎨'} ${p.name ?? p.path} (\`${p.path}\`)`
					),
					'',
					`**WP Engine remotes** (${s.wpeRemotes.length}):`,
					...s.wpeRemotes.map((r) => `- ${r.name} (${r.install})`),
				];
				return { content: [{ type: 'text', text: lines.join('\n') }], details: data.structure };
			}

			return {
				content: [{ type: 'text', text: ['# Bootstrap Complete', '', ...data.actions].join('\n') }],
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

	pi.registerCommand('wp-skills-install', {
		description: 'Install WordPress skills (custom bundle + upstream via npx skills)',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-skills', 'Installing skills...');
			const result = await installSkillsApi({ targetDir });
			if (!result.success) {
				ctx.ui.notify(`Skills install failed: ${result.error?.message}`, 'error');
				return;
			}
			const data = result.data as { customSkills: string[]; upstreamSuccess: boolean };
			ctx.ui.notify(
				`${data.customSkills.length} custom + ${data.upstreamSuccess ? 'upstream ok' : 'upstream skipped'}`,
				data.upstreamSuccess ? 'info' : 'warning'
			);
			ctx.ui.setStatus('wp-skills', `${data.customSkills.length} custom installed`);
		},
	});

	pi.registerCommand('wp-skills-update', {
		description: 'Update WordPress skills (custom bundle + upstream via npx skills update)',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-skills', 'Updating skills...');
			const result = await updateSkillsApi({ targetDir });
			if (!result.success) {
				ctx.ui.notify(`Skills update failed: ${result.error?.message}`, 'error');
				return;
			}
			const data = result.data as { customSkills: string[]; upstreamSuccess: boolean };
			ctx.ui.notify(
				`${data.customSkills.length} custom refreshed + ${data.upstreamSuccess ? 'upstream ok' : 'upstream skipped'}`,
				data.upstreamSuccess ? 'info' : 'warning'
			);
			ctx.ui.setStatus('wp-skills', `${data.customSkills.length} custom refreshed`);
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

	pi.registerCommand('wp-bootstrap', {
		description: 'Detect WordPress project structure and bootstrap the full toolkit',
		handler: async (args, ctx) => {
			const targetDir = args?.trim() || ctx.cwd;
			ctx.ui.setStatus('wp-bootstrap', 'Detecting...');
			const result = await bootstrapApi({ targetDir, detectOnly: true });
			if (!result.success) {
				ctx.ui.notify(`Bootstrap failed: ${result.error?.message}`, 'error');
				return;
			}
			const data = result.data as {
				structure: {
					isMonorepo: boolean;
					wpPackages: Array<{ type: string; name: string; path: string }>;
				};
			};
			const s = data.structure;
			const pkgCount = s.wpPackages.length;
			const label = s.isMonorepo
				? `monorepo (${pkgCount} packages)`
				: `${s.wpPackages[0]?.type ?? 'unknown'} (${pkgCount} package)`;
			ctx.ui.notify(`Detected: ${label}`, 'info');
			ctx.ui.setStatus('wp-bootstrap', label);
		},
	});
}
