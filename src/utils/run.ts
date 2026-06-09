import { spawnSync } from 'node:child_process';

/**
 * Executes a shell command synchronously and exits the process if it fails.
 *
 * @param {string} command - The command to execute (e.g., 'npm', 'git').
 * @param {string[]} args - An array of arguments for the command.
 * @param {string} [cwd] - The current working directory for the command. Defaults to process.cwd().
 * @returns {void}
 */
export function run(command: string, args: string[], cwd: string = process.cwd()) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: 'inherit',
		shell: process.platform === 'win32',
	});

	if (result.status !== 0) {
		console.error(`Command failed with status ${result.status}: ${command} ${args.join(' ')}`);
		process.exit(result.status || 1);
	}
}
