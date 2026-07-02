import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	OUR_SKILLS_SOURCE,
	UPSTREAM_SKILLS_SOURCE,
	installSkills,
	updateSkills,
} from '../../src/lib/skills-lifecycle.js';

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
		it('spawns npx skills add for our source and the upstream source, targeting .agents/skills', () => {
			installSkills(mockTargetDir);

			expect(spawnSync).toHaveBeenCalledTimes(2);
			const calls = vi.mocked(spawnSync).mock.calls;
			// First call: our 9 custom skills
			expect(calls[0]?.[0]).toBe('npx');
			expect(calls[0]?.[1]).toEqual([
				'skills',
				'add',
				OUR_SKILLS_SOURCE,
				'--agent',
				'cursor',
				'--yes',
			]);
			// Second call: the 17 upstream skills
			expect(calls[1]?.[0]).toBe('npx');
			expect(calls[1]?.[1]).toEqual([
				'skills',
				'add',
				UPSTREAM_SKILLS_SOURCE,
				'--agent',
				'cursor',
				'--yes',
			]);
		});

		it('runs both npx skills invocations with cwd set to the resolved target', () => {
			installSkills(mockTargetDir);

			for (const call of vi.mocked(spawnSync).mock.calls) {
				expect(call?.[2]?.cwd).toBe(mockTargetDir);
			}
		});

		it('reports allSuccess only when every source succeeds', () => {
			vi.mocked(spawnSync)
				.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as SpawnSyncReturns<string>)
				.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'boom' } as SpawnSyncReturns<string>);

			const result = installSkills(mockTargetDir);

			expect(result.allSuccess).toBe(false);
			expect(result.sources).toHaveLength(2);
			expect(result.sources[0]?.success).toBe(true);
			expect(result.sources[1]?.success).toBe(false);
			expect(result.sources[1]?.error).toBe('boom');
		});

		it('does not throw when npx skills fails — captures the error instead', () => {
			vi.mocked(spawnSync).mockReturnValue({
				status: 1,
				stdout: '',
				stderr: 'network down',
			} as SpawnSyncReturns<string>);

			const result = installSkills(mockTargetDir);

			expect(result.allSuccess).toBe(false);
			expect(result.sources.every((s) => !s.success)).toBe(true);
			expect(result.sources.every((s) => s.error === 'network down')).toBe(true);
		});

		it('dry-run returns a plan with both commands and never spawns', () => {
			const result = installSkills(mockTargetDir, { dryRun: true });

			expect(spawnSync).not.toHaveBeenCalled();
			expect(result.dryRun).toBe(true);
			expect(result.sources).toHaveLength(2);
			expect(result.sources[0]?.source).toBe(OUR_SKILLS_SOURCE);
			expect(result.sources[1]?.source).toBe(UPSTREAM_SKILLS_SOURCE);
			expect(result.sources[0]?.command).toContain('npx skills add');
			expect(result.sources[1]?.command).toContain('--agent cursor');
		});
	});

	describe('updateSkills', () => {
		it('spawns a single npx skills update --yes in the target directory', () => {
			const result = updateSkills(mockTargetDir);

			expect(spawnSync).toHaveBeenCalledTimes(1);
			const call = vi.mocked(spawnSync).mock.calls[0];
			expect(call?.[0]).toBe('npx');
			expect(call?.[1]).toEqual(['skills', 'update', '--yes']);
			expect(call?.[2]?.cwd).toBe(mockTargetDir);
			expect(result.allSuccess).toBe(true);
		});

		it('reports failure when npx skills update fails', () => {
			vi.mocked(spawnSync).mockReturnValue({
				status: 1,
				stdout: '',
				stderr: 'no lockfile',
			} as SpawnSyncReturns<string>);

			const result = updateSkills(mockTargetDir);

			expect(result.allSuccess).toBe(false);
			expect(result.sources[0]?.error).toBe('no lockfile');
		});

		it('dry-run returns a plan and never spawns', () => {
			const result = updateSkills(mockTargetDir, { dryRun: true });

			expect(spawnSync).not.toHaveBeenCalled();
			expect(result.dryRun).toBe(true);
			expect(result.sources).toHaveLength(1);
			expect(result.sources[0]?.command).toBe('npx skills update --yes');
		});
	});
});
