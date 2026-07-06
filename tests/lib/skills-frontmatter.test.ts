import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '../../skills');
/**
 * CI guard: every SKILL.md under skills/ must have valid YAML frontmatter so
 * the external skills CLI (vercel-labs/skills) can discover and install it. A
 * broken description (missing, or containing a colon-space or double-quote
 * unquoted) causes the skills CLI to silently skip the skill. This test
 * catches that before release.
 */
describe('skills frontmatter (CI guard for npx skills compatibility)', () => {
	const skillDirs: string[] = fs.existsSync(SKILLS_DIR)
		? fs
				.readdirSync(SKILLS_DIR)
				.filter((entry) => fs.statSync(path.join(SKILLS_DIR, entry)).isDirectory())
		: [];

	it('skills/ directory exists and contains at least one skill', () => {
		expect(skillDirs.length).toBeGreaterThan(0);
	});

	for (const skillName of skillDirs) {
		describe(`skills/${skillName}/SKILL.md`, () => {
			const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
			const content = fs.readFileSync(skillPath, 'utf-8');
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

			it('exists', () => {
				expect(fs.existsSync(skillPath)).toBe(true);
			});

			it('has YAML frontmatter delimited by ---', () => {
				expect(frontmatterMatch, 'SKILL.md must start with --- frontmatter').not.toBeNull();
			});

			if (!frontmatterMatch) return;

			const fm = frontmatterMatch[1] ?? '';

			it('has a name field', () => {
				expect(fm).toMatch(/^name:\s*\S+/m);
			});

			it('has a description field', () => {
				expect(fm).toMatch(/^description:\s*\S+/m);
			});

			// Extract the description value to check YAML-safety. The skills CLI
			// parses frontmatter as YAML; an unquoted value containing a colon-space
			// or a bare double-quote breaks the parse and the skill is silently
			// skipped. Quoted values are safe.
			const descMatch = fm.match(/^description:\s*(.+)$/m);
			const descValue = descMatch?.[1]?.trim() ?? '';

			it('description is YAML-safe (quoted, or no colon-space or bare double-quote)', () => {
				const isQuoted = descValue.startsWith('"') || descValue.startsWith("'");
				if (!isQuoted) {
					expect(descValue, 'unquoted description must not contain colon-space').not.toContain(
						': '
					);
					expect(
						descValue,
						'unquoted description must not contain a bare double-quote'
					).not.toContain('"');
				}
			});
		});
	}
});
