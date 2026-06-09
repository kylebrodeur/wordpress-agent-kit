import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { syncSkillsCommand } from '../../src/commands/sync-skills.js';

describe('syncSkillsCommand', () => {
	it('should be a Commander command', () => {
		expect(syncSkillsCommand).toBeInstanceOf(Command);
		expect(syncSkillsCommand.name()).toBe('sync-skills');
	});

	it('should have correct command configuration', () => {
		expect(syncSkillsCommand.description()).toContain('Sync');
		expect(syncSkillsCommand.arguments).toBeDefined();
	});
});
