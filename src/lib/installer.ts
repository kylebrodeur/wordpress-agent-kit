import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../utils/paths.js';

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

/**
 * Installs the WordPress Agent Kit into the specified directory for a given platform.
 * Copies the platform-specific folder and AGENTS.md template.
 *
 * @param {string} targetDir - The directory where the kit should be installed.
 * @param {Platform} platform - The target platform (github, cursor, claude, agent)
 * @returns {Promise<void>}
 */
export async function installKit(targetDir: string, platform: Platform = 'github') {
	const platformFolder = PLATFORM_FOLDERS[platform];
	console.log(`Installing WordPress Agent Kit (${platform}) into: ${targetDir}`);

	if (!fs.existsSync(targetDir)) {
		fs.mkdirSync(targetDir, { recursive: true });
	}

	const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
	const agentsPath = path.join(PACKAGE_ROOT, 'AGENTS.md');
	const sourceGithub = path.join(PACKAGE_ROOT, '.github');

	// Copy platform-specific folder
	const targetPlatform = path.join(targetDir, platformFolder);
	if (fs.existsSync(targetPlatform)) {
		fs.rmSync(targetPlatform, { recursive: true, force: true });
	}
	if (fs.existsSync(sourceGithub)) {
		fs.cpSync(sourceGithub, targetPlatform, { recursive: true });
	} else {
		throw new Error('Could not find source .github directory.');
	}

	// Copy AGENTS.md
	const targetAgentsTemplate = path.join(targetDir, 'AGENTS.template.md');
	if (fs.existsSync(templatePath)) {
		fs.copyFileSync(templatePath, targetAgentsTemplate);
	}

	const targetAgents = path.join(targetDir, 'AGENTS.md');
	if (!fs.existsSync(targetAgents)) {
		if (fs.existsSync(templatePath)) {
			fs.copyFileSync(templatePath, targetAgents);
		} else if (fs.existsSync(agentsPath)) {
			fs.copyFileSync(agentsPath, targetAgents);
		}
	}
}
