import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../utils/paths.js';

/** Nine custom skills vendored with this package. */
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

/** Upstream skills installed via the external `npx skills` CLI. */
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

/** Options for installing skills. */
export interface SkillsInstallOptions {
	/** Preview the plan without executing. */
	dryRun?: boolean;
	/** Force overwrite of existing custom skills. */
	force?: boolean;
	/** Passthrough to `npx skills add --agent`. */
	agent?: string;
	/** Passthrough to `npx skills add --project-dir`. */
	projectDir?: string;
	/** Passthrough to `npx skills add --global`. */
	global?: boolean;
}

/** Options for updating skills. */
export interface SkillsUpdateOptions {
	/** Preview the plan without executing. */
	dryRun?: boolean;
	/** Force overwrite of existing custom skills. */
	force?: boolean;
}

/** Result of a skills install or update operation. */
export interface SkillsResult {
	targetDir: string;
	/** Custom skills that were copied/updated. */
	customSkills: string[];
	/** Whether the upstream `npx skills` step succeeded. */
	upstreamSuccess: boolean;
	/** Human-readable upstream command that was run (or planned). */
	upstreamCommand?: string;
	/** Error message if the upstream step failed. */
	upstreamError?: string;
	/** Warnings for the user (e.g., nested git repos). */
	warnings: string[];
	/** Duration of the operation in milliseconds. */
	durationMs: number;
	/** Whether this was a dry-run preview. */
	dryRun: boolean;
}

/**
 * Detect whether `targetDir` is nested inside an outer git repository.
 * This can confuse `npx skills`, which may install relative to the outer repo root.
 */
function outerRepoAbove(targetDir: string): boolean {
	let current = path.resolve(targetDir);
	const root = path.parse(current).root;

	while (current !== root) {
		const parent = path.dirname(current);
		if (parent === current) break;
		if (fs.existsSync(path.join(parent, '.git'))) {
			return true;
		}
		current = parent;
	}

	return false;
}

/** Copy the nine vendored custom skills into the target .agents/skills/ directory. */
function copyCustomSkills(targetDir: string, force = false): string[] {
	const sourceSkillsDir = path.join(PACKAGE_ROOT, 'skills');
	const targetSkillsDir = path.join(targetDir, '.agents', 'skills');
	const copied: string[] = [];

	if (!fs.existsSync(sourceSkillsDir)) {
		return copied;
	}

	if (!fs.existsSync(targetSkillsDir)) {
		fs.mkdirSync(targetSkillsDir, { recursive: true });
	}

	for (const skillName of fs.readdirSync(sourceSkillsDir)) {
		if (!CUSTOM_SKILL_NAMES.includes(skillName as (typeof CUSTOM_SKILL_NAMES)[number])) {
			continue;
		}

		const src = path.join(sourceSkillsDir, skillName);
		if (!fs.statSync(src).isDirectory()) continue;

		const dest = path.join(targetSkillsDir, skillName);
		if (fs.existsSync(dest) && force) {
			fs.rmSync(dest, { recursive: true, force: true });
		}
		fs.cpSync(src, dest, { recursive: true, force: true });
		copied.push(skillName);
	}

	return copied;
}

/**
 * Run an optional upstream `npx skills` command.
 * Never throws; failures are captured in the returned fields.
 */
function runUpstreamSkillsCommand(
	args: string[],
	cwd: string
): { upstreamCommand: string; upstreamSuccess: boolean; upstreamError?: string } {
	const upstreamCommand = `npx ${args.join(' ')}`;
	let upstreamSuccess = false;
	let upstreamError: string | undefined;

	try {
		const result = spawnSync('npx', args, {
			cwd,
			encoding: 'utf-8',
			stdio: process.stdout.isTTY ? 'inherit' : 'pipe',
		});
		upstreamSuccess = result.status === 0;
		if (!upstreamSuccess) {
			upstreamError = result.stderr?.trim() || result.error?.message || `${upstreamCommand} failed`;
		}
	} catch (error: unknown) {
		upstreamError = error instanceof Error ? error.message : String(error);
	}

	return { upstreamCommand, upstreamSuccess, upstreamError };
}

/** Build the `npx skills add` argument list from passthrough options. */
function buildAddArgs(options: SkillsInstallOptions): string[] {
	const args = ['skills', 'add', 'WordPress/agent-skills', '--yes'];
	if (options.agent) args.push('--agent', options.agent);
	if (options.projectDir) args.push('--project-dir', options.projectDir);
	if (options.global) args.push('--global');
	return args;
}

/**
 * Install skills into the target directory.
 * Copies our nine vendored custom skills, then fetches the 17 upstream skills
 * via `npx skills add WordPress/agent-skills --yes`.
 */
export function installSkills(targetDir: string, options: SkillsInstallOptions = {}): SkillsResult {
	const startTime = Date.now();
	const resolvedTarget = path.resolve(targetDir);
	const dryRun = options.dryRun ?? false;
	const force = options.force ?? false;
	const warnings: string[] = [];

	if (outerRepoAbove(resolvedTarget)) {
		warnings.push(
			`Target directory ${resolvedTarget} appears to be nested inside an outer git repository; \`npx skills\` may install relative to the outer repo root.`
		);
	}

	const upstreamArgs = buildAddArgs(options);

	if (dryRun) {
		return {
			targetDir: resolvedTarget,
			customSkills: [...CUSTOM_SKILL_NAMES],
			upstreamCommand: `npx ${upstreamArgs.join(' ')}`,
			upstreamSuccess: true,
			warnings,
			durationMs: Date.now() - startTime,
			dryRun: true,
		};
	}

	const customSkills = copyCustomSkills(resolvedTarget, force);
	const upstream = runUpstreamSkillsCommand(upstreamArgs, resolvedTarget);

	return {
		targetDir: resolvedTarget,
		customSkills,
		upstreamCommand: upstream.upstreamCommand,
		upstreamSuccess: upstream.upstreamSuccess,
		upstreamError: upstream.upstreamError,
		warnings,
		durationMs: Date.now() - startTime,
		dryRun: false,
	};
}

/**
 * Update installed skills in the target directory.
 * Re-copies the nine vendored custom skills, then runs `npx skills update --yes`.
 */
export function updateSkills(targetDir: string, options: SkillsUpdateOptions = {}): SkillsResult {
	const startTime = Date.now();
	const resolvedTarget = path.resolve(targetDir);
	const dryRun = options.dryRun ?? false;
	const force = options.force ?? false;
	const warnings: string[] = [];

	if (outerRepoAbove(resolvedTarget)) {
		warnings.push(
			`Target directory ${resolvedTarget} appears to be nested inside an outer git repository; \`npx skills\` may update relative to the outer repo root.`
		);
	}
	if (dryRun) {
		return {
			targetDir: resolvedTarget,
			customSkills: [...CUSTOM_SKILL_NAMES],
			upstreamCommand: 'npx skills update --yes',
			upstreamSuccess: true,
			warnings,
			durationMs: Date.now() - startTime,
			dryRun: true,
		};
	}

	const customSkills = copyCustomSkills(resolvedTarget, force);
	const upstream = runUpstreamSkillsCommand(['skills', 'update', '--yes'], resolvedTarget);

	return {
		targetDir: resolvedTarget,
		customSkills,
		upstreamCommand: upstream.upstreamCommand,
		upstreamSuccess: upstream.upstreamSuccess,
		upstreamError: upstream.upstreamError,
		warnings,
		durationMs: Date.now() - startTime,
		dryRun: false,
	};
}
