import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../utils/paths.js';
import { type UpdateOptions, type UpdateResult, updateKit } from './updater.js';

/** Supported AI tool platforms */
export type Platform = 'github' | 'cursor' | 'claude' | 'agent' | 'pi';

/**
 * Platform-specific folder names
 */
export const PLATFORM_FOLDERS: Record<Platform, string> = {
	github: '.github',
	cursor: '.cursor',
	claude: '.claude',
	agent: '.agent',
	pi: '.pi/agent',
};

/** Options for installKit */
export interface InstallKitOptions {
	targetDir: string;
	platform: Platform;
	/** Force overwrite of user-modified files (only applies when kit is already installed) */
	force?: boolean;
	/** Create backup before overwriting (default: true) */
	backup?: boolean;
	/** Use safe update logic instead of full replacement (default: true when kit is installed) */
	safe?: boolean;
}

/** Result of installKit */
export interface InstallKitResult {
	targetDir: string;
	platform: Platform;
	filesCreated: string[];
	filesSkipped: string[];
	errors: string[];
	isUpdate: boolean;
	backupDir: string | null;
	conflicts?: string[];
}

/**
 * Installs the WordPress Agent Kit into the specified directory for a given platform.
 * If the kit is already installed, uses safe update logic to preserve user modifications.
 *
 * Installation layout:
 * - .agents/skills/          — Universal skills (AgentSkills.io convention)
 * - .github/ (or .pi/agent/, etc.) — Platform-specific agents, instructions, prompts
 * - AGENTS.md                — Project-level agent instructions
 * - AGENTS.template.md       — Template reference for future updates
 *
 * @param targetDir - The directory where the kit should be installed.
 * @param platform - The target platform (github, cursor, claude, agent, pi)
 * @returns InstallKitResult with details of what was created/skipped
 */
export function installKit(
	targetDir: string,
	platform: Platform = 'github',
	options: Omit<InstallKitOptions, 'targetDir' | 'platform'> = {}
): InstallKitResult {
	const { force = false, backup = true, safe = true } = options;

	// Check if kit is already installed
	const isInstalled = isKitAlreadyInstalled(targetDir, platform);

	// Use safe update for existing installations
	if (isInstalled && safe) {
		return safeUpdateInstall(targetDir, platform, { force, backup });
	}

	// Fresh install or fallback to full replacement
	return fullInstall(targetDir, platform, force);
}

/**
 * Migrate legacy skill directories to the universal .agents/skills/ convention.
 * Detects skills in platform-specific directories (e.g., .github/skills/, .pi/agent/skills/)
 * and moves them to .agents/skills/ if they don't already exist there.
 * Returns lists of migrated and removed skill names.
 */
function migrateLegacySkills(
	targetDir: string,
	platform: Platform
): {
	migrated: string[];
	removed: string[];
} {
	const platformFolder = PLATFORM_FOLDERS[platform];
	const legacySkillsDir = path.join(targetDir, platformFolder, 'skills');
	const universalSkillsDir = path.join(targetDir, '.agents', 'skills');
	const migrated: string[] = [];
	const removed: string[] = [];

	if (!fs.existsSync(legacySkillsDir)) {
		return { migrated, removed };
	}

	// Ensure universal directory exists
	if (!fs.existsSync(universalSkillsDir)) {
		fs.mkdirSync(universalSkillsDir, { recursive: true });
	}

	for (const skillName of fs.readdirSync(legacySkillsDir)) {
		const srcPath = path.join(legacySkillsDir, skillName);
		const destPath = path.join(universalSkillsDir, skillName);

		if (!fs.statSync(srcPath).isDirectory()) continue;

		if (!fs.existsSync(destPath)) {
			// Migrate: copy to universal location
			fs.cpSync(srcPath, destPath, { recursive: true });
			migrated.push(skillName);
		} else {
			// Already exists in universal location — just remove from legacy
			removed.push(skillName);
		}

		// Remove from legacy location
		fs.rmSync(srcPath, { recursive: true, force: true });
	}

	// Remove the legacy skills directory if empty
	const remaining = fs.readdirSync(legacySkillsDir);
	if (remaining.length === 0) {
		fs.rmSync(legacySkillsDir, { recursive: true, force: true });
	}

	return { migrated, removed };
}

/**
 * Check if kit is already installed for a platform.
 */
function isKitAlreadyInstalled(targetDir: string, platform: Platform): boolean {
	const platformFolder = PLATFORM_FOLDERS[platform];
	const targetPlatform = path.join(targetDir, platformFolder);
	return fs.existsSync(targetPlatform);
}

/**
 * Full install (fresh or force-replace).
 * Only used when no existing installation is detected or safe=false.
 */
function fullInstall(targetDir: string, platform: Platform, _force: boolean): InstallKitResult {
	const platformFolder = PLATFORM_FOLDERS[platform];

	if (!fs.existsSync(targetDir)) {
		fs.mkdirSync(targetDir, { recursive: true });
	}

	const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
	const agentsPath = path.join(PACKAGE_ROOT, 'AGENTS.md');
	const sourceGithub = path.join(PACKAGE_ROOT, '.github');
	const filesCreated: string[] = [];
	const filesSkipped: string[] = [];

	// Copy platform-specific folder (agents, instructions — NOT skills)
	const targetPlatform = path.join(targetDir, platformFolder);
	if (fs.existsSync(targetPlatform)) {
		fs.rmSync(targetPlatform, { recursive: true, force: true });
	}
	if (fs.existsSync(sourceGithub)) {
		fs.cpSync(sourceGithub, targetPlatform, { recursive: true });
		// Remove skills from platform dir — skills go to .agents/skills/ instead
		const platformSkills = path.join(targetPlatform, 'skills');
		if (fs.existsSync(platformSkills)) {
			fs.rmSync(platformSkills, { recursive: true, force: true });
		}
	} else {
		throw new Error('Could not find source .github directory.');
	}

	// Collect created files (excluding skills which are in .agents/)
	const collectFiles = (dir: string, prefix: string): void => {
		if (!fs.existsSync(dir)) return;
		const entries = fs.readdirSync(dir);
		for (const entry of entries) {
			const fullPath = path.join(dir, entry);
			const stat = fs.statSync(fullPath);
			if (stat.isDirectory()) {
				collectFiles(fullPath, path.join(prefix, entry));
			} else {
				filesCreated.push(path.join(prefix, entry));
			}
		}
	};
	collectFiles(targetPlatform, platformFolder);

	// Migrate legacy skills from platform-specific dir to .agents/skills/
	const migrationResult = migrateLegacySkills(targetDir, platform);
	for (const skill of migrationResult.migrated) {
		filesCreated.push(`.agents/skills/${skill} (migrated from ${platformFolder}/skills/)`);
	}
	for (const skill of migrationResult.removed) {
		filesSkipped.push(`.agents/skills/${skill} (already existed, removed legacy copy)`);
	}

	// Copy AGENTS.md template
	const targetAgentsTemplate = path.join(targetDir, 'AGENTS.template.md');
	if (fs.existsSync(templatePath)) {
		fs.copyFileSync(templatePath, targetAgentsTemplate);
		filesCreated.push('AGENTS.template.md');
	}

	// Copy AGENTS.md (only if it doesn't already exist)
	const targetAgents = path.join(targetDir, 'AGENTS.md');
	if (!fs.existsSync(targetAgents)) {
		if (fs.existsSync(templatePath)) {
			fs.copyFileSync(templatePath, targetAgents);
			filesCreated.push('AGENTS.md');
		} else if (fs.existsSync(agentsPath)) {
			fs.copyFileSync(agentsPath, targetAgents);
			filesCreated.push('AGENTS.md');
		}
	} else {
		filesSkipped.push('AGENTS.md (already exists, preserved)');
	}

	return {
		targetDir,
		platform,
		filesCreated,
		filesSkipped,
		errors: [],
		isUpdate: false,
		backupDir: null,
	};
}

/**
 * Safe update install using the updater module.
 */
function safeUpdateInstall(
	targetDir: string,
	platform: Platform,
	options: { force?: boolean; backup?: boolean }
): InstallKitResult {
	const updateOptions: UpdateOptions = {
		targetDir,
		platform,
		force: options.force ?? false,
		backup: options.backup ?? true,
	};

	const result: UpdateResult = updateKit(updateOptions);

	// Handle AGENTS.md separately (not part of the platform folder)
	const filesSkipped: string[] = [];
	const filesCreated = [...result.created];

	const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
	const targetAgentsTemplate = path.join(targetDir, 'AGENTS.template.md');
	if (fs.existsSync(templatePath)) {
		fs.copyFileSync(templatePath, targetAgentsTemplate);
		// Don't add template to created list as it's always overwritten
	}

	const targetAgents = path.join(targetDir, 'AGENTS.md');
	if (!fs.existsSync(targetAgents)) {
		fs.copyFileSync(templatePath, targetAgents);
		filesCreated.push('AGENTS.md (from template)');
	} else {
		filesSkipped.push('AGENTS.md (preserved)');
	}

	return {
		targetDir,
		platform,
		filesCreated: [...result.created, ...result.updated].map((f) =>
			path.join(PLATFORM_FOLDERS[platform], f)
		),
		filesSkipped: [
			...filesSkipped,
			...result.skipped.map((f) => {
				const filePath = path.join(PLATFORM_FOLDERS[platform], f);
				return `${filePath} (skipped - not tracked or user modified)`;
			}),
		],
		conflicts: result.conflicts.map((f) => {
			const filePath = path.join(PLATFORM_FOLDERS[platform], f);
			return `${filePath} (conflict - user modified, use --force to overwrite)`;
		}),
		errors: [],
		isUpdate: true,
		backupDir: result.backupDir,
	};
}
