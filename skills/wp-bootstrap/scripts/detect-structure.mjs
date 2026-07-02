#!/usr/bin/env node
/**
 * detect-structure.mjs — probe a repo and emit a JSON structure report.
 *
 * Answers: Is this a monorepo? Where are the WP packages? Where is the WP
 * root (if any)? What tooling exists? What WP Engine remotes are configured?
 *
 * Usage:
 *   node detect-structure.mjs [dir]            # probe dir (default: cwd)
 *   node detect-structure.mjs --json [dir]     # always emit raw JSON (default)
 *   node detect-structure.mjs --pretty [dir]   # human-readable summary
 *
 * Exit code: 0 always (probe never fails; missing fields are null/[]).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const pretty = args.includes('--pretty');
const dirArg = args.find(a => !a.startsWith('--')) ?? '.';
const root = path.resolve(dirArg);

// ── Helpers ──────────────────────────────────────────────────────────────────

const exists = (...parts) => fs.existsSync(path.join(root, ...parts));
const read = (...parts) => {
  try { return fs.readFileSync(path.join(root, ...parts), 'utf-8'); }
  catch { return null; }
};
const readJson = (...parts) => {
  try { return JSON.parse(read(...parts) ?? 'null'); }
  catch { return null; }
};
const run = (cmd, cwd = root) => {
  try { return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return null; }
};

// Recursively find files matching predicate up to maxDepth
function findFiles(dir, predicate, maxDepth = 3, _depth = 0) {
  const results = [];
  if (_depth > maxDepth) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules','vendor','.git','dist','build','.next','coverage'].includes(e.name)) continue;
      results.push(...findFiles(full, predicate, maxDepth, _depth + 1));
    } else if (predicate(e.name, full)) {
      results.push(full);
    }
  }
  return results;
}

// ── 1. WordPress package detection ───────────────────────────────────────────

function parsePluginHeader(content) {
  const get = (key) => {
    const m = content.match(new RegExp(`\\*\\s+${key}:\\s*(.+)`, 'i'));
    return m ? m[1].trim() : null;
  };
  return { name: get('Plugin Name'), version: get('Version'), textDomain: get('Text Domain') };
}

function parseThemeHeader(content) {
  const get = (key) => {
    const m = content.match(new RegExp(`\\*\\s+${key}:\\s*(.+)`, 'i'));
    return m ? m[1].trim() : null;
  };
  return { name: get('Theme Name'), version: get('Version'), textDomain: get('Text Domain') };
}

function detectWpPackages() {
  const packages = [];

  // Find all PHP files that could be plugin/theme headers (shallow)
  const phpFiles = findFiles(root, (name) => name.endsWith('.php'), 2);
  const checkedDirs = new Set();

  for (const phpFile of phpFiles) {
    const dir = path.dirname(phpFile);
    const relDir = path.relative(root, dir);
    if (checkedDirs.has(relDir)) continue;

    const content = fs.readFileSync(phpFile, 'utf-8');

    if (/Plugin Name:/i.test(content)) {
      const h = parsePluginHeader(content);
      const composerJson = readJson(...relDir.split('/'), 'composer.json') ?? readJson('composer.json');
      checkedDirs.add(relDir);
      packages.push({
        type: 'plugin',
        path: relDir || '.',
        name: h.name,
        version: h.version,
        slug: h.textDomain ?? path.basename(dir),
        mainFile: path.relative(dir, phpFile),
        hasComposer: exists(...relDir.split('/'), 'composer.json'),
        hasTests: exists(...relDir.split('/'), 'tests') || exists(...relDir.split('/'), 'test'),
        hasPest: (readJson(...relDir.split('/'), 'composer.json') ?? {})?.['require-dev']?.['pestphp/pest'] != null,
      });
    } else if (/Theme Name:/i.test(content)) {
      const h = parseThemeHeader(content);
      checkedDirs.add(relDir);
      packages.push({
        type: 'theme',
        path: relDir || '.',
        name: h.name,
        version: h.version,
        slug: h.textDomain ?? path.basename(dir),
        hasComposer: exists(...relDir.split('/'), 'composer.json'),
        styleSheet: path.relative(dir, phpFile),
      });
    }
  }

  // Also detect by style.css (theme) in case main file is not PHP
  const styleCss = findFiles(root, (name) => name === 'style.css', 2);
  for (const cssFile of styleCss) {
    const dir = path.dirname(cssFile);
    const relDir = path.relative(root, dir);
    if (checkedDirs.has(relDir)) continue;
    const content = fs.readFileSync(cssFile, 'utf-8');
    if (/Theme Name:/i.test(content)) {
      const h = parseThemeHeader(content);
      checkedDirs.add(relDir);
      packages.push({
        type: 'theme',
        path: relDir || '.',
        name: h.name,
        version: h.version,
        slug: h.textDomain ?? path.basename(dir),
        hasComposer: exists(...relDir.split('/'), 'composer.json'),
        styleSheet: path.relative(dir, cssFile),
      });
    }
  }

  return packages;
}

// ── 2. WP root detection ─────────────────────────────────────────────────────

function detectWpRoot() {
  // Look for wp-config.php or wp-blog-header.php
  const candidates = ['.', 'web', 'public', 'wordpress', 'wp', 'src/wordpress'];
  for (const c of candidates) {
    if (exists(c, 'wp-config.php') || exists(c, 'wp-blog-header.php')) {
      return c === '.' ? '.' : c;
    }
  }
  // Look up to 2 levels deep
  const configs = findFiles(root, (name) => name === 'wp-config.php', 2);
  if (configs.length > 0) {
    return path.relative(root, path.dirname(configs[0]));
  }
  return null; // Playground-only / external WP
}

// ── 3. WP Engine remotes ──────────────────────────────────────────────────────

function detectWpeRemotes() {
  const output = run('git remote -v');
  if (!output) return [];
  const remotes = [];
  const seen = new Set();
  for (const line of output.split('\n')) {
    const m = line.match(/^(\S+)\s+(git@git\.wpengine\.com:[^\s]+)/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      const urlParts = m[2].match(/git@git\.wpengine\.com:(?:(production|staging|development)\/)?([^.]+)\.git/);
      remotes.push({
        name: m[1],
        url: m[2],
        environment: urlParts?.[1] ?? null,
        install: urlParts?.[2] ?? null,
      });
    }
  }
  return remotes;
}

// ── 4. Tooling detection ──────────────────────────────────────────────────────

function detectPackageManager() {
  if (exists('pnpm-lock.yaml') || exists('pnpm-workspace.yaml')) return 'pnpm';
  if (exists('yarn.lock')) return 'yarn';
  if (exists('bun.lockb')) return 'bun';
  if (exists('package-lock.json')) return 'npm';
  if (exists('package.json')) return 'npm';
  return null;
}

function detectJsWorkspaces() {
  const ws = [];
  // pnpm workspace
  const pnpmWs = read('pnpm-workspace.yaml');
  if (pnpmWs) {
    const pkgs = [...pnpmWs.matchAll(/[-]\s+['"]?([^'"#\n]+)['"]?/g)].map(m => m[1].trim());
    ws.push(...pkgs);
  }
  // npm/yarn workspaces
  const rootPkg = readJson('package.json');
  if (rootPkg?.workspaces) {
    ws.push(...(Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces.packages ?? []));
  }
  return ws;
}

function detectPhpTooling() {
  const composerJson = readJson('composer.json');
  const devDeps = { ...(composerJson?.require ?? {}), ...(composerJson?.['require-dev'] ?? {}) };
  return {
    hasComposer: exists('composer.json'),
    hasPhpcs: exists('vendor/bin/phpcs') || 'squizlabs/php_codesniffer' in devDeps,
    hasWpcs: 'wp-coding-standards/wpcs' in devDeps,
    hasPhpstan: exists('vendor/bin/phpstan') || 'phpstan/phpstan' in devDeps,
    hasPhpstanWp: 'szepeviktor/phpstan-wordpress' in devDeps,
    hasPest: 'pestphp/pest' in devDeps,
    phpcsConfig: exists('phpcs.xml.dist') ? 'phpcs.xml.dist' : exists('phpcs.xml') ? 'phpcs.xml' : null,
    phpstanConfig: exists('phpstan.neon.dist') ? 'phpstan.neon.dist' : exists('phpstan.neon') ? 'phpstan.neon' : null,
    composerScripts: Object.keys(composerJson?.scripts ?? {}),
  };
}

function detectJsTooling() {
  const rootPkg = readJson('package.json');
  const biomeJson = readJson('biome.json');
  const devDeps = { ...(rootPkg?.devDependencies ?? {}), ...(rootPkg?.dependencies ?? {}) };
  return {
    hasBiome: !!biomeJson || '@biomejs/biome' in devDeps,
    biomeVersion: biomeJson?.['$schema']?.match(/schemas\/(\d+\.\d+\.\d+)/)?.[1] ?? (devDeps['@biomejs/biome']?.replace(/^\^|~/, '') ?? null),
    hasEslint: 'eslint' in devDeps || exists('eslint.config.mjs') || exists('.eslintrc.js'),
    hasPrettier: 'prettier' in devDeps || exists('.prettierrc'),
    hasVitest: 'vitest' in devDeps,
    hasJest: 'jest' in devDeps,
    hasPlaywright: '@playwright/test' in devDeps || exists('playwright.config.ts') || exists('playwright.config.js'),
    hasWpScripts: '@wordpress/scripts' in devDeps,
    rootScripts: Object.keys(rootPkg?.scripts ?? {}),
  };
}

function detectGitHooks() {
  if (exists('.githooks')) return '.githooks';
  if (exists('.husky')) return '.husky';
  return null;
}

function detectPlayground() {
  const blueprints = findFiles(root, (name) => name.endsWith('-blueprint.json') || name === 'blueprint.json', 3);
  const runScript = findFiles(root, (name) => name.startsWith('run-') && name.endsWith('.sh'), 3)
    .filter(f => fs.readFileSync(f,'utf-8').includes('@wp-playground'));
  return {
    hasPlayground: blueprints.length > 0 || runScript.length > 0,
    blueprints: blueprints.map(f => path.relative(root, f)),
    scripts: runScript.map(f => path.relative(root, f)),
    hasWpEnv: exists('.wp-env.json'),
  };
}

function detectSatispress() {
  const composerJson = readJson('composer.json');
  const authJson = readJson('auth.json');
  const repos = Object.values(composerJson?.repositories ?? {});
  const satisRepo = repos.find(r => typeof r === 'object' && r.url?.includes('satispress'));
  return {
    configured: !!satisRepo,
    url: satisRepo?.url ?? null,
    hasAuthJson: !!authJson,
  };
}

function detectWpackagist() {
  const composerJson = readJson('composer.json');
  const repos = Object.values(composerJson?.repositories ?? {});
  return repos.some(r => typeof r === 'object' && r.url?.includes('wpackagist.org'));
}

// ── 5. GitHub CLI detection ─────────────────────────────────────────────────

function detectGithub() {
  // Check if gh is installed
  const ghInstalled = !!run('command -v gh 2>/dev/null || which gh 2>/dev/null');
  if (!ghInstalled) {
    return { ghInstalled: false, authenticated: false, account: null,
      repoOwner: null, repoName: null, repoUrl: null, visibility: null,
      defaultBranch: null, existingSecrets: [], missingSecrets: [],
      branchProtection: {}, error: 'gh CLI not installed' };
  }

  // Parse owner/repo from git remote origin
  const originUrl = run('git remote get-url origin 2>/dev/null');
  let repoOwner = null, repoName = null;
  if (originUrl) {
    const sshMatch = originUrl.match(/git@github\.com[:/]([^/]+)\/([^.]+)(?:\.git)?$/);
    const httpsMatch = originUrl.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+)/);
    const m = sshMatch ?? httpsMatch;
    if (m) { repoOwner = m[1]; repoName = m[2]; }
  }

  // Check authentication
  const authOut = run('gh auth status 2>&1');
  const authenticated = authOut ? /Logged in to github\.com/.test(authOut) : false;
  const accountMatch = authOut?.match(/account (\S+)/);
  const account = accountMatch?.[1] ?? null;

  if (!authenticated || !repoOwner || !repoName) {
    return { ghInstalled: true, authenticated, account, repoOwner, repoName,
      repoUrl: repoOwner && repoName ? `https://github.com/${repoOwner}/${repoName}` : null,
      visibility: null, defaultBranch: null, existingSecrets: [], missingSecrets: [],
      branchProtection: {}, error: authenticated ? 'no GitHub remote found' : 'not authenticated' };
  }

  // Repo info
  let repoInfo = null;
  try {
    const info = run(`gh repo view ${repoOwner}/${repoName} --json name,owner,url,defaultBranchRef,visibility 2>/dev/null`);
    if (info) repoInfo = JSON.parse(info);
  } catch {}

  const defaultBranch = repoInfo?.defaultBranchRef?.name ?? 'main';
  const visibility = repoInfo?.visibility ?? null;
  const repoUrl = repoInfo?.url ?? `https://github.com/${repoOwner}/${repoName}`;

  // Existing secrets
  const secretsOut = run(`gh secret list --repo ${repoOwner}/${repoName} --json name 2>/dev/null`);
  let existingSecrets = [];
  try { existingSecrets = secretsOut ? JSON.parse(secretsOut).map(s => s.name) : []; } catch {}

  // Required secrets for WP Engine deploy
  const REQUIRED_SECRETS = [
    'WPE_SSH_KEY', 'WPE_SSH_KNOWN_HOSTS',
    'WPE_PROD_INSTALL', 'WPE_PROD_GIT_URL',
    'WPE_STAGING_INSTALL', 'WPE_STAGING_GIT_URL',
    'WPE_DEV_INSTALL', 'WPE_DEV_GIT_URL',
    'WPE_API_USER', 'WPE_API_PASSWORD',
  ];
  const existingSet = new Set(existingSecrets);
  const missingSecrets = REQUIRED_SECRETS.filter(s => !existingSet.has(s));

  // Branch protection check
  const branchProtection = {};
  for (const branch of [defaultBranch, 'staging', 'develop']) {
    const protOut = run(`gh api repos/${repoOwner}/${repoName}/branches/${branch}/protection 2>/dev/null`);
    try {
      const prot = protOut ? JSON.parse(protOut) : null;
      branchProtection[branch] = prot && !prot.message ? {
        protected: true,
        requiredChecks: prot.required_status_checks?.contexts ?? [],
        requiredReviewers: prot.required_pull_request_reviews?.required_approving_review_count ?? 0,
        enforceAdmins: prot.enforce_admins?.enabled ?? false,
        allowForcePushes: prot.allow_force_pushes?.enabled ?? true,
      } : { protected: false };
    } catch {
      branchProtection[branch] = { protected: false };
    }
  }

  return {
    ghInstalled: true, authenticated, account,
    repoOwner, repoName, repoUrl, visibility, defaultBranch,
    existingSecrets, missingSecrets, branchProtection,
    error: null,
  };
}

// ── 6. Assemble result ────────────────────────────────────────────────────────

const wpPackages = detectWpPackages();
const wpRoot = detectWpRoot();
const wpeRemotes = detectWpeRemotes();
const pm = detectPackageManager();
const jsWorkspaces = detectJsWorkspaces();
const php = detectPhpTooling();
const js = detectJsTooling();
const playground = detectPlayground();
const gitHooks = detectGitHooks();

const result = {
  repoRoot: root,
  isMonorepo: wpPackages.length > 1 || jsWorkspaces.length > 0,
  packageManager: pm,
  jsWorkspaces,

  wpPackages,
  wpRoot,
  wpRootExists: wpRoot !== null,
  playgroundOnly: wpRoot === null,

  wpeRemotes,
  hasWpeRemote: wpeRemotes.length > 0,

  php,
  js,
  playground,

  satispress: detectSatispress(),
  wpackagist: detectWpackagist(),

  gitHooks,
  hasAgentKit: exists('.wp-agent-kit-manifest.github.json') ||
               exists('.wp-agent-kit-manifest.pi.json') ||
               exists('.agents', 'skills'),
  hasAgentsDir: exists('.agents'),
  hasAgentsMd: exists('AGENTS.md'),

  gitBranch: run('git rev-parse --abbrev-ref HEAD'),
  gitRemotes: (() => {
    const out = run('git remote -v');
    if (!out) return [];
    const seen = new Set();
    return out.split('\n')
      .map(l => l.match(/^(\S+)\s+(\S+)\s+\(fetch\)/))
      .filter(Boolean)
      .filter(m => !seen.has(m[1]) && seen.add(m[1]))
      .map(m => ({ name: m[1], url: m[2] }));
  })(),

  github: detectGithub(),
};

// ── 6. Output ─────────────────────────────────────────────────────────────────

if (pretty) {
  const pkg = (p) => `  ${p.type === 'plugin' ? '🔌' : '🎨'} ${p.name ?? p.slug} (${p.path}) v${p.version ?? '?'}`;
  console.log(`\n── WordPress Project Structure ─────────────────────────────`);
  console.log(`  Repo root:      ${root}`);
  console.log(`  Monorepo:       ${result.isMonorepo ? 'yes' : 'no'}`);
  console.log(`  Package mgr:    ${pm ?? 'none detected'}`);
  console.log(`  WP root:        ${wpRoot ?? 'none (Playground-only)'}`);
  console.log(`\n  WP packages (${wpPackages.length}):`);
  wpPackages.forEach(p => console.log(pkg(p)));
  console.log(`\n  WP Engine remotes (${wpeRemotes.length}):`);
  wpeRemotes.forEach(r => console.log(`  → ${r.name}: ${r.url} (install: ${r.install})`));
  console.log(`\n  PHP tooling:    PHPCS=${php.hasPhpcs} PHPSTAN=${php.hasPhpstan} Pest=${php.hasPest}`);
  console.log(`  JS tooling:     Biome=${js.hasBiome} Vitest=${js.hasVitest} Playwright=${js.hasPlaywright}`);
  console.log(`  Playground:     ${playground.hasPlayground ? `yes (${playground.blueprints.length} blueprints)` : 'no'}`);
  console.log(`  SatisPress:     ${result.satispress.configured ? result.satispress.url : 'not configured'}`);
  console.log(`  WPackagist:     ${result.wpackagist ? 'yes' : 'no'}`);
  console.log(`  Agent kit:      ${result.hasAgentKit ? 'installed' : 'not installed'}`);
  console.log(`  Git hooks:      ${gitHooks ?? 'none'}`);

  // GitHub section
  const gh = result.github;
  console.log(`\n  GitHub CLI:     ${gh.ghInstalled ? `installed (${gh.authenticated ? `✓ ${gh.account}` : '✗ not authenticated'})` : '✗ not installed'}`);
  if (gh.ghInstalled && gh.authenticated && gh.repoOwner) {
    console.log(`  GitHub repo:    ${gh.repoUrl} (${gh.visibility?.toLowerCase()})`);
    console.log(`  Secrets:        ${gh.existingSecrets.length} set, ${gh.missingSecrets.length} missing`);
    if (gh.missingSecrets.length > 0) {
      console.log(`  Missing:        ${gh.missingSecrets.join(', ')}`);
    }
    const mainBranch = gh.defaultBranch ?? 'main';
    const prot = gh.branchProtection[mainBranch];
    console.log(`  Branch prot:    ${mainBranch}=${prot?.protected ? '✓ protected' : '✗ unprotected'}`);
  } else if (gh.error) {
    console.log(`  GitHub:         ${gh.error}`);
  }
  console.log();
} else {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
