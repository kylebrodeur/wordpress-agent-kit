/**
 * Semantic exit codes for the CLI.
 * Allows scripts and agents to programmatically determine failure reasons.
 */
export const ExitCode = {
	/** Success */
	OK: 0,

	/** General/unknown error */
	ERROR: 1,

	/** Invalid command-line arguments or usage */
	INVALID_ARGS: 2,

	/** Target not found (ENOENT) */
	NOT_FOUND: 3,

	/** Permission denied (EACCES) */
	PERMISSION_DENIED: 4,

	/** File/directory already exists (EEXIST) - use --force to override */
	ALREADY_EXISTS: 5,

	/** Git/submodule operation failed */
	GIT_ERROR: 6,

	/** Network/fetch operation failed */
	NETWORK_ERROR: 7,

	/** Validation failed (schema, input, config) */
	VALIDATION_ERROR: 8,

	/** Cancelled by user (SIGINT) */
	CANCELLED: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Maps Node.js errno to semantic exit code.
 */
export function mapErrnoToExitCode(errno: string | undefined): ExitCode {
	switch (errno) {
		case 'ENOENT':
			return ExitCode.NOT_FOUND;
		case 'EACCES':
		case 'EPERM':
			return ExitCode.PERMISSION_DENIED;
		case 'EEXIST':
			return ExitCode.ALREADY_EXISTS;
		default:
			return ExitCode.ERROR;
	}
}

/**
 * Wraps an async operation and maps errors to exit codes.
 * Re-throws with exitCode property attached.
 */
export async function withExitCode<T>(
	operation: () => Promise<T>,
	onError?: (error: Error & { exitCode?: ExitCode }) => void
): Promise<T> {
	try {
		return await operation();
	} catch (error: unknown) {
		const err = error as Error & { code?: string; exitCode?: ExitCode };
		const exitCode = err.exitCode ?? mapErrnoToExitCode(err.code);
		const enhancedError = Object.assign(err, { exitCode });
		if (onError) {
			onError(enhancedError);
		}
		throw enhancedError;
	}
}
