import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type InstallKitResult, installKit } from '../../src/lib/installer.js';
import { PACKAGE_ROOT } from '../../src/utils/paths.js';

vi.mock('node:fs');

describe('installKit', () => {
	const mockTargetDir = '/test/target';
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		// Mock readdirSync for source directory to prevent safe-update path
		vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);
		// Mock statSync for isDirectory checks
		vi.mocked(fs.statSync).mockReturnValue({
			isDirectory: () => false,
		} as fs.Stats);
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
	});

	it('should log installation message', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(consoleLogSpy).toHaveBeenCalledWith(
			`Installing WordPress Agent Kit (github) into: ${mockTargetDir}`
		);
	});

	it('should create target directory if it does not exist', () => {
		vi.mocked(fs.existsSync).mockImplementation((p) => {
			if (p === mockTargetDir) return false;
			return true;
		});
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.mkdirSync).toHaveBeenCalledWith(mockTargetDir, { recursive: true });
	});

	it('should not create target directory if it exists', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.mkdirSync).not.toHaveBeenCalledWith(mockTargetDir, expect.anything());
	});

	it('should remove existing .github directory before copying', () => {
		const targetGithub = path.join(mockTargetDir, '.github');
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.rmSync).toHaveBeenCalledWith(targetGithub, { recursive: true, force: true });
	});

	it('should copy .github directory to platform folder', () => {
		const targetGithub = path.join(mockTargetDir, '.github');
		const githubPath = path.join(PACKAGE_ROOT, '.github');
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.cpSync).toHaveBeenCalledWith(githubPath, targetGithub, { recursive: true });
	});

	it('should throw error if .github directory does not exist', () => {
		vi.mocked(fs.existsSync).mockImplementation((p) => {
			if (typeof p === 'string' && p.includes('.github') && !p.includes(mockTargetDir)) {
				return false;
			}
			return true;
		});

		expect(() => installKit(mockTargetDir, 'github', { safe: false })).toThrow(
			'Could not find source .github directory.'
		);
	});

	it('should copy AGENTS.template.md if it exists', () => {
		const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
		const targetAgentsTemplate = path.join(mockTargetDir, 'AGENTS.template.md');

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.copyFileSync).toHaveBeenCalledWith(templatePath, targetAgentsTemplate);
	});

	it('should copy AGENTS.md from template if target does not exist', () => {
		const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
		const targetAgents = path.join(mockTargetDir, 'AGENTS.md');

		vi.mocked(fs.existsSync).mockImplementation((p) => {
			if (p === targetAgents) return false;
			return true;
		});
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.copyFileSync).toHaveBeenCalledWith(templatePath, targetAgents);
	});

	it('should copy AGENTS.md from source if template does not exist', () => {
		const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
		const agentsPath = path.join(PACKAGE_ROOT, 'AGENTS.md');
		const targetAgents = path.join(mockTargetDir, 'AGENTS.md');

		vi.mocked(fs.existsSync).mockImplementation((p) => {
			if (p === targetAgents) return false;
			if (p === templatePath) return false;
			return true;
		});
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		expect(fs.copyFileSync).toHaveBeenCalledWith(agentsPath, targetAgents);
	});

	it('should not copy AGENTS.md if it already exists in target', () => {
		const targetAgents = path.join(mockTargetDir, 'AGENTS.md');

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

		installKit(mockTargetDir, 'github', { safe: false });

		const copyFileCallsForAgents = vi
			.mocked(fs.copyFileSync)
			.mock.calls.filter((call) => call[1] === targetAgents);
		expect(copyFileCallsForAgents).toHaveLength(0);
	});

	it('should return result with created files', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.copyFileSync).mockReturnValue(undefined);
		vi.mocked(fs.statSync).mockReturnValue({
			isDirectory: () => false,
		} as fs.Stats);

		const result: InstallKitResult = installKit(mockTargetDir, 'github', { safe: false });

		expect(result).toBeDefined();
		expect(result.platform).toBe('github');
		expect(result.targetDir).toBe(mockTargetDir);
		expect(result.isUpdate).toBe(false);
		// No conflicts on fresh install
		expect(result.conflicts).toBeUndefined();
	});
});
