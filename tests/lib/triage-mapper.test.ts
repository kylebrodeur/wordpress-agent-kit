import { describe, expect, it } from 'vitest';
import {
	formatDetectionResults,
	hasConfidentDetection,
	mapProjectType,
	mapTechStack,
} from '../../src/lib/triage-mapper.js';

describe('mapProjectType', () => {
	it('should map wp-block-theme to block-theme', () => {
		expect(mapProjectType('wp-block-theme')).toBe('block-theme');
	});

	it('should map wp-block-plugin to blocks', () => {
		expect(mapProjectType('wp-block-plugin')).toBe('blocks');
	});

	it('should map wp-plugin to plugin', () => {
		expect(mapProjectType('wp-plugin')).toBe('plugin');
	});

	it('should map wp-mu-plugin to plugin', () => {
		expect(mapProjectType('wp-mu-plugin')).toBe('plugin');
	});

	it('should map wp-theme to theme', () => {
		expect(mapProjectType('wp-theme')).toBe('theme');
	});

	it('should map wp-site to site', () => {
		expect(mapProjectType('wp-site')).toBe('site');
	});

	it('should map wp-core to other', () => {
		expect(mapProjectType('wp-core')).toBe('other');
	});

	it('should map gutenberg to blocks', () => {
		expect(mapProjectType('gutenberg')).toBe('blocks');
	});

	it('should map unknown to null', () => {
		expect(mapProjectType('unknown')).toBe(null);
	});

	it('should return null for unmapped types', () => {
		expect(mapProjectType('invalid-type')).toBe(null);
	});
});

describe('mapTechStack', () => {
	it('should detect gutenberg blocks', () => {
		const triage = {
			signals: { blockJsonFiles: ['block.json'] },
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).toContain('gutenberg');
	});

	it('should detect interactivity API', () => {
		const triage = {
			signals: { usesInteractivityApi: true },
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).toContain('interactivity');
	});

	it('should detect WP-CLI', () => {
		const triage = {
			signals: { usesWpCli: true },
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).toContain('wpcli');
	});

	it('should detect REST API', () => {
		const triage = {
			signals: { usesRestApi: true },
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).toContain('rest-api');
	});

	it('should detect Composer', () => {
		const triage = {
			signals: {},
			tooling: { php: { hasComposerJson: true } },
		};
		const result = mapTechStack(triage);
		expect(result).toContain('composer');
	});

	it('should detect PHPStan', () => {
		const triage = {
			signals: {},
			tooling: { php: { hasPhpStan: true } },
		};
		const result = mapTechStack(triage);
		expect(result).toContain('phpstan');
	});

	it('should detect npm', () => {
		const triage = {
			signals: {},
			tooling: { node: { hasPackageJson: true } },
		};
		const result = mapTechStack(triage);
		expect(result).toContain('npm');
	});

	it('should detect playground', () => {
		const triage = {
			signals: { hasPlaygroundBlueprint: true },
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).toContain('playground');
	});

	it('should detect multiple technologies', () => {
		const triage = {
			signals: {
				blockJsonFiles: ['block.json'],
				usesInteractivityApi: true,
				usesRestApi: true,
				hasPlaygroundBlueprint: true,
			},
			tooling: {
				php: { hasComposerJson: true, hasPhpStan: true },
				node: { hasPackageJson: true },
			},
		};
		const result = mapTechStack(triage);
		expect(result).toHaveLength(7);
		expect(result).toEqual(
			expect.arrayContaining([
				'gutenberg',
				'interactivity',
				'rest-api',
				'composer',
				'phpstan',
				'npm',
				'playground',
			])
		);
	});

	it('should return empty array when nothing detected', () => {
		const triage = {
			signals: {},
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).toEqual([]);
	});

	it('should handle empty blockJsonFiles array', () => {
		const triage = {
			signals: { blockJsonFiles: [] },
			tooling: {},
		};
		const result = mapTechStack(triage);
		expect(result).not.toContain('gutenberg');
	});
});

describe('hasConfidentDetection', () => {
	it('should return true for valid type', () => {
		expect(hasConfidentDetection('plugin', [])).toBe(true);
	});

	it('should return true for valid type with tech stack', () => {
		expect(hasConfidentDetection('blocks', ['gutenberg'])).toBe(true);
	});

	it('should return false for null type', () => {
		expect(hasConfidentDetection(null, [])).toBe(false);
	});

	it('should return false for "other" type', () => {
		expect(hasConfidentDetection('other', [])).toBe(false);
	});

	it('should return false for null type even with tech stack', () => {
		expect(hasConfidentDetection(null, ['gutenberg', 'composer'])).toBe(false);
	});

	it('should return false for "other" even with tech stack', () => {
		expect(hasConfidentDetection('other', ['gutenberg'])).toBe(false);
	});
});

describe('formatDetectionResults', () => {
	it('should format plugin type', () => {
		const result = formatDetectionResults('plugin', [], {});
		expect(result).toContain('WordPress Plugin');
	});

	it('should format theme type', () => {
		const result = formatDetectionResults('theme', [], {});
		expect(result).toContain('WordPress Theme');
	});

	it('should format block-theme type', () => {
		const result = formatDetectionResults('block-theme', [], {});
		expect(result).toContain('Block Theme');
	});

	it('should format site type', () => {
		const result = formatDetectionResults('site', [], {});
		expect(result).toContain('Full Site / Multisite');
	});

	it('should format blocks type', () => {
		const result = formatDetectionResults('blocks', [], {});
		expect(result).toContain('Gutenberg Blocks');
	});

	it('should format other type', () => {
		const result = formatDetectionResults('other', [], {});
		expect(result).toContain('Other / Mixed');
	});

	it('should format null type as Unknown', () => {
		const result = formatDetectionResults(null, [], {});
		expect(result).toContain('Unknown');
	});

	it('should format single tech stack item', () => {
		const result = formatDetectionResults('plugin', ['gutenberg'], {});
		expect(result).toContain('Blocks');
	});

	it('should format multiple tech stack items', () => {
		const result = formatDetectionResults('plugin', ['gutenberg', 'composer', 'phpstan'], {});
		expect(result).toContain('Blocks, Composer, PHPStan');
	});

	it('should format all tech stack labels', () => {
		const result = formatDetectionResults(
			'plugin',
			[
				'gutenberg',
				'interactivity',
				'wpcli',
				'rest-api',
				'composer',
				'phpstan',
				'npm',
				'playground',
			],
			{}
		);
		expect(result).toContain('Interactivity API');
		expect(result).toContain('WP-CLI');
		expect(result).toContain('REST API');
		expect(result).toContain('npm/package.json');
		expect(result).toContain('Playground');
	});

	it('should include Project Type and Tech Stack labels', () => {
		const result = formatDetectionResults('plugin', ['gutenberg'], {});
		expect(result).toMatch(/Project Type:/);
		expect(result).toMatch(/Tech Stack:/);
	});

	it('should handle unknown tech stack items', () => {
		const result = formatDetectionResults('plugin', ['unknown-tech'], {});
		expect(result).toContain('unknown-tech');
	});
});
