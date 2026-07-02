# Composer Setup for WordPress Projects

## Two-level Composer structure (from wp-agent-os)

The wp-agent-os pattern cleanly separates dev tooling from runtime deps:

```
project/
├── composer.json          ← ROOT: dev tooling only. Never shipped.
│                            Contains: phpcs, wpcs, phpstan, phpcompatibility
├── vendor/                ← gitignored. Only dev tools.
│
└── wpaos/
    ├── composer.json      ← PLUGIN: test deps only (Pest). Never shipped.
    └── vendor/            ← gitignored.
```

**The rule:** plugins and themes should have **zero runtime Composer dependencies**.
All PHP dependencies are either:
- Part of WordPress core, or
- Managed at the WP install level via Bedrock/Composer-managed WP

---

## Root `composer.json` — PHP dev tooling template

```json
{
  "name": "myorg/my-project-dev",
  "description": "Dev tooling — PHPCS/PHPStan. NOT shipped with plugins.",
  "type": "project",
  "license": "GPL-2.0-or-later",
  "require": {
    "php": ">=8.1"
  },
  "require-dev": {
    "squizlabs/php_codesniffer": "^3.11",
    "wp-coding-standards/wpcs": "^3.1",
    "phpcompatibility/phpcompatibility-wp": "^2.1",
    "dealerdirect/phpcodesniffer-composer-installer": "^1.0",
    "szepeviktor/phpstan-wordpress": "^2.0"
  },
  "config": {
    "allow-plugins": {
      "dealerdirect/phpcodesniffer-composer-installer": true
    },
    "sort-packages": true
  },
  "scripts": {
    "register-standards": "phpcs --config-set installed_paths vendor/wp-coding-standards/wpcs,...",
    "post-install-cmd": "@register-standards",
    "post-update-cmd": "@register-standards",
    "phpcs":  "phpcs",
    "phpcbf": "phpcbf",
    "fix":    "@phpcbf",
    "phpstan":"phpstan analyse --memory-limit=1G",
    "lint":   ["@phpcs", "@phpstan"],
    "gate":   ["@phpcbf", "@phpcs", "@phpstan"]
  }
}
```

Key `scripts` mnemonics from wp-agent-os:
- `composer fix` = phpcbf (auto-fix) — run FIRST
- `composer lint` = phpcs + phpstan (check)
- `composer gate` = fix + lint (full pre-push gate)

---

## Per-plugin `composer.json` — Pest tests only

```json
{
  "name": "myorg/my-plugin",
  "type": "wordpress-plugin",
  "require-dev": {
    "pestphp/pest": "^3.0"
  },
  "autoload-dev": {
    "psr-4": { "MyPlugin\\Tests\\": "tests/" }
  },
  "scripts": {
    "test":            "pest --configuration=tests/phpunit.xml",
    "test:unit":       "pest --configuration=tests/phpunit.xml --group=unit",
    "test:integration":"pest --configuration=tests/phpunit.xml --group=integration"
  },
  "config": {
    "allow-plugins": { "pestphp/pest-plugin": true }
  }
}
```

---

## `phpcs.xml.dist` — WordPress coding standards

```xml
<?xml version="1.0"?>
<ruleset name="my-plugin">
  <description>WordPress coding standards + PHP 8.1 compat.</description>

  <file>src</file>          <!-- or your plugin root -->
  <exclude-pattern>*/vendor/*</exclude-pattern>
  <exclude-pattern>*/node_modules/*</exclude-pattern>
  <exclude-pattern>*/tests/*</exclude-pattern>

  <arg name="extensions" value="php"/>
  <arg name="basepath" value="."/>
  <arg name="parallel" value="8"/>
  <arg name="colors"/>
  <arg value="sp"/>

  <rule ref="WordPress-Extra"/>

  <config name="minimum_wp_version" value="6.7"/>
  <config name="testVersion" value="8.1-"/>
  <rule ref="PHPCompatibilityWP"/>

  <rule ref="WordPress.WP.I18n">
    <properties>
      <property name="text_domain" type="array">
        <element value="my-plugin"/>
      </property>
    </properties>
  </rule>

  <rule ref="WordPress.NamingConventions.PrefixAllGlobals">
    <properties>
      <property name="prefixes" type="array">
        <element value="myplugin"/>
        <element value="MYPLUGIN"/>
      </property>
    </properties>
  </rule>
</ruleset>
```

---

## `phpstan.neon.dist` — Static analysis with WordPress stubs

```neon
includes:
  - vendor/szepeviktor/phpstan-wordpress/extension.neon

parameters:
  level: 5
  paths:
    - src
  excludePaths:
    - src/vendor/*
    - src/tests/*
  treatPhpDocTypesAsCertain: false
```

---

## WPackagist — free Composer repo for WordPress.org plugins

```json
{
  "repositories": [{
    "type": "composer",
    "url": "https://wpackagist.org",
    "only": ["wpackagist-plugin/*", "wpackagist-theme/*"]
  }],
  "require": {
    "wpackagist-plugin/advanced-custom-fields": "^6.0",
    "wpackagist-plugin/wordpress-seo": ">=7.0",
    "wpackagist-theme/twentytwentyfive": "*",
    "composer/installers": "^2.0"
  },
  "extra": {
    "installer-paths": {
      "web/app/plugins/{$name}/": ["type:wordpress-plugin"],
      "web/app/themes/{$name}/":  ["type:wordpress-theme"]
    }
  }
}
```

The `only` filter is important — without it Composer queries WPackagist for every package lookup, making installs slow.

---

## SatisPress — private Composer repo for premium plugins

SatisPress is a WordPress plugin that wraps your premium plugin installs into a Composer repository. You host it on a dedicated WordPress site.

**Endpoint:** `https://your-satispress-site.com/satispress/packages.json`
**Auth:** HTTP Basic — API Key as username, literal `satispress` as password.

### `composer.json` setup

```json
{
  "repositories": {
    "satispress": {
      "type": "composer",
      "url": "https://your-satispress-site.com/satispress/"
    }
  },
  "require": {
    "satispress/gravityforms": "*",
    "satispress/acf-pro": ">=6.0"
  }
}
```

### `auth.json` (per machine, gitignored)

```json
{
  "http-basic": {
    "your-satispress-site.com": {
      "username": "<32-char-api-key>",
      "password": "satispress"
    }
  }
}
```

Or configure via CLI:
```bash
composer config http-basic.your-satispress-site.com <API_KEY> satispress
```

### GitHub Actions — `auth.json` as secret

```yaml
- name: Configure Composer auth
  run: |
    echo '${{ secrets.COMPOSER_AUTH_JSON }}' > auth.json
```
Store the full `auth.json` contents as `COMPOSER_AUTH_JSON` in GitHub Secrets.

### Package naming

Packages are named `satispress/<plugin-slug>` by default. Customize with the `satispress_vendor` filter in the SatisPress WordPress site.

---

## Combined `composer.json` (WPackagist + SatisPress + dev tools)

For a Bedrock-style project that manages WP core + premium plugins:

```json
{
  "name": "myorg/my-site",
  "type": "project",
  "repositories": {
    "wpackagist": {
      "type": "composer",
      "url": "https://wpackagist.org",
      "only": ["wpackagist-plugin/*", "wpackagist-theme/*"]
    },
    "satispress": {
      "type": "composer",
      "url": "https://packages.myorg.com/satispress/"
    }
  },
  "require": {
    "php": ">=8.1",
    "roots/wordpress": "^6.7",
    "composer/installers": "^2.0",
    "wpackagist-plugin/wordpress-seo": ">=7.0",
    "satispress/gravityforms": "^2.8"
  },
  "require-dev": {
    "squizlabs/php_codesniffer": "^3.11",
    "wp-coding-standards/wpcs": "^3.1",
    "szepeviktor/phpstan-wordpress": "^2.0"
  }
}
```
