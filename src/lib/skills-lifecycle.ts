import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Nine custom skills authored in this repo (marketplace source: skills/, pulled via `npx skills`). */
export const CUSTOM_SKILL_NAMES = [
	'wp-bootstrap',
	'wp-gravity-connect',
	'wp-gravity-forms',
	'wp-gravity-smtp',
	'wp-gravity-stack',
	'wp-gravityview',
	'wp-gravity-wiz',
	'wp-pods',
	'wp-wpengine',
] as const;

/** Upstream skills maintained by WordPress/agent-skills (pulled via `npx skills`). */
export const UPSTREAM_SKILL_NAMES = [
	'blueprint',
	'wordpress-router',
	'wp-abilities-api',
	'wp-abilities-audit',
	'wp-abilities-verify',
	'wp-block-development',
	'wp-block-themes',
	'wp-interactivity-api',
	'wp-performance',
	'wp-phpstan',
	'wp-playground',
	'wp-plugin-development',
	'wp-plugin-directory-guidelines',
	'wp-project-triage',
	'wp-rest-api',
	'wp-wpcli-and-ops',
	'wpds',
] as const;

/**
 * The GitHub repo that hosts our nine custom skills (top-level `skills/` dir,
 * read by the `skills` CLI). This repo IS the marketplace for our skills.
 */
export const OUR_SKILLS_SOURCE = 'kylebrodeur/wordpress-agent-kit';

/** The upstream WordPress skills marketplace. */
export const UPSTREAM_SKILLS_SOURCE = 'WordPress/agent-skills';

/**
 * The `skills` CLI agent identifier whose `skillsDir` is the universal
 * `.agents/skills/` directory. Installing for a universal agent writes real
 * files to `.agents/skills/` only — no per-agent directories (.claude/skills,
 * .cursor/skills, …) are created. All universal agents (Cursor, Copilot,
 * Codex, Pi, …) share this single directory.
 */
const UNIVERSAL_AGENT = 'cursor';

/** Options for installing skills. */
export interface SkillsInstallOptions {
	/** Preview the plan (the two `npx skills add` commands) without executing. */
	dryRun?: boolean;
}

/** Options for updating skills. */
export interface SkillsUpdateOptions {
	/** Preview the plan (the `npx skills update` command) without executing. */
	dryRun?: boolean;
}

/** Outcome of a single `npx skills` invocation. */
export interface SkillsSourceResult {
	/** The source repo (`kylebrodeur/wordpress-agent-kit`, `WordPress/agent-skills`, or `update`). */
	source: string;
	/** The full command that was run (or would be run, in dry-run). */
	command: string;
	/** Whether the command succeeded. */
	success: boolean;
	/** Error message on failure (undefined in dry-run or on success). */
	error?: string;
}

/** Result of a skills install or update operation. */
export interface SkillsResult {
	targetDir: string;
	/** Each `npx skills` step and its outcome. */
	sources: SkillsSourceResult[];
	/** True only if every step succeeded. */
	allSuccess: boolean;
	warnings: string[];
	durationMs: number;
	dryRun: boolean;
}

/**
 * Run an `npx skills` command. Never throws; failures are captured in the result.
 * In a TTY, output streams to the user so they see install progress; otherwise
 * output is captured for error reporting.
 */
function runSkillsCommand(args: string[], cwd: string): SkillsSourceResult {
	const source = args[2] ?? 'update';
	const command = `npx ${args.join(' ')}`;
	try {
		const result = spawnSync('npx', args, {
			cwd,
			encoding: 'utf-8',
			stdio: process.stdout.isTTY ? 'inherit' : 'pipe',
		});
		const success = result.status === 0;
		return {
			source,
			command,
			success,
			error: success
				? undefined
				: result.stderr?.trim() || result.error?.message || `${command} failed`,
		};
	} catch (error: unknown) {
		return {
			source,
			command,
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Install all skills into the target directory's `.agents/skills/`.
 *
 * Runs two `npx skills add` commands (our nine custom skills from this repo,
 * then the seventeen upstream skills from WordPress/agent-skills). Both target
 * the universal `.agents/skills/` directory only. The skills-lock.json written
 * by the `skills` CLI tracks both sources. A failure of one source does not
 * abort the other.
 */
export function installSkills(targetDir: string, options: SkillsInstallOptions = {}): SkillsResult {
	const startTime = Date.now();
	const resolvedTarget = path.resolve(targetDir);
	const dryRun = options.dryRun ?? false;

	const addOur = ['skills', 'add', OUR_SKILLS_SOURCE, '--agent', UNIVERSAL_AGENT, '--yes'];
	const addUpstream = [
		'skills',
		'add',
		UPSTREAM_SKILLS_SOURCE,
		'--agent',
		UNIVERSAL_AGENT,
		'--yes',
	];

	if (dryRun) {
		return {
			targetDir: resolvedTarget,
			sources: [
				{ source: OUR_SKILLS_SOURCE, command: `npx ${addOur.join(' ')}`, success: true },
				{ source: UPSTREAM_SKILLS_SOURCE, command: `npx ${addUpstream.join(' ')}`, success: true },
			],
			allSuccess: true,
			warnings: [],
			durationMs: Date.now() - startTime,
			dryRun: true,
		};
	}

	const sources = [
		runSkillsCommand(addOur, resolvedTarget),
		runSkillsCommand(addUpstream, resolvedTarget),
	];

	return {
		targetDir: resolvedTarget,
		sources,
		allSuccess: sources.every((s) => s.success),
		warnings: [],
		durationMs: Date.now() - startTime,
		dryRun: false,
	};
}

/**
 * Update all installed skills in the target directory's `.agents/skills/`.
 *
 * Runs `npx skills update`, which refreshes every skill tracked in
 * skills-lock.json (both our nine and the seventeen upstream) in place.
 */
export function updateSkills(targetDir: string, options: SkillsUpdateOptions = {}): SkillsResult {
	const startTime = Date.now();
	const resolvedTarget = path.resolve(targetDir);
	const dryRun = options.dryRun ?? false;

	const updateArgs = ['skills', 'update', '--yes'];

	if (dryRun) {
		return {
			targetDir: resolvedTarget,
			sources: [{ source: 'update', command: `npx ${updateArgs.join(' ')}`, success: true }],
			allSuccess: true,
			warnings: [],
			durationMs: Date.now() - startTime,
			dryRun: true,
		};
	}

	const sources = [runSkillsCommand(updateArgs, resolvedTarget)];

	return {
		targetDir: resolvedTarget,
		sources,
		allSuccess: sources.every((s) => s.success),
		warnings: [],
		durationMs: Date.now() - startTime,
		dryRun: false,
	};
}
