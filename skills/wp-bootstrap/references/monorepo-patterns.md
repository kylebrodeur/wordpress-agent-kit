# WordPress Monorepo Patterns

Common structures agents will encounter. `detect-structure.mjs` identifies them automatically.

---

## Pattern 1 — Single plugin/theme repo (most common)

The repo IS the plugin or theme. `repoRoot === wpPackageDir`.

```
my-plugin/
├── my-plugin.php          ← Plugin header here
├── includes/
├── assets/src/            ← JS/CSS source (gitignored dist/)
├── tests/
├── composer.json          ← plugin-level (Pest tests)
├── package.json           ← @wordpress/scripts or Biome
└── .agents/skills/        ← installed by wp-agent-kit
```

**detect-structure.mjs output:**
```json
{
  "isMonorepo": false,
  "wpPackages": [{ "type": "plugin", "path": ".", "name": "My Plugin" }],
  "wpRoot": "."  // or null if Playground-only
}
```

**WP Engine deploy:** push the entire repo.
**Playground:** `--mount=.:/wordpress/wp-content/plugins/my-plugin`

---

## Pattern 2 — wp-agent-os style (WP packages + non-WP packages at root)

Multiple WP packages and JS packages at the top level. No WP core in repo.

```
project/
├── wpaos/                 ← companion plugin (Plugin Name: in wpaos.php)
├── wpaos-blocks/          ← generated plugin (Plugin Name: in wpaos-blocks.php)
├── wpaos-theme/           ← block theme (Theme Name: in style.css)
├── design-system/         ← TypeScript/Node (not a WP package)
├── backend/               ← Firebase/Genkit (not a WP package)
├── web/                   ← Next.js (not a WP package)
├── composer.json          ← ROOT: dev tooling only (PHPCS/PHPStan) — NOT shipped
├── pnpm-workspace.yaml    ← workspace includes design-system, backend, web, tools/e2e
├── biome.json             ← root JS/TS lint+format
└── tools/
    ├── setup.sh           ← one-command bootstrap
    ├── package-plugins.sh ← build + zip WP packages
    └── playground/        ← Playground launch + verify scripts
```

**detect-structure.mjs output:**
```json
{
  "isMonorepo": true,
  "packageManager": "pnpm",
  "wpPackages": [
    { "type": "plugin", "path": "wpaos", "name": "WP Agent OS" },
    { "type": "plugin", "path": "wpaos-blocks", "name": "WP Agent OS Blocks" },
    { "type": "theme", "path": "wpaos-theme", "name": "WP Agent OS Theme" }
  ],
  "wpRoot": null,
  "playgroundOnly": true
}
```

**WP Engine deploy:** `bash tools/package-plugins.sh` → upload zips. No git push from monorepo.
**Playground:** mount each WP package separately. See Playground patterns reference.

---

## Pattern 3 — Bedrock / full-stack (WP core in repo)

Roots Bedrock or similar — WP core managed by Composer, web root is a subdirectory.

```
project/
├── web/
│   ├── wp/                ← WP core (managed by Composer)
│   ├── app/
│   │   ├── plugins/       ← custom plugins here
│   │   └── themes/        ← custom themes here
│   └── wp-config.php
├── config/
│   └── environments/
├── composer.json          ← Bedrock manages WP core + plugins via Composer
└── .env
```

**detect-structure.mjs output:**
```json
{
  "wpRoot": "web",
  "wpPackages": [],  // plugins detected under web/app/plugins/
  "wpackagist": true  // Bedrock always uses WPackagist
}
```

**WP Engine deploy:** push the whole repo OR just the `web/` subtree:
```bash
git subtree push --prefix=web wpe-prod main
```
**wp-cli.yml:**
```yaml
path: ./web
@production:
  ssh: <install>@<install>.ssh.wpengine.net
  path: /home/wpe-user/sites/<install>
```

---

## Pattern 4 — Agency monorepo (multiple client sites)

```
agency-repo/
├── client-a/
│   ├── plugins/my-plugin/
│   └── themes/my-theme/
├── client-b/
│   └── plugins/client-b-plugin/
└── shared/
    └── components/        ← shared JS library
```

Not well-suited for a single wp-agent-kit install. Better to:
- Install wp-agent-kit per client: `wp-agent-kit install ./client-a`
- Or: one install at root with per-client `wp-cli.yml` aliases

---

## Key questions for each structure

1. **Is WP core in this repo?** (`wpRoot` not null)
   - Yes → use `--path` in WP-CLI, `wp-cli.yml` `path:` at that location
   - No → Playground-only local dev, deploy via zip or separate deploy repo

2. **Are plugins/themes installed into a WP install, or are they standalone packages?**
   - Standalone → Playground mounts, zip deploy, WPackagist for dependencies
   - In a WP install → `wp plugin install`, WP-CLI, Bedrock patterns

3. **How many WP packages?**
   - 1 → push the whole repo to WP Engine
   - 2+ → package individually, upload each as a zip; OR subtree push

4. **Is there a build step?**
   - Yes (JS assets, generated plugins) → CI must build before deploying
   - No → push source files directly

---

## wp-bootstrap.config.json — optional config file

Place at repo root to override detection:

```json
{
  "packageManager": "pnpm",
  "jsWorkspaces": ["design-system", "backend", "web", "tools/e2e"],
  "phpDirs": [".", "wpaos"],
  "hooksDir": ".githooks",
  "buildCommand": "cd design-system && pnpm run build && pnpm run build:blocks",
  "wpPackages": [
    { "path": "wpaos",        "type": "plugin", "slug": "wpaos",        "mainFile": "wpaos.php" },
    { "path": "wpaos-blocks", "type": "plugin", "slug": "wpaos-blocks", "mainFile": "wpaos-blocks.php" },
    { "path": "wpaos-theme",  "type": "theme",  "slug": "wpaos-theme" }
  ],
  "playgroundMounts": [
    "./wpaos:/wordpress/wp-content/plugins/wpaos",
    "./wpaos-blocks:/wordpress/wp-content/plugins/wpaos-blocks",
    "./wpaos-theme:/wordpress/wp-content/themes/wpaos-theme"
  ],
  "wpeEnvironments": {
    "production": { "install": "mysite",    "gitUrl": "git@git.wpengine.com:mysite.git" },
    "staging":    { "install": "mysitestg", "gitUrl": "git@git.wpengine.com:mysitestg.git" },
    "development":{ "install": "mysitedev", "gitUrl": "git@git.wpengine.com:mysitedev.git" }
  }
}
```
