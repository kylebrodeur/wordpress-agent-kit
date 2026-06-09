import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Command } from 'commander';
import { ExitCode } from '../utils/exit-codes.js';
import { OutputFormatter, createFormatter } from '../utils/output.js';
import { PACKAGE_ROOT } from '../utils/paths.js';

/**
 * Command to run a local WordPress Playground instance.
 * Uses the blueprint located in the playground directory.
 */
export const runPlaygroundCommand = new Command('playground')
	.description('Run local WordPress Playground')
	.option('--port <port>', 'Port to run on', '9400')
	.option('--no-auto-mount', 'Disable auto-mount of current directory')
	.action(async (options, command) => {
		const globalOpts = command.parent?.opts() || {};
		const formatter = createFormatter(globalOpts, 'playground', '0.0.0');

		const port = process.env.PORT || options.port;
		const blueprintPath = path.join(PACKAGE_ROOT, 'playground', 'blueprint.json');

		if (!globalOpts.json && !globalOpts.quiet) {
			console.log(`Starting WordPress Playground on port ${port}...`);
			console.log(`Blueprint: ${blueprintPath}`);
		}

		const args = [
			'@wp-playground/cli@latest',
			'server',
			options.autoMount ? '--auto-mount' : '',
			`--port=${port}`,
			`--blueprint=${blueprintPath}`,
		].filter(Boolean);

		if (globalOpts.dryRun) {
			const dryRunResult = formatter.success({
				wouldExecute: true,
				actions: [
					{
						type: 'create',
						target: `localhost:${port}`,
						description: 'Start WP Playground server with blueprint',
					},
				],
				summary: { port: Number(port), blueprint: blueprintPath },
			});
			process.exit(OutputFormatter.getExitCode(dryRunResult));
		}

		try {
			const result = spawnSync('npx', args, {
				cwd: PACKAGE_ROOT,
				stdio: 'inherit',
				shell: process.platform === 'win32',
			});

			if (result.status !== 0) {
				const errorResult = formatter.fail({
					code: 'PLAYGROUND_FAILED',
					message: `Playground exited with code ${result.status}`,
					exitCode: ExitCode.ERROR,
				});
				process.exit(OutputFormatter.getExitCode(errorResult));
			}

			if (globalOpts.json) {
				const successResult = formatter.success({ port: Number(port), status: 'completed' });
				process.exit(OutputFormatter.getExitCode(successResult));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorResult = formatter.fail({
				code: 'PLAYGROUND_ERROR',
				message: errorMessage,
				exitCode: ExitCode.ERROR,
			});
			process.exit(OutputFormatter.getExitCode(errorResult));
		}
	});
