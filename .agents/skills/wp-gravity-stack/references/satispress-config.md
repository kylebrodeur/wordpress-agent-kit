# SatisPress Configuration for the Gravity Stack

SatisPress turns a WordPress site into a private Composer repository for premium plugins.
Use it to manage Gravity Forms, Gravity SMTP, Gravity Wiz products, and GravityView
via Composer — enabling reproducible installs, version pinning, and CI/CD workflows.

---

## SatisPress site setup

SatisPress is a WordPress plugin installed on a dedicated management WordPress site
(separate from your client sites).

```bash
# Install SatisPress on your management WordPress site
wp plugin install satispress --activate

# After activating, configure it at: /wp-admin/admin.php?page=satispress
# Then install and register each premium plugin on that site
```

**Register premium plugins** in SatisPress by:
1. Installing the plugin normally on the SatisPress WP site
2. Going to Plugins → selecting each → "Add to SatisPress"
3. Creating an API Key: Users → API Keys → Generate

---

## `composer.json` — U of Digital full stack

```json
{
  "name": "uofdigital/uofd-site",
  "description": "U of Digital WordPress site — Gravity Stack",
  "type": "project",
  "license": "proprietary",
  "require": {
    "php": ">=8.1",
    "composer/installers": "^2.0",

    "wpackagist-plugin/pods": "^3.0",
    "wpackagist-plugin/gravityformscli": "*",

    "satispress/gravityforms": "*",
    "satispress/gravitysmtp": ">=2.1.5",
    "satispress/spellbook": "*",
    "satispress/gravity-connect": "*",
    "satispress/gravityview": "*",

    "satispress/gravityformsturnstile": "*",
    "satispress/gravityformsuserregistration": "*",
    "satispress/gravityformswebhooks": "*",
    "satispress/gravityformssignature": "*"
  },
  "require-dev": {
    "squizlabs/php_codesniffer": "^3.11",
    "wp-coding-standards/wpcs": "^3.1",
    "phpcompatibility/phpcompatibility-wp": "^2.1",
    "dealerdirect/phpcodesniffer-composer-installer": "^1.0",
    "szepeviktor/phpstan-wordpress": "^2.0"
  },
  "repositories": {
    "wpackagist": {
      "type": "composer",
      "url": "https://wpackagist.org",
      "only": ["wpackagist-plugin/*", "wpackagist-theme/*"]
    },
    "satispress": {
      "type": "composer",
      "url": "https://packages.uof.digital/satispress/"
    }
  },
  "config": {
    "allow-plugins": {
      "composer/installers": true,
      "dealerdirect/phpcodesniffer-composer-installer": true
    },
    "sort-packages": true
  },
  "extra": {
    "installer-paths": {
      "wp-content/plugins/{$name}/": ["type:wordpress-plugin"],
      "wp-content/themes/{$name}/":  ["type:wordpress-theme"],
      "wp-content/mu-plugins/{$name}/": ["type:wordpress-muplugin"]
    }
  },
  "scripts": {
    "phpcs":   "phpcs",
    "phpcbf":  "phpcbf",
    "fix":     "@phpcbf",
    "phpstan": "phpstan analyse --memory-limit=1G",
    "lint":    ["@phpcs", "@phpstan"],
    "gate":    ["@phpcbf", "@phpcs", "@phpstan"]
  }
}
```

---

## `auth.json` — SatisPress credentials

Store per-machine, **never commit to git**. Add `auth.json` to `.gitignore`.

```json
{
  "http-basic": {
    "packages.uof.digital": {
      "username": "<32-char-satispress-api-key>",
      "password": "satispress"
    }
  }
}
```

Set via CLI:
```bash
composer config http-basic.packages.uof.digital <API_KEY> satispress
```

For GitHub Actions, store the full `auth.json` as a secret:
```yaml
- name: Configure Composer auth
  run: echo '${{ secrets.COMPOSER_AUTH_JSON }}' > auth.json
```

---

## WP-CLI install alternative (no Composer)

If SatisPress/Composer is not yet configured, use WP-CLI with the license key:

```bash
# Set in wp-config.php first:
# define('GF_LICENSE_KEY', 'your-key');

wp gf install --activate --force
wp gf install gravitysmtp --activate --force
wp gf install gravityformscli --activate
wp gf install gravityformsturnstile --activate
wp gf install gravityformsuserregistration --activate
wp gf install gravityformswebhooks --activate
wp gf install gravityformssignature --activate

# Gravity Wiz products — must be done via their download portal
# or SatisPress (they don't use the wp gf install command)
wp plugin install https://gravitykit.com/downloads/... --activate  # get URL from license portal
```

---

## SatisPress package names

| Plugin | SatisPress slug | WPackagist slug |
|--------|-----------------|-----------------|
| Gravity Forms | `satispress/gravityforms` | — (premium) |
| Gravity SMTP | `satispress/gravitysmtp` | — (premium) |
| Gravity Wiz Spellbook | `satispress/spellbook` | — (premium) |
| Gravity Connect | `satispress/gravity-connect` | — (premium) |
| GravityView | `satispress/gravityview` | — (premium) |
| Gravity Forms CLI | `wpackagist-plugin/gravityformscli` | ✓ free |
| Pods | `wpackagist-plugin/pods` | ✓ free |
| GF Turnstile | `satispress/gravityformsturnstile` | — (free but GF add-on) |
| GF User Registration | `satispress/gravityformsuserregistration` | — (free but GF add-on) |
| GF Webhooks | `satispress/gravityformswebhooks` | — (free but GF add-on) |

> **Note**: Free Gravity Forms add-ons (Turnstile, User Registration, Webhooks) can be
> installed via `wp gf install <slug>` without SatisPress, or registered in SatisPress
> for consistent Composer-managed workflows.

---

## Version pinning — Gravity SMTP security

Always pin Gravity SMTP to `>=2.1.5` to prevent CVE-2026-4020:

```json
"satispress/gravitysmtp": ">=2.1.5"
```

In CI, verify immediately after install:

```bash
VERSION=$(wp gf version gravitysmtp)
if ! php -r "exit(version_compare('$VERSION', '2.1.5', '>=') ? 0 : 1);"; then
  echo "❌ Gravity SMTP $VERSION is vulnerable (CVE-2026-4020). Update required."
  exit 1
fi
```

---

## wp-config.php constants for the full stack

```php
// Gravity Forms license (required for wp gf install/update)
define('GF_LICENSE_KEY', getenv('GF_LICENSE_KEY'));

// Gravity SMTP — credentials in constants, not wp_options (CVE-2026-4020 mitigation)
define('GRAVITY_SMTP_PROVIDER', 'sendgrid');
define('GRAVITY_SMTP_SENDGRID_API_KEY', getenv('SENDGRID_API_KEY'));
define('GRAVITY_SMTP_FROM_EMAIL', 'noreply@uof.digital');
define('GRAVITY_SMTP_FROM_NAME', 'U of Digital');

// Gravity Connect / OpenAI
define('OPENAI_API_KEY', getenv('OPENAI_API_KEY'));

// Local dev: remote media (never deploy — remove or gate with WP_ENV check)
if (defined('WP_LOCAL_DEV') && WP_LOCAL_DEV) {
    // Set via WP-CLI after DB pull instead of here:
    // wp option update upload_url_path 'https://dev.uof.digital/wp-content/uploads'
}
```

---

## `.deployignore` for WP Engine rsync deploy

Exclude Composer and dev files from production deploy:

```
.git
node_modules
.env
.env.*
composer.json
composer.lock
auth.json
phpcs.xml*
phpstan.neon*
biome.json
*.test.*
tests/
.github
package.json
package-lock.json
pnpm-lock.yaml
README.md
CHANGELOG.md
AGENTS.md
.agents/
.pi/
```
