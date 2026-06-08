import { Command } from 'commander';
import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PACKAGE_ROOT } from '../utils/paths.js';
import { installKit, type Platform, PLATFORM_FOLDERS } from '../lib/installer.js';
import { mapProjectType, mapTechStack, hasConfidentDetection, formatDetectionResults } from '../lib/triage-mapper.js';

/**
 * Command to interactively set up the WordPress Agent Kit.
 * Handles detection of project type, installation, and configuration of AGENTS.md.
 */
export const setupCommand = new Command('setup')
  .description('Interactive setup for WordPress Agent Kit')
  .argument('[dir]', 'Target directory', process.cwd())
  .option('--reset', 'Reset and overwrite existing configuration')
  .option('--platform <platform>', 'Target platform (github, cursor, claude, agent, pi)', 'github')
  .action(async (dir, options) => {
    const platform = options.platform as Platform;
    const validPlatforms: Platform[] = ['github', 'cursor', 'claude', 'agent', 'pi'];
    
    if (!validPlatforms.includes(platform)) {
        console.error(`Invalid platform: ${platform}. Valid options: ${validPlatforms.join(', ')}`);
        process.exit(1);
    }

    const platformFolder = PLATFORM_FOLDERS[platform];

    console.clear();
    p.intro('WordPress Agent Kit Setup');

    const targetDir = path.resolve(dir);

    // Check if target directory exists
    if (!fs.existsSync(targetDir)) {
      const shouldCreate = await p.confirm({
        message: `Target directory doesn't exist: ${targetDir}\nCreate it?`,
        initialValue: true,
      });

      if (p.isCancel(shouldCreate) || !shouldCreate) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      try {
        fs.mkdirSync(targetDir, { recursive: true });
        p.log.success(`Created directory: ${targetDir}`);
      } catch (err: any) {
        p.log.error(`Failed to create directory: ${err.message}`);
        process.exit(1);
      }
    }

    p.log.info(`Setting up kit in: ${targetDir} (platform: ${platform})`);

    // Check if kit is already installed
    const agentsPath = path.join(targetDir, 'AGENTS.md');
    const platformInstructionsPath = path.join(targetDir, platformFolder, 'instructions', 'wordpress-workflow.instructions.md');

    if (options.reset && fs.existsSync(agentsPath)) {
        const confirmReset = await p.confirm({
            message: `Warning: --reset will overwrite existing AGENTS.md and ${platformFolder} configuration. Continue?`,
            initialValue: false,
        });

        if (p.isCancel(confirmReset) || !confirmReset) {
            p.cancel('Reset cancelled.');
            process.exit(0);
        }
        
        // Force install if reset is confirmed
        const s = p.spinner();
        s.start('Re-installing kit files...');
        try {
            await installKit(targetDir, platform);
            s.stop('Kit files reset.');
        } catch (err: any) {
            s.stop('Reset failed.');
            console.error(err.message);
            process.exit(1);
        }
    } else if (!fs.existsSync(agentsPath)) {
      const shouldInstall = await p.confirm({
        message: 'Kit not found in target repo. Install it first?',
        initialValue: true,
      });

      if (p.isCancel(shouldInstall) || !shouldInstall) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      const s = p.spinner();
      s.start('Installing kit files...');
      
      try {
        await installKit(targetDir, platform);
        s.stop('Kit installed successfully.');
      } catch (err: any) {
        s.stop('Installation failed.');
        console.error(err.message);
        process.exit(1);
      }
    }

    // Run project triage BEFORE asking any questions
    let triageResult: any = null;
    let detectedType: string | null = null;
    let detectedTech: string[] = [];

    // Try to find triage script in multiple locations
    const triageScriptPaths = [
      path.join(targetDir, platformFolder, 'skills/wp-project-triage/scripts/detect_wp_project.mjs'),
      path.join(process.cwd(), platformFolder, 'skills/wp-project-triage/scripts/detect_wp_project.mjs'),
      path.resolve(PACKAGE_ROOT, 'vendor/wp-agent-skills/skills/wp-project-triage/scripts/detect_wp_project.mjs'),
    ];

    const triageScriptPath = triageScriptPaths.find(p => fs.existsSync(p));

    if (triageScriptPath) {
      const s = p.spinner();
      s.start('Analyzing project structure...');
      
      try {
        const result = spawnSync('node', [triageScriptPath], {
          cwd: targetDir,
          encoding: 'utf-8',
        });
        
        if (result.status === 0 && result.stdout) {
          triageResult = JSON.parse(result.stdout.trim());
          detectedType = mapProjectType(triageResult.project?.primary);
          detectedTech = mapTechStack(triageResult);
        }
        
        s.stop('Project analyzed.');
      } catch (err) {
        s.stop('Auto-detection unavailable.');
        p.log.warn('Could not run project triage. Proceeding with manual setup.');
      }
    } else {
      p.log.info('Project triage not available yet. Using manual setup.');
    }

    let detectedPackageManager = 'npm/pnpm';
	if (triageResult && triageResult.tooling?.node?.packageManager) {
		detectedPackageManager = triageResult.tooling.node.packageManager;
	}

    let useDetectedValues = false;

    if (triageResult && hasConfidentDetection(detectedType, detectedTech)) {
        p.note(formatDetectionResults(detectedType, detectedTech, triageResult), 'Auto-Detection Results');
        
        const confirmDetection = await p.confirm({
            message: 'Use these detected values?',
            initialValue: true,
        });
        
        if (p.isCancel(confirmDetection)) {
            p.cancel('Setup cancelled.');
            process.exit(0);
        }
        
        useDetectedValues = confirmDetection as boolean;
    } else if (triageResult) {
        if (detectedType || detectedTech.length > 0) {
            p.note(formatDetectionResults(detectedType, detectedTech, triageResult), 'Partial Detection (will be used as defaults)');
        }
    }

    let projectInfo: any;

    if (useDetectedValues) {
        projectInfo = {
            projectType: detectedType,
            techStack: detectedTech,
        };
        p.log.success('Using auto-detected configuration.');
    } else {
        projectInfo = await p.group(
            {
                projectType: () =>
                    p.select({
                        message: 'What type of WordPress project is this?',
                        options: [
                            { value: 'plugin', label: 'Plugin' },
                            { value: 'theme', label: 'Theme' },
                            { value: 'block-theme', label: 'Block Theme' },
                            { value: 'site', label: 'Full Site / Multisite' },
                            { value: 'blocks', label: 'Gutenberg Blocks' },
                            { value: 'other', label: 'Other / Mixed' },
                            { value: 'unsure', label: "I'm not sure" },
                        ],
                        initialValue: detectedType || undefined,
                    }),
                techStack: () =>
                    p.multiselect({
                        message: 'Select technologies (or skip if unsure):',
                        options: [
                            { value: 'gutenberg', label: 'Gutenberg Blocks', hint: 'block.json, @wordpress/blocks' },
                            { value: 'interactivity', label: 'Interactivity API', hint: 'data-wp-* directives' },
                            { value: 'rest-api', label: 'REST API', hint: 'Custom endpoints' },
                            { value: 'wpcli', label: 'WP-CLI', hint: 'Custom commands' },
                            { value: 'composer', label: 'Composer', hint: 'PHP dependencies' },
                            { value: 'npm', label: 'npm/pnpm', hint: 'JS build process' },
                            { value: 'phpstan', label: 'PHPStan', hint: 'Static analysis' },
                            { value: 'playground', label: 'WordPress Playground', hint: 'Testing/demo' },
                        ],
                        initialValues: detectedTech.length > 0 ? detectedTech : undefined,
                        required: false,
                    }),
            },
            {
                onCancel: () => {
                    p.cancel('Setup cancelled.');
                    process.exit(0);
                },
            }
        );

        if (projectInfo.projectType === 'unsure') {
            projectInfo.projectType = 'other';
            p.log.info('Using "other" as project type. You can adjust AGENTS.md later.');
        }
    }

    const customizeAgents = await p.confirm({
        message: 'Customize AGENTS.md with project details?',
        initialValue: true,
    });

    if (p.isCancel(customizeAgents)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
    }

    if (customizeAgents) {
        try {
            let agentsContent = fs.readFileSync(agentsPath, 'utf-8');
            
            agentsContent = agentsContent.replace(
                /\*\*Tooling\*\*: .*/,
                `**Tooling**: ${projectInfo.techStack.includes('composer') ? 'Composer for PHP' : ''}${projectInfo.techStack.includes('npm') ? `, ${detectedPackageManager} for JS` : ''}.`
            );

            fs.writeFileSync(agentsPath, agentsContent, 'utf-8');
            p.log.success('Updated AGENTS.md');
        } catch (err: any) {
            p.log.warn(`Could not update AGENTS.md: ${err.message}`);
        }
    }
    
    // Workflow instructions
    if (fs.existsSync(platformInstructionsPath)) {
        const customizeWorkflow = await p.confirm({
            message: 'Open workflow instructions for manual editing?',
            initialValue: false,
        });

        if (!p.isCancel(customizeWorkflow) && customizeWorkflow) {
            p.note(
                `Edit: ${platformInstructionsPath}\n\nAdd your project-specific:\n- Coding standards\n- Git workflow\n- Testing procedures\n- Deployment steps`,
                'Workflow Instructions'
            );
        }
    }

    const promptsFolder = path.join(targetDir, platformFolder, 'prompts');
    p.note(
        `✓ Kit installed and configured\n\n` +
        `Next steps:\n` +
        `1. Review ${agentsPath}\n` +
        `2. Customize ${promptsFolder}/ for your domain\n` +
        `3. Test with: ${projectInfo.projectType === 'plugin' ? '"Create a new settings page"' : '"Generate a block variation"'}\n` +
        `4. Adjust skills loading in AGENTS.md as needed`,
        'Setup Complete'
    );

    p.outro('Your WordPress project is now AI-ready!');
  });