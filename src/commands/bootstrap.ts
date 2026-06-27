import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { type BootstrapResult, bootstrapApi } from '../lib/api.js';
import { OutputFormatter, createFormatter } from '../utils/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Bootstrap command — probe, configure, and wire up a WordPress project.
 * Supports single plugins/themes and monorepos (multiple WP packages).
 * Supports --detect-only, --auto (non-interactive), --dry-run, --json.
 */
export const bootstrapCommand = new Command('bootstrap')
	.description(
		'Bootstrap a WordPress project: detect structure, install agent kit, scaffold tooling'
	)
	.argument('[dir]', 'Target directory (defaults to cwd)', process.cwd())
	.option('--detect-only', 'Only run structure detection and output result', false)
	.option('--auto', 'Non-interactive: use detected values without prompting', false)
	.option('--platform <platform>', 'Agent kit platform (github, pi, cursor, claude)', 'github')
	.option('--wp-root <path>', 'WordPress root path relative to repo root (overrides detection)')
	.option('--wp-packages <dirs>', 'Comma-separated list of WP package dirs (overrides detection)')
	.option('--package-manager <pm>', 'Package manager: npm, pnpm, yarn (overrides detection)')
	.option('--wpe-prod <slug>', 'WP Engine production install slug')
	.option('--wpe-staging <slug>', 'WP Engine staging install slug')
	.option('--wpe-dev <slug>', 'WP Engine development install slug')
	.option('--with-satispress <url>', 'Add SatisPress repository URL to composer.json')
	.option('--with-wpackagist', 'Add WPackagist repository to composer.json', false)
	.option('--skip-install', 'Skip running wp-agent-kit install after scaffolding', false)
	.action(async (dir: string, options, command) => {
		const globalOpts = command.parent?.opts() || {};
		const targetDir = path.resolve(dir);
		const formatter = createFormatter(globalOpts, 'bootstrap', '0.0.0');

		if (!fs.existsSync(targetDir)) {
			const result = formatter.fail({
				code: 'NOT_FOUND',
				message: `Directory does not exist: ${targetDir}`,
				exitCode: 3,
			});
			process.exit(OutputFormatter.getExitCode(result));
		}

		// ── 1. Structure detection ───────────────────────────────────────────
		if (!globalOpts.json && !globalOpts.quiet) {
			console.log(`\n▶ Detecting project structure in ${targetDir}...`);
		}

		const result = await bootstrapApi({
			targetDir,
			platform: options.platform,
			detectOnly: options.detectOnly,
			auto: options.auto,
			dryRun: globalOpts.dryRun ?? false,
			wpRoot: options.wpRoot,
			wpPackages: options.wpPackages?.split(',').map((s: string) => s.trim()),
			packageManager: options.packageManager,
			wpeEnvironments: {
				production: options.wpeProd,
				staging: options.wpeStaging,
				development: options.wpeDev,
			},
			withSatispress: options.withSatispress,
			withWpackagist: options.withWpackagist,
			skipInstall: options.skipInstall,
		});

		if (globalOpts.json || globalOpts.quiet) {
			process.exit(OutputFormatter.getExitCode(result));
		}

		if (!result.success) {
			console.error(`\n✗ Bootstrap failed: ${result.error?.message}`);
			process.exit(1);
		}

		const data = result.data as BootstrapResult;

		if (data.detectOnly) {
			// Pretty-print structure
			const s = data.structure as {
				isMonorepo: boolean;
				packageManager: string;
				wpPackages: Array<{ type: string; name: string; path: string; version: string }>;
				wpRoot: string | null;
				wpeRemotes: Array<{ name: string; install: string }>;
				php: { hasPhpcs: boolean; hasPhpstan: boolean };
				js: { hasBiome: boolean; hasVitest: boolean };
				playground: { hasPlayground: boolean };
				hasAgentKit: boolean;
			};
			console.log('\n── Detected structure ──────────────────────────────────────');
			console.log(`  Monorepo:    ${s.isMonorepo ? 'yes' : 'no'}`);
			console.log(`  Pkg mgr:     ${s.packageManager ?? 'none'}`);
			console.log(`  WP root:     ${s.wpRoot ?? 'none (Playground-only)'}`);
			console.log(`  WP packages: ${s.wpPackages.length}`);
			for (const p of s.wpPackages) {
				console.log(
					`    ${p.type === 'plugin' ? '🔌' : '🎨'} ${p.name ?? p.path} (${p.path}) v${p.version ?? '?'}`
				);
			}
			console.log(`  WPE remotes: ${s.wpeRemotes.length}`);
			for (const r of s.wpeRemotes) {
				console.log(`    → ${r.name} (${r.install})`);
			}
			console.log(`  PHP:         PHPCS=${s.php.hasPhpcs}  PHPStan=${s.php.hasPhpstan}`);
			console.log(`  JS:          Biome=${s.js.hasBiome}  Vitest=${s.js.hasVitest}`);
			console.log(`  Playground:  ${s.playground.hasPlayground ? 'configured' : 'not configured'}`);
			console.log(`  Agent kit:   ${s.hasAgentKit ? 'installed' : 'not installed'}`);
			console.log('');
		} else {
			console.log('\n── Bootstrap complete ──────────────────────────────────────');
			for (const action of data.actions) {
				console.log(`  ${action}`);
			}
			console.log('\nNext steps:');
			console.log('  1. Run: bash tools/setup.sh           (install dev deps + activate hooks)');
			console.log('  2. Run: bash tools/playground/run-playground.sh  (start local WP)');
			console.log('  3. Review AGENTS.md and the generated wp-cli.yml');
			console.log('  4. Add WP Engine secrets to GitHub (see .agents/skills/wp-wpengine/SKILL.md)');
			console.log('');
		}

		process.exit(0);
	});
