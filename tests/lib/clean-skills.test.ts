import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cleanSkillsApi } from '../../src/lib/api.js';
import { CUSTOM_SKILL_NAMES, UPSTREAM_SKILL_NAMES } from '../../src/lib/skills-lifecycle.js';

vi.mock('node:fs');

const ALL_SKILLS = [...CUSTOM_SKILL_NAMES, ...UPSTREAM_SKILL_NAMES];

/**
 * Regression test for the 0.8.1 false-orphan bug: `cleanSkillsApi` built the
 * canonical set from `PACKAGE_ROOT/skills/`, which is not shipped in the npm
 * package — so an npx install only recognized the 17 upstream skills and would
 * flag our 9 custom skills as orphans to delete. After the 0.8.2 fix the
 * canonical set is the static CUSTOM_SKILL_NAMES + UPSTREAM_SKILL_NAMES, so
 * every skill installed by `skills install` (both sources) must be canonical.
 */
describe('cleanSkillsApi — no false orphans after skills install', () => {
	const targetDir = '/test/target';

	function mockSkillsDir(skillNames: string[]): void {
		vi.mocked(fs.existsSync).mockImplementation((p) => {
			// Only the universal skills dir exists; no legacy platform skill dirs.
			return String(p) === path.join(targetDir, '.agents', 'skills');
		});
		vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
		vi.mocked(fs.readdirSync).mockReturnValue(skillNames as unknown as fs.Dirent[]);
	}

	it('reports zero orphans when .agents/skills/ contains all 26 kit skills', async () => {
		mockSkillsDir(ALL_SKILLS);
		// dryRun:false + remove:false => report-only, no fs writes; orphanedSkills at top level.
		const result = await cleanSkillsApi({
			targetDir,
			platform: 'github',
			dryRun: false,
			remove: false,
		});

		expect(result.success).toBe(true);
		expect(result.data?.orphanedSkills).toEqual([]);
	});

	it('flags only a genuinely-extra skill (not part of the kit)', async () => {
		mockSkillsDir([...ALL_SKILLS, 'my-custom-extra-skill']);
		const result = await cleanSkillsApi({
			targetDir,
			platform: 'github',
			dryRun: false,
			remove: false,
		});

		expect(result.data?.orphanedSkills).toEqual(['my-custom-extra-skill']);
	});

	it('recognizes every custom skill individually (the 0.8.1 regression guard)', async () => {
		mockSkillsDir(ALL_SKILLS);
		const result = await cleanSkillsApi({
			targetDir,
			platform: 'github',
			dryRun: false,
			remove: false,
		});

		// If the canonical set ever drops the custom names again, each would be
		// flagged as an orphan — assert none of our 9 appear as orphans.
		expect(result.data?.orphanedSkills).toEqual([]);
		for (const custom of CUSTOM_SKILL_NAMES) {
			expect(result.data?.orphanedSkills).not.toContain(custom);
		}
	});
});
