/**
 * Maps triage detection results to setup configuration
 */

/**
 * Maps project.primary to setup's project type options
 * @param {string} primary - The primary project type from triage
 * @returns {string|null} - Mapped project type or null
 */
export function mapProjectType(primary) {
	const typeMap = {
		'wp-block-theme': 'block-theme',
		'wp-block-plugin': 'blocks',
		'wp-plugin': 'plugin',
		'wp-mu-plugin': 'plugin',
		'wp-theme': 'theme',
		'wp-site': 'site',
		'wp-core': 'other',
		'gutenberg': 'blocks',
		'unknown': null,
	};
	
	return typeMap[primary] || null;
}

/**
 * Maps triage signals and tooling to tech stack array
 * @param {object} triageResult - Full triage result object
 * @returns {string[]} - Array of tech stack values
 */
export function mapTechStack(triageResult) {
	const techStack = [];
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
	
	// Map tooling
	if (tooling.php?.hasComposerJson) {
		techStack.push('composer');
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
export function hasConfidentDetection(detectedType, detectedTech) {
	return detectedType !== null && detectedType !== 'other';
}

/**
 * Formats detection results for display
 * @param {string|null} detectedType - Detected project type
 * @param {string[]} detectedTech - Detected tech stack
 * @param {object} triageResult - Full triage result for additional notes
 * @returns {string} - Formatted string for display
 */
export function formatDetectionResults(detectedType, detectedTech, triageResult) {
	const typeLabels = {
		'plugin': 'WordPress Plugin',
		'theme': 'WordPress Theme',
		'block-theme': 'Block Theme',
		'site': 'Full Site / Multisite',
		'blocks': 'Gutenberg Blocks',
		'other': 'Other / Mixed',
	};
	
	const techLabels = {
		'gutenberg': 'Gutenberg Blocks',
		'interactivity': 'Interactivity API',
		'rest-api': 'REST API',
		'wpcli': 'WP-CLI',
		'composer': 'Composer',
		'npm': 'npm/pnpm',
		'phpstan': 'PHPStan',
		'playground': 'WordPress Playground',
	};
	
	let result = 'Detected project:\n';
	
	if (detectedType) {
		result += `  Type: ${typeLabels[detectedType] || detectedType}\n`;
	} else {
		result += `  Type: Could not determine\n`;
	}
	
	if (detectedTech.length > 0) {
		result += `\nDetected technologies:\n`;
		detectedTech.forEach(tech => {
			result += `  • ${techLabels[tech] || tech}\n`;
		});
	} else {
		result += `\nTechnologies: None detected\n`;
	}
	
	// Add any notes from triage
	if (triageResult.project?.notes?.length > 0) {
		result += `\nNotes:\n`;
		triageResult.project.notes.forEach(note => {
			result += `  • ${note}\n`;
		});
	}
	
	return result.trim();
}
