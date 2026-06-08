import { Command } from 'commander';
import path from 'node:path';
import { installKit, type Platform } from '../lib/installer.js';

/**
 * Command to install the WordPress Agent Kit into a target directory.
 * Takes an optional directory argument, defaulting to the current working directory.
 */
export const installCommand = new Command('install')
  .description('Install the WordPress Agent Kit into a target directory')
  .argument('[dir]', 'Target directory to install into', process.cwd())
  .option('--platform <platform>', 'Target platform (github, cursor, claude, agent, pi)', 'github')
  .action(async (dir, options) => {
      const platform = options.platform as Platform;
      const validPlatforms: Platform[] = ['github', 'cursor', 'claude', 'agent', 'pi'];
      
      if (!validPlatforms.includes(platform)) {
          console.error(`Invalid platform: ${platform}. Valid options: ${validPlatforms.join(', ')}`);
          process.exit(1);
      }

      const targetDir = path.resolve(dir);
      try {
          await installKit(targetDir, platform);
      } catch (error: any) {
          console.error(error.message);
          process.exit(1);
      }
  });