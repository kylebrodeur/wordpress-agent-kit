import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { skillsCommand } from '../../src/commands/skills.js';

describe('skillsCommand', () => {
	it('should be a Commander command', () => {
		expect(skillsCommand).toBeInstanceOf(Command);
		expect(skillsCommand.name()).toBe('skills');
	});

	it('should have install and update subcommands', () => {
		const subcommands = skillsCommand.commands.map((c) => c.name());
		expect(subcommands).toContain('install');
		expect(subcommands).toContain('update');
	});
});
