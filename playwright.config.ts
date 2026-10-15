import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const browser = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const database = `.local/e2e-${randomUUID()}.sqlite`;
export default defineConfig({ testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60000, use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure', launchOptions: { executablePath: browser } }, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }], webServer: { command: `DEVILS_RUNTIME_MODE=local DEVILS_PAYMENTS_ENABLED=false DEVILS_SQLITE_PATH=${database} DEVILS_LOCAL_AUTH_SECRET=e2e-only-secret-at-least-32-characters DEVILS_BETA_ACTIVE=true npm run dev`, url: 'http://127.0.0.1:3000', reuseExistingServer: false, timeout: 120000 } });
