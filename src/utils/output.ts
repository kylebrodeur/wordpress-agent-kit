import { ExitCode, type ExitCode as ExitCodeType } from './exit-codes.js';

/** Output format modes */
export type OutputFormat = 'human' | 'json' | 'quiet' | 'ndjson';

/** Standard CLI result envelope */
export interface CliResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		exitCode: ExitCodeType;
		details?: Record<string, unknown>;
	};
	meta?: {
		durationMs: number;
		timestamp: string;
		version: string;
		command: string;
	};
}

/** Progress event for NDJSON streaming */
export interface ProgressEvent {
	event: 'start' | 'progress' | 'phase-change' | 'warning' | 'complete' | 'error';
	phase: string;
	message?: string;
	data?: Record<string, unknown>;
	timestamp: string;
	level?: 'info' | 'warn' | 'error';
}

/** Dry-run preview result */
export interface DryRunResult<T = unknown> {
	wouldExecute: boolean;
	actions: Array<{
		type: 'create' | 'update' | 'delete' | 'copy' | 'mkdir';
		source?: string;
		target: string;
		description: string;
	}>;
	summary: T;
}

/** Output formatter handles all CLI output modes */
export class OutputFormatter {
	private format: OutputFormat;
	private startTime: number;
	private commandName: string;
	private version: string;
	private ndjsonStarted = false;

	constructor(format: OutputFormat, commandName: string, version: string) {
		this.format = format;
		this.startTime = Date.now();
		this.commandName = commandName;
		this.version = version;
	}

	/** Set output format at runtime */
	setFormat(format: OutputFormat): void {
		this.format = format;
	}

	/** Build standard result envelope */
	private buildResult<T>(success: boolean, data?: T, error?: CliResult<T>['error']): CliResult<T> {
		return {
			success,
			data,
			error,
			meta: {
				durationMs: Date.now() - this.startTime,
				timestamp: new Date().toISOString(),
				version: this.version,
				command: this.commandName,
			},
		};
	}

	/** Output success result */
	success<T>(data: T): CliResult<T> {
		const result = this.buildResult(true, data);
		this.emit(result);
		return result;
	}

	/** Output error result */
	fail(error: CliResult['error']): CliResult<never> {
		const result = this.buildResult(false, undefined as never, error);
		this.emit(result);
		return result;
	}

	/** Emit NDJSON progress event */
	progress(event: Omit<ProgressEvent, 'timestamp'>): void {
		if (this.format !== 'ndjson') return;
		const fullEvent: ProgressEvent = {
			...event,
			timestamp: new Date().toISOString(),
		};

		console.log(JSON.stringify(fullEvent));
	}

	/** Start NDJSON stream */
	startStream(): void {
		if (this.format === 'ndjson') {
			this.ndjsonStarted = true;
		}
	}

	/** Emit raw object (used for JSON mode) */
	private emit<T>(obj: T): void {
		switch (this.format) {
			case 'json':
			case 'ndjson':
				console.log(JSON.stringify(obj));
				break;
			case 'human':
				// Human mode: commands should handle their own console output
				// This is a no-op for structured results
				break;
			case 'quiet':
				// Suppress all output
				break;
		}
	}

	/** Get exit code from result */
	static getExitCode(result: CliResult): ExitCodeType {
		return result.success ? ExitCode.OK : (result.error?.exitCode ?? ExitCode.ERROR);
	}
}

/** Parse output format from CLI flags */
export function parseOutputFormat(json?: boolean, quiet?: boolean, ndjson?: boolean): OutputFormat {
	if (json) return 'json';
	if (ndjson) return 'ndjson';
	if (quiet) return 'quiet';
	return 'human';
}

/** Create formatter from parsed options */
export function createFormatter(
	options: { json?: boolean; quiet?: boolean; ndjson?: boolean },
	commandName: string,
	version: string
): OutputFormatter {
	const format = parseOutputFormat(options.json, options.quiet, options.ndjson);
	return new OutputFormatter(format, commandName, version);
}
