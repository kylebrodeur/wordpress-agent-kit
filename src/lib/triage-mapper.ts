/**
 * Maps triage detection results to setup configuration
 */

/**
 * Maps project.primary to setup's project type options
 * @param {string} primary - The primary project type from triage
 * @returns {string|null} - Mapped project type or null
 */
export function mapProjectType(primary: string): string | null {
	const typeMap: Record<string, string | null> = {
		'wp-block-theme': 'block-theme',
		'wp-block-plugin': 'blocks',
		'wp-plugin': 'plugin',
		'wp-mu-plugin': 'plugin',
		'wp-theme': 'theme',
		'wp-site': 'site',
		'wp-core': 'other',
		gutenberg: 'blocks',
		unknown: null,
	};

	return typeMap[primary] || null;
}

/**
 * Maps triage signals and tooling to tech stack array
 * @param {object} triageResult - Full triage result object
 * @returns {string[]} - Array of tech stack values
 */
export function mapTechStack(triageResult: any): string[] {
	const techStack: string[] = [];
	const { signals, tooling } = triageResult;

	// Map signals
	if (signals.blockJsonFiles && signals.blockJsonFiles.length > 0) {
		techStack.push('gutenberg');
	}

	if (signals.usesInteractivityApi) {
		techStack.push('interactivity');
	}

	if (signals.usesWpCli) {
		techStack.push('wpcli');
	}

	if (signals.usesRestApi) {
		techStack.push('rest-api');
	}

	// Map tooling
	if (tooling.php?.hasComposerJson) {
		techStack.push('composer');
	}

	if (tooling.php?.hasPhpStan) {
		techStack.push('phpstan');
	}

	if (tooling.node?.hasPackageJson) {
		techStack.push('npm');
	}

	// Check for playground blueprint
	if (signals.hasPlaygroundBlueprint) {
		techStack.push('playground');
	}

	return techStack;
}

/**
 * Checks if detection has enough confidence to skip questions
 * @param {string|null} detectedType - Detected project type
 * @param {string[]} detectedTech - Detected tech stack
 * @returns {boolean} - True if confident enough
 */
export function hasConfidentDetection(
	detectedType: string | null,
	_detectedTech: string[]
): boolean {
	return detectedType !== null && detectedType !== 'other';
}

/**
 * Formats detection results for display
 * @param {string|null} detectedType - Detected project type
 * @param {string[]} detectedTech - Detected tech stack
 * @param {object} triageResult - Full triage result for additional notes
 * @returns {string} - Formatted string for display
 */
export function formatDetectionResults(
	detectedType: string | null,
	detectedTech: string[],
	_triageResult: any
): string {
	const typeLabels: Record<string, string> = {
		plugin: 'WordPress Plugin',
		theme: 'WordPress Theme',
		'block-theme': 'Block Theme',
		site: 'Full Site / Multisite',
		blocks: 'Gutenberg Blocks',
		other: 'Other / Mixed',
	};

	const techLabels: Record<string, string> = {
		gutenberg: 'Blocks',
		interactivity: 'Interactivity API',
		wpcli: 'WP-CLI',
		'rest-api': 'REST API',
		composer: 'Composer',
		phpstan: 'PHPStan',
		npm: 'npm/package.json',
		playground: 'Playground',
	};

	const typeLabel = detectedType ? typeLabels[detectedType] : 'Unknown';
	const techList = detectedTech.map((t) => techLabels[t] || t).join(', ');

	return `Project Type: ${typeLabel}\nTech Stack: ${techList}`;
}
