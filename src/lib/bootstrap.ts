/**
 * Bootstrap API — detects WordPress project structure and scaffolds
 * the full wp-agent-kit system (agent kit, Composer, WP-CLI, Playground,
 * WP Engine CI/CD, git hooks). Supports single plugins/themes and monorepos.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../utils/exit-codes.js';
import { type CliResult, OutputFormatter } from '../utils/output.js';
import { PACKAGE_ROOT } from '../utils/paths.js';
import { type Platform, installKit } from './installer.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WpPackage {
	type: 'plugin' | 'theme';
	path: string;
	name: string | null;
	version: string | null;
	slug: string;
	mainFile?: string;
	hasComposer: boolean;
	hasTests: boolean;
	hasPest: boolean;
}

export interface WpeRemote {
	name: string;
	url: string;
	environment: string | null;
	install: string | null;
}

export interface DetectedStructure {
	repoRoot: string;
	isMonorepo: boolean;
	packageManager: string | null;
	jsWorkspaces: string[];
	wpPackages: WpPackage[];
	wpRoot: string | null;
	wpRootExists: boolean;
	playgroundOnly: boolean;
	wpeRemotes: WpeRemote[];
	hasWpeRemote: boolean;
	php: {
		hasComposer: boolean;
		hasPhpcs: boolean;
		hasWpcs: boolean;
		hasPhpstan: boolean;
		hasPhpstanWp: boolean;
		hasPest: boolean;
		phpcsConfig: string | null;
		phpstanConfig: string | null;
		composerScripts: string[];
	};
	js: {
		hasBiome: boolean;
		biomeVersion: string | null;
		hasEslint: boolean;
		hasPrettier: boolean;
		hasVitest: boolean;
		hasJest: boolean;
		hasPlaywright: boolean;
		hasWpScripts: boolean;
		rootScripts: string[];
	};
	playground: {
		hasPlayground: boolean;
		blueprints: string[];
		scripts: string[];
		hasWpEnv: boolean;
	};
	satispress: { configured: boolean; url: string | null; hasAuthJson: boolean };
	wpackagist: boolean;
	gitHooks: string | null;
	hasAgentKit: boolean;
	hasAgentsDir: boolean;
	hasAgentsMd: boolean;
	gitBranch: string | null;
	gitRemotes: Array<{ name: string; url: string }>;
}

export interface BootstrapOptions {
	targetDir: string;
	platform?: Platform;
	detectOnly?: boolean;
	auto?: boolean;
	dryRun?: boolean;
	wpRoot?: string;
	wpPackages?: string[];
	packageManager?: string;
	wpeEnvironments?: {
		production?: string;
		staging?: string;
		development?: string;
	};
	withSatispress?: string;
	withWpackagist?: boolean;
	skipInstall?: boolean;
}

export interface BootstrapResult {
	structure: DetectedStructure;
	detectOnly: boolean;
	actions: string[];
	filesCreated: string[];
	dryRun: boolean;
}

// ── Detection ─────────────────────────────────────────────────────────────

/**
 * Run the detect-structure.mjs probe script and return the parsed result.
 */
export function detectStructure(targetDir: string): DetectedStructure | null {
	const detectScript = path.join(
		PACKAGE_ROOT,
		'.agents',
		'skills',
		'wp-bootstrap',
		'scripts',
		'detect-structure.mjs'
	);

	if (!fs.existsSync(detectScript)) {
		// Fallback: minimal detection without the full script
		return minimalDetect(targetDir);
	}

	const result = spawnSync('node', [detectScript, targetDir], {
		encoding: 'utf-8',
		cwd: targetDir,
	});

	if (result.status !== 0) {
		return minimalDetect(targetDir);
	}

	try {
		return JSON.parse(result.stdout.trim()) as DetectedStructure;
	} catch {
		return minimalDetect(targetDir);
	}
}

/** Minimal structure detection without the full probe script */
function minimalDetect(targetDir: string): DetectedStructure {
	const exists = (...parts: string[]) => fs.existsSync(path.join(targetDir, ...parts));
	const pm = exists('pnpm-lock.yaml')
		? 'pnpm'
		: exists('yarn.lock')
			? 'yarn'
			: exists('package.json')
				? 'npm'
				: null;

	return {
		repoRoot: targetDir,
		isMonorepo: false,
		packageManager: pm,
		jsWorkspaces: [],
		wpPackages: [],
		wpRoot: exists('wp-config.php') ? '.' : null,
		wpRootExists: exists('wp-config.php'),
		playgroundOnly: !exists('wp-config.php'),
		wpeRemotes: [],
		hasWpeRemote: false,
		php: {
			hasComposer: exists('composer.json'),
			hasPhpcs: exists('vendor/bin/phpcs'),
			hasWpcs: false,
			hasPhpstan: exists('vendor/bin/phpstan'),
			hasPhpstanWp: false,
			hasPest: false,
			phpcsConfig: exists('phpcs.xml.dist') ? 'phpcs.xml.dist' : null,
			phpstanConfig: exists('phpstan.neon.dist') ? 'phpstan.neon.dist' : null,
			composerScripts: [],
		},
		js: {
			hasBiome: exists('biome.json'),
			biomeVersion: null,
			hasEslint: exists('eslint.config.mjs') || exists('.eslintrc.js'),
			hasPrettier: exists('.prettierrc'),
			hasVitest: false,
			hasJest: false,
			hasPlaywright: exists('playwright.config.ts') || exists('playwright.config.js'),
			hasWpScripts: false,
			rootScripts: [],
		},
		playground: {
			hasPlayground: exists('tools/playground') || exists('playground'),
			blueprints: [],
			scripts: [],
			hasWpEnv: exists('.wp-env.json'),
		},
		satispress: { configured: false, url: null, hasAuthJson: false },
		wpackagist: false,
		gitHooks: exists('.githooks') ? '.githooks' : exists('.husky') ? '.husky' : null,
		hasAgentKit: exists('.wp-agent-kit-manifest.github.json') || exists('.agents', 'skills'),
		hasAgentsDir: exists('.agents'),
		hasAgentsMd: exists('AGENTS.md'),
		gitBranch: null,
		gitRemotes: [],
	};
}

// ── Scaffolding helpers ────────────────────────────────────────────────────

function writeIfMissing(filePath: string, content: string, dryRun: boolean): boolean {
	if (fs.existsSync(filePath)) return false;
	if (!dryRun) {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content, 'utf-8');
	}
	return true;
}

function scaffoldWpCliYml(
	targetDir: string,
	structure: DetectedStructure,
	wpeEnvironments: BootstrapOptions['wpeEnvironments'],
	dryRun: boolean
): string[] {
	const wpCliPath = path.join(targetDir, 'wp-cli.yml');
	if (fs.existsSync(wpCliPath)) return [];

	const localPath =
		structure.wpRoot && structure.wpRoot !== '.' ? `path: ./${structure.wpRoot}\n\n` : '';
	const prod = wpeEnvironments?.production;
	const staging = wpeEnvironments?.staging;
	const dev = wpeEnvironments?.development;

	const content = [
		'# wp-cli.yml — WP-CLI targeting. Commit to repo.',
		'# Get exact git push URLs from: https://my.wpengine.com/installs/<ENV>/git_push',
		'',
		localPath,
		prod
			? `@production:\n  ssh: ${prod}@${prod}.ssh.wpengine.net\n  path: /home/wpe-user/sites/${prod}\n`
			: '',
		staging
			? `\n@staging:\n  ssh: ${staging}@${staging}.ssh.wpengine.net\n  path: /home/wpe-user/sites/${staging}\n`
			: '',
		dev
			? `\n@development:\n  ssh: ${dev}@${dev}.ssh.wpengine.net\n  path: /home/wpe-user/sites/${dev}\n`
			: '',
	].join('');

	if (writeIfMissing(wpCliPath, content, dryRun)) {
		return ['wp-cli.yml'];
	}
	return [];
}

function scaffoldGitHooks(targetDir: string, dryRun: boolean): string[] {
	const hooksDir = path.join(targetDir, '.githooks');
	const prePush = path.join(hooksDir, 'pre-push');
	const readme = path.join(hooksDir, 'README.md');
	const created: string[] = [];

	const prePushContent = `#!/usr/bin/env bash
# .githooks/pre-push — CI gate before every push.
# Activate once: git config core.hooksPath .githooks
# Generated by wp-agent-kit bootstrap.
set -uo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

# Run the CI gate (PHP + JS/TS)
GATE_SCRIPT=".agents/skills/wp-bootstrap/scripts/ci-gate.sh"
if [ -f "$GATE_SCRIPT" ]; then
  bash "$GATE_SCRIPT" || exit 1
else
  echo "⚠  CI gate script not found at $GATE_SCRIPT" >&2
  echo "   Run wp-agent-kit install to set up .agents/skills/" >&2
fi
`;

	const readmeContent = `# Git hooks (versioned)

Activate once per clone:
\`\`\`bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
\`\`\`
Or run: \`pnpm run setup\` / \`bash tools/setup.sh\` if that exists.

## What runs

- **pre-push**: PHP gate (php -l + phpcs + phpstan) + JS gate (biome check).
  Fix failures with \`composer fix && composer lint\` (PHP) or \`npx biome check --write .\` (JS).
  --no-verify is not allowed on deploy branches; CI will catch it anyway.
`;

	if (!fs.existsSync(hooksDir) && !dryRun) {
		fs.mkdirSync(hooksDir, { recursive: true });
	}
	if (writeIfMissing(prePush, prePushContent, dryRun)) {
		if (!dryRun) fs.chmodSync(prePush, 0o755);
		created.push('.githooks/pre-push');
	}
	if (writeIfMissing(readme, readmeContent, dryRun)) {
		created.push('.githooks/README.md');
	}
	return created;
}

function scaffoldSetupSh(targetDir: string, dryRun: boolean): string[] {
	const toolsDir = path.join(targetDir, 'tools');
	const setupSh = path.join(toolsDir, 'setup.sh');
	if (fs.existsSync(setupSh)) return [];

	const content = `#!/usr/bin/env bash
# tools/setup.sh — one-command dev setup. Idempotent: safe to re-run.
# Generated by wp-agent-kit bootstrap.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bash "$root/.agents/skills/wp-bootstrap/scripts/bootstrap.sh" "$@"
`;
	if (writeIfMissing(setupSh, content, dryRun)) {
		if (!dryRun) fs.chmodSync(setupSh, 0o755);
		return ['tools/setup.sh'];
	}
	return [];
}

function scaffoldBootstrapConfig(
	targetDir: string,
	structure: DetectedStructure,
	options: BootstrapOptions,
	dryRun: boolean
): string[] {
	const configPath = path.join(targetDir, 'wp-bootstrap.config.json');
	if (fs.existsSync(configPath)) return [];

	const config = {
		packageManager: options.packageManager ?? structure.packageManager ?? 'npm',
		jsWorkspaces: structure.jsWorkspaces,
		phpDirs: ['.', ...structure.wpPackages.filter((p) => p.hasComposer).map((p) => p.path)],
		hooksDir: '.githooks',
		wpPackages: structure.wpPackages.map((p) => ({
			path: p.path,
			type: p.type,
			slug: p.slug,
			...(p.mainFile ? { mainFile: p.mainFile } : {}),
		})),
		...(structure.wpeRemotes.length > 0 || options.wpeEnvironments
			? {
					wpeEnvironments: {
						...(options.wpeEnvironments?.production
							? {
									production: { install: options.wpeEnvironments.production },
								}
							: {}),
						...(options.wpeEnvironments?.staging
							? {
									staging: { install: options.wpeEnvironments.staging },
								}
							: {}),
						...(options.wpeEnvironments?.development
							? {
									development: { install: options.wpeEnvironments.development },
								}
							: {}),
					},
				}
			: {}),
	};

	if (
		writeIfMissing(
			configPath,
			`${JSON.stringify(config, null, 2)}
`,
			dryRun
		)
	) {
		return ['wp-bootstrap.config.json'];
	}
	return [];
}

// ── Main API ───────────────────────────────────────────────────────────────

export async function bootstrapApi(options: BootstrapOptions): Promise<CliResult<BootstrapResult>> {
	const formatter = new OutputFormatter('json', 'bootstrap', '0.0.0');
	const {
		targetDir,
		platform = 'github',
		detectOnly = false,
		dryRun = false,
		skipInstall = false,
	} = options;

	try {
		// 1. Detect structure
		const structure = detectStructure(targetDir);
		if (!structure) {
			return formatter.fail({
				code: 'DETECT_FAILED',
				message: 'Failed to detect project structure',
				exitCode: ExitCode.ERROR,
			});
		}

		// Apply overrides
		if (options.wpRoot) structure.wpRoot = options.wpRoot;
		if (options.packageManager) structure.packageManager = options.packageManager;

		if (detectOnly) {
			return formatter.success({
				structure,
				detectOnly: true,
				actions: [],
				filesCreated: [],
				dryRun,
			});
		}

		const actions: string[] = [];
		const filesCreated: string[] = [];

		// 2. Install agent kit
		if (!skipInstall && !structure.hasAgentKit) {
			if (!dryRun) {
				installKit(targetDir, platform, { safe: true, backup: false });
			}
			actions.push(`✅ wp-agent-kit installed (platform: ${platform})`);
			filesCreated.push(
				'.agents/skills/',
				`${platform === 'github' ? '.github' : `.${platform}`}/`
			);
		} else if (structure.hasAgentKit) {
			actions.push('✓ wp-agent-kit already installed');
		}

		// 3. Generate wp-cli.yml
		const wpeEnvs = options.wpeEnvironments;
		const hasWpeConfig = wpeEnvs?.production || wpeEnvs?.staging || wpeEnvs?.development;
		if (hasWpeConfig || structure.wpRoot) {
			const created = scaffoldWpCliYml(targetDir, structure, wpeEnvs, dryRun);
			if (created.length > 0) {
				actions.push('✅ wp-cli.yml created');
				filesCreated.push(...created);
			} else {
				actions.push('✓ wp-cli.yml already exists');
			}
		}

		// 4. Git hooks
		const hookFiles = scaffoldGitHooks(targetDir, dryRun);
		if (hookFiles.length > 0) {
			actions.push('✅ .githooks/pre-push created');
			filesCreated.push(...hookFiles);
			if (!dryRun) {
				// Activate hooks
				spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: targetDir });
			}
			actions.push('✅ git config core.hooksPath .githooks');
		}

		// 5. tools/setup.sh
		const setupFiles = scaffoldSetupSh(targetDir, dryRun);
		if (setupFiles.length > 0) {
			actions.push('✅ tools/setup.sh created');
			filesCreated.push(...setupFiles);
		}

		// 6. wp-bootstrap.config.json
		const configFiles = scaffoldBootstrapConfig(targetDir, structure, options, dryRun);
		if (configFiles.length > 0) {
			actions.push('✅ wp-bootstrap.config.json created');
			filesCreated.push(...configFiles);
		}

		// 7. Report what still needs manual setup
		if (!structure.php.hasComposer) {
			actions.push(
				'⚠  composer.json missing — run: composer init (see wp-bootstrap skill references/composer-setup.md)'
			);
		}
		if (!structure.js.hasBiome) {
			actions.push(
				'⚠  biome.json missing — run: npm install --save-dev @biomejs/biome && npx biome init'
			);
		}
		if (!structure.playground.hasPlayground) {
			actions.push('⚠  Playground not configured — run playground-start.sh to get started');
		}
		if (!structure.hasWpeRemote && !hasWpeConfig) {
			actions.push(
				'⚠  No WP Engine remotes — add --wpe-prod/--wpe-staging/--wpe-dev or configure manually'
			);
		}

		return formatter.success({
			structure,
			detectOnly: false,
			actions,
			filesCreated,
			dryRun,
		});
	} catch (error: unknown) {
		const err = error as Error & { exitCode?: ExitCode };
		return formatter.fail({
			code: 'BOOTSTRAP_FAILED',
			message: err.message || 'Bootstrap failed',
			exitCode: err.exitCode ?? ExitCode.ERROR,
		});
	}
}
