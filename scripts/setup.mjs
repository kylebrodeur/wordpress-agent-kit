#!/usr/bin/env node

/**
 * Interactive setup script for WordPress Agent Kit
 * Guides users through customizing the kit for their project
 */

import * as p from '@clack/prompts';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { mapProjectType, mapTechStack, hasConfidentDetection, formatDetectionResults } from './lib/triage-mapper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// TODO: Consider adding commander for proper --help, --version support
// For now, simple filtering is sufficient for the single optional path argument
const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
const targetPath = args[0] || process.cwd();
const targetDir = resolve(targetPath);

async function main() {
	console.clear();

	p.intro('WordPress Agent Kit Setup');

	// Check if target directory exists
	if (!existsSync(targetDir)) {
		const shouldCreate = await p.confirm({
			message: `Target directory doesn't exist: ${targetDir}\nCreate it?`,
			initialValue: true,
		});

		if (p.isCancel(shouldCreate) || !shouldCreate) {
			p.cancel('Setup cancelled.');
			process.exit(0);
		}

		try {
			mkdirSync(targetDir, { recursive: true });
			p.log.success(`Created directory: ${targetDir}`);
		} catch (err) {
			p.log.error(`Failed to create directory: ${err.message}`);
			process.exit(1);
		}
	}

	p.log.info(`Setting up kit in: ${targetDir}`);

	// Check if kit is already installed
	const agentsPath = join(targetDir, 'AGENTS.md');
	const workflowPath = join(targetDir, '.github/instructions/wordpress-workflow.instructions.md');
	
	if (!existsSync(agentsPath)) {
		const shouldInstall = await p.confirm({
			message: 'Kit not found in target repo. Install it first?',
			initialValue: true,
		});

		if (p.isCancel(shouldInstall) || !shouldInstall) {
			p.cancel('Setup cancelled.');
			process.exit(0);
		}

		const s = p.spinner();
		s.start('Installing kit files...');
		
		try {
			execSync(`node ${join(process.cwd(), 'scripts/install.mjs')} "${targetDir}"`, {
				stdio: 'pipe',
			});
			s.stop('Kit installed successfully.');
		} catch (err) {
			s.stop('Installation failed.');
			console.error(err.message);
			process.exit(1);
		}
	}

	// Run project triage BEFORE asking any questions
	let triageResult = null;
	let detectedType = null;
	let detectedTech = [];
	
	// Try to find triage script in target directory first, then fall back to kit source
	let triageScriptPath = join(targetDir, '.github/skills/wp-project-triage/scripts/detect_wp_project.mjs');
	
	if (!existsSync(triageScriptPath)) {
		// Fall back to kit source directory if not found in target
		triageScriptPath = join(process.cwd(), '.github/skills/wp-project-triage/scripts/detect_wp_project.mjs');
	}
	
	if (existsSync(triageScriptPath)) {
		const s = p.spinner();
		s.start('Analyzing project structure...');
		
		try {
			// The triage script uses process.cwd() as repoRoot, so we need to run it from targetDir
			const triageOutput = execSync(`cd "${targetDir}" && node "${triageScriptPath}"`, {
				stdio: 'pipe',
				encoding: 'utf-8',
			});
			
			triageResult = JSON.parse(triageOutput);
			detectedType = mapProjectType(triageResult.project?.primary);
			detectedTech = mapTechStack(triageResult);
			
			s.stop('Project analyzed.');
		} catch (err) {
			s.stop('Auto-detection unavailable.');
			p.log.warn('Could not run project triage. Proceeding with manual setup.');
		}
	} else {
		p.log.info('Project triage not available yet. Using manual setup.');
	}

	// Show detection results and ask for confirmation if confident
	let useDetectedValues = false;
	
	if (triageResult && hasConfidentDetection(detectedType, detectedTech)) {
		p.note(formatDetectionResults(detectedType, detectedTech, triageResult), 'Auto-Detection Results');
		
		const confirmDetection = await p.confirm({
			message: 'Use these detected values?',
			initialValue: true,
		});
		
		if (p.isCancel(confirmDetection)) {
			p.cancel('Setup cancelled.');
			process.exit(0);
		}
		
		useDetectedValues = confirmDetection;
	} else if (triageResult) {
		// Partial detection - will be used as defaults
		if (detectedType || detectedTech.length > 0) {
			p.note(formatDetectionResults(detectedType, detectedTech, triageResult), 'Partial Detection (will be used as defaults)');
		}
	}

	// Project info
	let projectInfo;
	
	if (useDetectedValues) {
		// Skip questions, use detected values
		projectInfo = {
			projectType: detectedType,
			techStack: detectedTech,
		};
		p.log.success('Using auto-detected configuration.');
	} else {
		// Ask questions with detected values as defaults
		projectInfo = await p.group(
			{
				projectType: () =>
					p.select({
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
					}),
				techStack: () =>
					p.multiselect({
						message: 'Select technologies (or skip if unsure):',
						options: [
							{ value: 'gutenberg', label: 'Gutenberg Blocks', hint: 'block.json, @wordpress/blocks' },
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
					}),
			},
			{
				onCancel: () => {
					p.cancel('Setup cancelled.');
					process.exit(0);
				},
			}
		);
		
		// Handle "I'm not sure" selection
		if (projectInfo.projectType === 'unsure') {
			projectInfo.projectType = 'other';
			p.log.info('Using "other" as project type. You can adjust AGENTS.md later.');
		}
	}

	// Customize AGENTS.md
	const customizeAgents = await p.confirm({
		message: 'Customize AGENTS.md with project details?',
		initialValue: true,
	});

	if (p.isCancel(customizeAgents)) {
		p.cancel('Setup cancelled.');
		process.exit(0);
	}

	if (customizeAgents) {
		try {
			let agentsContent = readFileSync(agentsPath, 'utf-8');
			
			// Replace placeholder tech stack
			const techStackList = projectInfo.techStack
				.map(tech => {
					const labels = {
						gutenberg: 'Gutenberg Blocks (@wordpress/blocks)',
						interactivity: 'Interactivity API (data-wp-* directives)',
						'rest-api': 'WordPress REST API (custom endpoints)',
						wpcli: 'WP-CLI (custom commands)',
						composer: 'Composer (PHP dependencies)',
						npm: 'npm/pnpm (JavaScript build process)',
						phpstan: 'PHPStan (static analysis)',
						playground: 'WordPress Playground (testing)',
					};
					return `- ${labels[tech] || tech}`;
				})
				.join('\n');

			// Update AGENTS.md tech stack section (basic replacement)
			agentsContent = agentsContent.replace(
				/\*\*Tooling\*\*: .*/,
				`**Tooling**: ${projectInfo.techStack.includes('composer') ? 'Composer for PHP' : ''}${projectInfo.techStack.includes('npm') ? ', npm/pnpm for JS' : ''}.`
			);

			writeFileSync(agentsPath, agentsContent, 'utf-8');
			p.log.success('Updated AGENTS.md');
		} catch (err) {
			p.log.warn(`Could not update AGENTS.md: ${err.message}`);
		}
	}

	// Workflow instructions
	if (existsSync(workflowPath)) {
		const customizeWorkflow = await p.confirm({
			message: 'Open workflow instructions for manual editing?',
			initialValue: false,
		});

		if (!p.isCancel(customizeWorkflow) && customizeWorkflow) {
			p.note(
				`Edit: ${workflowPath}\n\nAdd your project-specific:\n- Coding standards\n- Git workflow\n- Testing procedures\n- Deployment steps`,
				'Workflow Instructions'
			);
		}
	}

	// Next steps
	p.note(
		`✓ Kit installed and configured\n\n` +
		`Next steps:\n` +
		`1. Review ${agentsPath}\n` +
		`2. Customize .github/prompts/ for your domain\n` +
		`3. Test with: ${projectInfo.projectType === 'plugin' ? '"Create a new settings page"' : '"Generate a block variation"'}\n` +
		`4. Adjust skills loading in AGENTS.md as needed`,
		'Setup Complete'
	);

	p.outro('Your WordPress project is now AI-ready!');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
