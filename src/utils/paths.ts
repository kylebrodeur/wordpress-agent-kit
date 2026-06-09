import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the root directory of the package (where package.json lives)
// When running from src (ts-node), it's ../
// When running from dist (node), it's ../
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The absolute path to the root directory of the package.
 * Resolves to the directory containing package.json.
 */
export const PACKAGE_ROOT = path.resolve(__dirname, '../../');
