import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { runPlaygroundCommand } from '../../src/commands/run-playground.js';

describe('runPlaygroundCommand', () => {
	it('should be a Commander command', () => {
		expect(runPlaygroundCommand).toBeInstanceOf(Command);
		expect(runPlaygroundCommand.name()).toBe('playground');
	});

	it('should have correct description', () => {
		expect(runPlaygroundCommand.description()).toContain('Playground');
	});

	it('should have an action handler', () => {
		expect(runPlaygroundCommand._actionHandler).toBeDefined();
	});
});
