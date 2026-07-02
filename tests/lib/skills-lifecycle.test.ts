import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOM_SKILL_NAMES, installSkills, updateSkills } from '../../src/lib/skills-lifecycle.js';
import { PACKAGE_ROOT } from '../../src/utils/paths.js';

vi.mock('node:fs');
vi.mock('node:child_process', () => ({
	spawnSync: vi.fn(),
}));

describe('skills lifecycle', () => {
	const mockTargetDir = '/test/target';
	let originalIsTTY: boolean | undefined;

	beforeEach(() => {
		originalIsTTY = process.stdout.isTTY;
		process.stdout.isTTY = false;
		vi.clearAllMocks();
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.statSync).mockReturnValue({
			isDirectory: () => true,
		} as fs.Stats);
		vi.mocked(fs.readdirSync).mockReturnValue([...CUSTOM_SKILL_NAMES] as unknown as fs.Dirent[]);
		vi.mocked(fs.cpSync).mockReturnValue(undefined);
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			stdout: '',
			stderr: '',
		} as SpawnSyncReturns<string>);
	});

	afterEach(() => {
		process.stdout.isTTY = originalIsTTY;
	});

	describe('installSkills', () => {
		it('copies all custom skills from package skills/ to target .agents/skills/', () => {
			installSkills(mockTargetDir);

			for (const skillName of CUSTOM_SKILL_NAMES) {
				expect(fs.cpSync).toHaveBeenCalledWith(
					path.join(PACKAGE_ROOT, 'skills', skillName),
					path.join(mockTargetDir, '.agents', 'skills', skillName),
					{ recursive: true, force: true }
				);
			}
		});

		it('spawns npx skills add WordPress/agent-skills --yes in target directory', () => {
			installSkills(mockTargetDir);

			expect(spawnSync).toHaveBeenCalledWith(
				'npx',
				['skills', 'add', 'WordPress/agent-skills', '--yes'],
				expect.objectContaining({ cwd: mockTargetDir, encoding: 'utf-8' })
			);
		});

		it('passes --agent, --project-dir, and --global through to npx skills add', () => {
			installSkills(mockTargetDir, {
				agent: 'claude',
				projectDir: '/some/dir',
				global: true,
			});

			expect(spawnSync).toHaveBeenCalledWith(
				'npx',
				[
					'skills',
					'add',
					'WordPress/agent-skills',
					'--yes',
					'--agent',
					'claude',
					'--project-dir',
					'/some/dir',
					'--global',
				],
				expect.anything()
			);
		});

		it('dry-run returns a plan without copying or spawning', () => {
			const result = installSkills(mockTargetDir, { dryRun: true });

			expect(result.dryRun).toBe(true);
			expect(result.customSkills).toEqual([...CUSTOM_SKILL_NAMES]);
			expect(result.upstreamCommand).toBe('npx skills add WordPress/agent-skills --yes');
			expect(fs.cpSync).not.toHaveBeenCalled();
			expect(spawnSync).not.toHaveBeenCalled();
		});

		it('captures upstream failure without throwing', () => {
			vi.mocked(spawnSync).mockReturnValue({
				status: 1,
				stdout: '',
				stderr: 'network error',
			} as SpawnSyncReturns<string>);

			const result = installSkills(mockTargetDir);

			expect(result.upstreamSuccess).toBe(false);
			expect(result.upstreamError).toContain('network error');
		});
	});

	describe('updateSkills', () => {
		it('copies custom skills and spawns npx skills update --yes', () => {
			updateSkills(mockTargetDir);

			expect(spawnSync).toHaveBeenCalledWith(
				'npx',
				['skills', 'update', '--yes'],
				expect.objectContaining({ cwd: mockTargetDir, encoding: 'utf-8' })
			);
		});

		it('dry-run returns a plan without copying or spawning', () => {
			const result = updateSkills(mockTargetDir, { dryRun: true });

			expect(result.dryRun).toBe(true);
			expect(result.upstreamCommand).toBe('npx skills update --yes');
			expect(fs.cpSync).not.toHaveBeenCalled();
			expect(spawnSync).not.toHaveBeenCalled();
		});
	});
});
