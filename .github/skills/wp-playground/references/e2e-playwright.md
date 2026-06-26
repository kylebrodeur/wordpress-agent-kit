# E2E Testing with Playwright + WordPress Playground

## Install

```bash
npm install --save-dev @playwright/test @wp-playground/cli
npx playwright install chromium
```

## playwright.config.ts

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { screenshot: 'only-on-failure', trace: 'on-first-retry' },
});
```

## Server lifecycle

**Shared** (faster, tests can affect each other — use for read-only tests):
```ts
test.beforeAll(async () => { cli = await runCLI({ command: 'server', blueprint }); });
test.afterAll(async () => { await cli?.server?.close(); });
```

**Per-test** (isolated, slower — use when tests modify state):
```ts
test.beforeEach(async () => { cli = await runCLI({ command: 'server', blueprint }); });
test.afterEach(async () => { await cli?.server?.close(); });
```

## Blueprint fixtures

Installing from wordpress.org:
```ts
steps: [{ step: 'installPlugin', pluginData: { resource: 'wordpress.org/plugins', slug: 'contact-form-7' } }]
```

Creating content:
```ts
steps: [{ step: 'runPHP', code: `<?php require '/wordpress/wp-load.php'; wp_insert_post([...]);` }]
```

## WordPress-specific locator guidance

- `page.getByRole('button', { name: 'Save Changes' })` — works for standard WP buttons
- `page.getByLabel('API Key')` — works for labeled form fields
- `page.locator('#wpadminbar')` — CSS required for WP core layout elements (no ARIA)
- Add `data-testid` to your own plugin markup for stable selectors
- Run `npx playwright codegen localhost:9400/wp-admin/` to auto-generate locators

## Page Object Model

```ts
// tests/e2e/pages/plugin-settings.ts
export class PluginSettingsPage {
  constructor(readonly page: Page) {}
  async goto(baseUrl: string) { await this.page.goto(`${baseUrl}/wp-admin/options-general.php?page=my-plugin`); }
  async setApiKey(key: string) {
    await this.page.getByLabel('API Key').fill(key);
    await this.page.getByRole('button', { name: 'Save Changes' }).click();
  }
  async expectSaved() { await expect(this.page.getByText('Settings saved')).toBeVisible(); }
}
```

## GitHub Actions CI

```yaml
name: E2E Tests
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ hashFiles('package-lock.json') }}
      - if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install chromium --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with: { name: playwright-report, path: playwright-report/, retention-days: 30 }
```

## Troubleshooting

- **Timeout errors** — increase `timeout` in config; CI needs 120–180s
- **Port conflicts** — don't hardcode ports; use `cli.serverUrl`
- **Browser not found** — run `npx playwright install chromium`
- **Passes locally, fails CI** — increase timeouts, ensure `workers: 1`
- **Debug** — `npx playwright test --debug` or `--ui` for interactive mode

## Docs

- https://wordpress.github.io/wordpress-playground/guides/e2e-testing-with-playwright
- https://wordpress.github.io/wordpress-playground/guides/programmatic-playground-cli
