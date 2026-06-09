#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const outDir = path.join(PACKAGE_ROOT, 'dist');
const bundlesDir = path.join(outDir, 'bundles');

// Clean and create output directories
if (fs.existsSync(bundlesDir)) {
	fs.rmSync(bundlesDir, { recursive: true, force: true });
}
fs.mkdirSync(bundlesDir, { recursive: true });

// Bundle configurations
const bundles = [
	{ name: 'agent', folder: '.agent' },
	{ name: 'claude', folder: '.claude' },
	{ name: 'github', folder: '.github' },
	{ name: 'cursor', folder: '.cursor' },
];

console.log('Building WordPress Agent Kit bundles...\n');

for (const bundle of bundles) {
	const bundleName = `wordpress-agent-kit-${bundle.name}`;
	const bundleDir = path.join(bundlesDir, bundleName);
	const targetDir = path.join(bundleDir, bundle.folder);

	console.log(`Building ${bundle.name} bundle...`);

	// Create bundle directory structure
	fs.mkdirSync(targetDir, { recursive: true });

	// Copy AGENTS.template.md as AGENTS.md
	const agentsSource = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
	const agentsTarget = path.join(bundleDir, 'AGENTS.md');
	fs.copyFileSync(agentsSource, agentsTarget);

	// Copy skills from vendor/wp-agent-skills/skills
	const skillsSource = path.join(PACKAGE_ROOT, 'vendor', 'wp-agent-skills', 'skills');
	const skillsTarget = path.join(targetDir, 'skills');

	if (fs.existsSync(skillsSource)) {
		copyRecursive(skillsSource, skillsTarget);
	} else {
		console.warn(`  Warning: Skills source not found at ${skillsSource}`);
		console.warn('  Run "pnpm sync:skills" first to download skills.');
	}

	// Copy agents and instructions (skip prompts - those are private)
	const additionalFolders = ['agents', 'instructions'];
	for (const folder of additionalFolders) {
		const source = path.join(PACKAGE_ROOT, '.github', folder);
		const target = path.join(targetDir, folder);

		if (fs.existsSync(source)) {
			copyRecursive(source, target);
		}
	}

	// Create tarball
	const archive = path.join(bundlesDir, `${bundleName}.tar.gz`);

	const tarArgs = ['-czf', archive, '-C', bundlesDir, bundleName];

	const result = spawnSync('tar', tarArgs, {
		stdio: 'pipe',
		shell: process.platform === 'win32',
	});

	if (result.status !== 0) {
		console.error(`  Failed to create ${bundle.name} archive`);
		console.error(result.stderr?.toString());
		process.exit(result.status || 1);
	}

	// Clean up extracted bundle directory
	fs.rmSync(bundleDir, { recursive: true, force: true });

	console.log(`  ✓ Created ${archive}\n`);
}

console.log('All bundles created successfully!');
console.log(`Output directory: ${bundlesDir}`);

function copyRecursive(src: string, dest: string) {
	if (!fs.existsSync(src)) {
		return;
	}

	const stat = fs.statSync(src);

	if (stat.isDirectory()) {
		if (!fs.existsSync(dest)) {
			fs.mkdirSync(dest, { recursive: true });
		}
		const entries = fs.readdirSync(src);
		for (const entry of entries) {
			// Skip system and hidden files
			if (shouldSkipFile(entry)) {
				continue;
			}
			copyRecursive(path.join(src, entry), path.join(dest, entry));
		}
	} else {
		// Skip system files at file level too
		if (shouldSkipFile(path.basename(src))) {
			return;
		}
		fs.copyFileSync(src, dest);
	}
}

function shouldSkipFile(name: string): boolean {
	const skipPatterns = [
		'.DS_Store',
		'.gitkeep',
		'.gitignore',
		'Thumbs.db',
		'desktop.ini',
		'.vscode',
		'.idea',
		'*.swp',
		'*.swo',
		'*~',
	];

	return skipPatterns.some((pattern) => {
		if (pattern.includes('*')) {
			const regex = new RegExp(pattern.replace('*', '.*'));
			return regex.test(name);
		}
		return name === pattern;
	});
}
