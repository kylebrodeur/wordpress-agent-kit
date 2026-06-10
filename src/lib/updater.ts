/**
 * Safe update logic for WordPress Agent Kit installations.
 * Tracks file origins and detects user modifications to avoid overwriting custom work.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../utils/paths.js';
import type { Platform } from './installer.js';
import { PLATFORM_FOLDERS } from './installer.js';

/** Record of a file tracked in the manifest */
interface ManifestEntry {
	/** Relative path within the platform folder */
	path: string;
	/** SHA-256 hash of the original content as installed */
	hash: string;
}

/** Manifest stored at project root */
interface KitManifest {
	version: string;
	platform: Platform;
	installedAt: string;
	files: ManifestEntry[];
}

/** Options for safe update */
export interface UpdateOptions {
	targetDir: string;
	platform: Platform;
	/** Overwrite even if user modified (default: false) */
	force?: boolean;
	/** Create backup of files before overwriting (default: true) */
	backup?: boolean;
}

/** Individual file change */
export interface FileChange {
	relativePath: string;
	action: 'created' | 'updated' | 'skipped' | 'conflict' | 'unchanged';
	reason?: string;
}

/** Result of safe update */
export interface UpdateResult {
	targetDir: string;
	platform: Platform;
	changes: FileChange[];
	created: string[];
	updated: string[];
	skipped: string[];
	conflicts: string[];
	backupDir: string | null;
	manifestUpdated: boolean;
}

/** Get the platform folder for a target */
export function getPlatformTarget(targetDir: string, platform: Platform): string {
	const folder = PLATFORM_FOLDERS[platform];
	return path.join(targetDir, folder);
}

/** Get the manifest file path */
function getManifestPath(targetDir: string, platform: Platform): string {
	return path.join(targetDir, `.wp-agent-kit-manifest.${platform}.json`);
}

/** Hash a file's content */
function hashFile(filePath: string): string {
	const content = fs.readFileSync(filePath);
	return crypto.createHash('sha256').update(content).digest('hex');
}

/** Walk a directory recursively, returning relative paths */
function walkDir(dir: string): string[] {
	const result: string[] = [];
	if (!fs.existsSync(dir)) return result;

	const entries = fs.readdirSync(dir);
	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		const stat = fs.statSync(fullPath);
		if (stat.isDirectory()) {
			const subPaths = walkDir(fullPath);
			for (const sub of subPaths) {
				result.push(path.join(entry, sub));
			}
		} else {
			result.push(entry);
		}
	}
	return result;
}

/** Load existing manifest if present */
export function loadManifest(targetDir: string, platform: Platform): KitManifest | null {
	const manifestPath = getManifestPath(targetDir, platform);
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
	} catch {
		return null;
	}
}

/** Save manifest */
function saveManifest(targetDir: string, platform: Platform, manifest: KitManifest): void {
	const manifestPath = getManifestPath(targetDir, platform);
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/** Create a backup of target files before overwriting */
function createBackup(targetDir: string, platform: Platform, files: string[]): string | null {
	if (files.length === 0) return null;

	const platformFolder = PLATFORM_FOLDERS[platform];
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupDir = path.join(targetDir, `.wp-agent-kit-backup-${timestamp}`);

	for (const file of files) {
		const srcPath = path.join(targetDir, platformFolder, file);
		const destPath = path.join(backupDir, platformFolder, file);

		if (fs.existsSync(srcPath)) {
			fs.mkdirSync(path.dirname(destPath), { recursive: true });
			fs.copyFileSync(srcPath, destPath);
		}
	}

	return backupDir;
}

/**
 * Compute file changes between current state and what would be installed.
 */
export function computeChanges(
	targetDir: string,
	platform: Platform,
	force: boolean
): FileChange[] {
	const existingManifest = loadManifest(targetDir, platform);
	const sourceDir = path.join(PACKAGE_ROOT, '.github');
	const targetPlatform = getPlatformTarget(targetDir, platform);
	const changes: FileChange[] = [];

	const sourceFiles = walkDir(sourceDir);
	const targetFiles = fs.existsSync(targetPlatform) ? walkDir(targetPlatform) : [];

	// Build lookup of known files from manifest
	const knownFiles = new Map<string, string>();
	if (existingManifest) {
		for (const entry of existingManifest.files) {
			knownFiles.set(entry.path, entry.hash);
		}
	}

	// Process source files
	for (const sourceFile of sourceFiles) {
		const targetPath = path.join(targetPlatform, sourceFile);
		const sourceHash = hashFile(path.join(sourceDir, sourceFile));

		if (!fs.existsSync(targetPath)) {
			changes.push({
				relativePath: sourceFile,
				action: 'created',
				reason: 'New file from kit',
			});
			continue;
		}

		const targetHash = hashFile(targetPath);

		if (sourceHash === targetHash) {
			// Identical - no change needed
			changes.push({
				relativePath: sourceFile,
				action: 'unchanged',
				reason: 'Content identical',
			});
		} else if (knownFiles.has(sourceFile)) {
			const manifestHash = knownFiles.get(sourceFile) as string;
			if (targetHash === manifestHash) {
				// Same as original from manifest, safe to update
				changes.push({
					relativePath: sourceFile,
					action: 'updated',
					reason: 'Safe update (no user modification)',
				});
			} else if (force) {
				changes.push({
					relativePath: sourceFile,
					action: 'updated',
					reason: 'Force update (overwriting user modification)',
				});
			} else {
				changes.push({
					relativePath: sourceFile,
					action: 'conflict',
					reason: 'User modified; skipped. Use --force to overwrite.',
				});
			}
		} else {
			// Not in manifest (pre-manifest install or manual add), but exists
			if (force) {
				changes.push({
					relativePath: sourceFile,
					action: 'updated',
					reason: 'Force update (file not tracked in manifest)',
				});
			} else {
				changes.push({
					relativePath: sourceFile,
					action: 'skipped',
					reason: 'File exists but not tracked; skipped. Use --force to overwrite.',
				});
			}
		}
	}

	// Note user-added files not in source (these are kept, not reported as changes)
	const sourceSet = new Set(sourceFiles);
	for (const targetFile of targetFiles) {
		if (!sourceSet.has(targetFile)) {
			changes.push({
				relativePath: targetFile,
				action: 'unchanged',
				reason: 'User-added file (preserved)',
			});
		}
	}

	return changes;
}

/**
 * Perform a safe update of the WordPress Agent Kit in the target directory.
 * Compares files against manifest and source to avoid overwriting user modifications.
 */
export function updateKit(options: UpdateOptions): UpdateResult {
	const { targetDir, platform, force = false, backup = true } = options;
	const changes = computeChanges(targetDir, platform, force);
	const sourceDir = path.join(PACKAGE_ROOT, '.github');
	const targetPlatform = getPlatformTarget(targetDir, platform);

	const created: string[] = [];
	const updated: string[] = [];
	const skipped: string[] = [];
	const conflicts: string[] = [];

	// Determine which files will be overwritten (for backup)
	const filesToBackup = changes.filter((c) => c.action === 'updated').map((c) => c.relativePath);

	let backupDir: string | null = null;
	if (backup && filesToBackup.length > 0) {
		backupDir = createBackup(targetDir, platform, filesToBackup);
	}

	// Apply changes
	for (const change of changes) {
		const sourcePath = path.join(sourceDir, change.relativePath);
		const targetPath = path.join(targetPlatform, change.relativePath);

		switch (change.action) {
			case 'created':
				fs.mkdirSync(path.dirname(targetPath), { recursive: true });
				fs.copyFileSync(sourcePath, targetPath);
				created.push(change.relativePath);
				break;
			case 'updated':
				fs.mkdirSync(path.dirname(targetPath), { recursive: true });
				fs.copyFileSync(sourcePath, targetPath);
				updated.push(change.relativePath);
				break;
			case 'skipped':
				skipped.push(change.relativePath);
				break;
			case 'conflict':
				conflicts.push(change.relativePath);
				break;
			// 'unchanged' - do nothing
		}
	}

	// Build and save new manifest
	const newManifest: KitManifest = {
		version: getPackageVersion(),
		platform,
		installedAt: new Date().toISOString(),
		files: walkDir(sourceDir).map((file) => ({
			path: file,
			hash: hashFile(path.join(sourceDir, file)),
		})),
	};
	saveManifest(targetDir, platform, newManifest);

	return {
		targetDir,
		platform,
		changes,
		created,
		updated,
		skipped,
		conflicts,
		backupDir,
		manifestUpdated: true,
	};
}

/** Get current package version */
function getPackageVersion(): string {
	try {
		const pkgPath = path.join(PACKAGE_ROOT, 'package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		return pkg.version;
	} catch {
		return 'unknown';
	}
}

/**
 * Check if a directory has a WordPress Agent Kit installation.
 */
export function isKitInstalled(targetDir: string, platform: Platform): boolean {
	const manifestPath = getManifestPath(targetDir, platform);
	if (fs.existsSync(manifestPath)) return true;

	const platformFolder = PLATFORM_FOLDERS[platform];
	const targetPlatform = path.join(targetDir, platformFolder);
	return fs.existsSync(targetPlatform);
}
