import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { computeChanges } from '../../src/lib/updater.js';

vi.mock('node:fs');

// The exact bytes the kit leaked as .github/dependabot.yml in 0.8.0–0.8.1
// (sha256 = aab0a15e…f59c1, bundled in KNOWN_LEAKED_HASHES).
const LEAKED_DEPENDABOT = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
`;

/**
 * A2: on upgrade, a previously-leaked kit default whose hash matches a known
 * leaked hash is marked for safe removal; a genuine consumer file with
 * different content is preserved. Simulates the production condition where
 * dependabot.yml is NOT in the kit's shipped source (npmignored since 0.8.2).
 */
describe('computeChanges — leaked-default cleanup (A2)', () => {
	const targetDir = '/test/target';
	const platform = 'github';

	function setup(targetDependabot: string | null) {
		// Source (.github) ships NO dependabot.yml (post-0.8.2 npmignore).
		vi.mocked(fs.existsSync).mockImplementation((p) => {
			const s = String(p);
			if (s === path.join(targetDir, '.github')) return true;
			if (targetDependabot !== null && s === path.join(targetDir, '.github', 'dependabot.yml'))
				return true;
			return false;
		});
		vi.mocked(fs.statSync).mockImplementation((p) => {
			// dependabot.yml is a file; the platform dir is a directory
			return {
				isDirectory: () => String(p) !== path.join(targetDir, '.github', 'dependabot.yml'),
			} as fs.Stats;
		});
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			const s = String(dir);
			if (s === path.join(targetDir, '.github')) {
				return (targetDependabot !== null ? ['dependabot.yml'] : []) as unknown as fs.Dirent[];
			}
			return [] as unknown as fs.Dirent[];
		});
		vi.mocked(fs.readFileSync).mockImplementation((p) => {
			if (String(p) === path.join(targetDir, '.github', 'dependabot.yml')) {
				return targetDependabot ?? '';
			}
			return '';
		});
	}

	it('marks the leaked dependabot.yml for removal when it matches the known hash', () => {
		setup(LEAKED_DEPENDABOT);
		// sanity: the mocked content hashes to the bundled known hash
		expect(crypto.createHash('sha256').update(LEAKED_DEPENDABOT).digest('hex')).toBe(
			'aab0a15e7b849ab8bed3a130472bb2bd0dbd0b10fc6cd35896a89647f62f59c1'
		);

		const changes = computeChanges(targetDir, platform, false);
		const dep = changes.find((c) => c.relativePath === 'dependabot.yml');
		expect(dep?.action).toBe('remove');
		expect(dep?.reason).toMatch(/Leaked kit default/);
	});

	it('preserves a genuine consumer dependabot.yml whose content differs', () => {
		setup('version: 2\nupdates: []\n# my own dependabot config\n');
		const changes = computeChanges(targetDir, platform, false);
		const dep = changes.find((c) => c.relativePath === 'dependabot.yml');
		expect(dep?.action).toBe('unchanged');
		expect(dep?.reason).toMatch(/User-added file \(preserved\)/);
	});
});
