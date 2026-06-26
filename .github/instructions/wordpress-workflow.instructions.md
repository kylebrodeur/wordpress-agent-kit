\# WordPress Agent Skills Workflow

This repo uses a local, filesystem-based set of WordPress agent skills under `.agents/skills/`. Follow these procedures for every interaction.

\## 1. Skill Discovery & Activation

\- \*\*Always start by scanning \`.agents/skills/\`\*\* to see which specialized modules are active.

\- If the user asks for a Block, explicitly activate the \`wp-block-development\` skill.

\- If the task involves environment setup, use the \`wp-playground\` skill patterns to provide a \`blueprint.json\` or a [Playground link]\(https://playground.wordpress.net).

\## 2. Directory Mapping (Triage)

Follow the \`wp-project-triage\` skill to identify where to place code:

\- \*\*PHP Logic\*\*: Prefer the repo\'s existing structure first. If you\'re introducing structure to a single-file plugin, use \`includes/\` for PHP modules/classes.

\- \*\*Blocks/Assets\*\*: Use the \`src/\` directory for development and \`build/\` for compiled assets.

\- \*\*Tests\*\*: Locate existing tests in \`tests/phpunit/\` or \`tests/pest/\` before writing new ones.

\## 3. Mandatory Implementation Standards

When generating code, you must merge \*\*General Skills\*\* with \*\*Project Rules\*\*:

\- \*\*Hooks\*\*: Use the \`wordpress-router\` skill logic to determine if a hook belongs in \`init\`, \`admin_init\`, or \`wp_enqueue_scripts\`.

\- \*\*Naming\*\*: Prefix all PHP functions and classes with the existing project prefix (determine it from the codebase during triage). If there is no established prefix, pick one and apply it consistently.

\- \*\*Documentation\*\*: Every function must include a [PHPDoc block]\(https://developer.wordpress.org) as defined in the WordPress Handbook.

\## 4. Validation Step

Before finalizing a response:

1\. Cross-reference the code against the WordPress PHP Coding Standards (and keep indentation consistent with the existing file).

2\. Check if a [WordPress.org Plugin Handbook]\(https://developer.wordpress.org) rule supersedes a generic community pattern.

3\. State which skill was used (e.g., \*"Applied patterns from wp-block-development"\*).