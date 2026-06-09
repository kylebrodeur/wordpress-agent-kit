import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/utils/run.js';

vi.mock('node:child_process');

describe('run', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let processExitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
		processExitSpy.mockRestore();
	});

	it('should execute command successfully with status 0', () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			signal: null,
			error: undefined,
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		run('git', ['status']);

		expect(spawnSync).toHaveBeenCalledWith('git', ['status'], {
			cwd: process.cwd(),
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});
		expect(processExitSpy).not.toHaveBeenCalled();
	});

	it('should use custom cwd when provided', () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			signal: null,
			error: undefined,
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		const customCwd = '/custom/path';
		run('npm', ['install'], customCwd);

		expect(spawnSync).toHaveBeenCalledWith('npm', ['install'], {
			cwd: customCwd,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});
	});

	it('should use shell on Windows', () => {
		const originalPlatform = process.platform;
		Object.defineProperty(process, 'platform', {
			value: 'win32',
			writable: true,
		});

		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			signal: null,
			error: undefined,
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		run('git', ['status']);

		expect(spawnSync).toHaveBeenCalledWith('git', ['status'], {
			cwd: process.cwd(),
			stdio: 'inherit',
			shell: true,
		});

		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			writable: true,
		});
	});

	it('should exit with error status when command fails', () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 1,
			signal: null,
			error: undefined,
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		run('git', ['invalid-command']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Command failed with status 1: git invalid-command'
		);
		expect(processExitSpy).toHaveBeenCalledWith(1);
	});

	it('should exit with status 1 when status is 0 but falsy', () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: null,
			signal: null,
			error: new Error('Command failed'),
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		run('nonexistent', ['command']);

		expect(processExitSpy).toHaveBeenCalledWith(1);
	});

	it('should handle multiple arguments', () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			signal: null,
			error: undefined,
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		run('git', ['commit', '-m', 'test message']);

		expect(spawnSync).toHaveBeenCalledWith(
			'git',
			['commit', '-m', 'test message'],
			expect.any(Object)
		);
	});

	it('should handle command with error status 127', () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 127,
			signal: null,
			error: undefined,
			stdout: Buffer.from(''),
			stderr: Buffer.from(''),
			pid: 123,
			output: [],
		});

		run('nonexistent-command', []);

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Command failed with status 127: nonexistent-command '
		);
		expect(processExitSpy).toHaveBeenCalledWith(127);
	});
});
