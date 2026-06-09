import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { setupCommand } from '../../src/commands/setup.js';

describe('setupCommand', () => {
	it('should be a Commander command', () => {
		expect(setupCommand).toBeInstanceOf(Command);
		expect(setupCommand.name()).toBe('setup');
	});

	it('should have correct command configuration', () => {
		expect(setupCommand.description()).toContain('setup');
		expect(setupCommand.options).toBeDefined();
	});

	it('should have reset option', () => {
		const options = setupCommand.options;
		const resetOption = options.find((opt) => opt.long === '--reset');
		expect(resetOption).toBeDefined();
	});
});
