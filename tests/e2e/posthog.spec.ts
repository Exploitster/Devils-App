import { test, expect, type Page, type BrowserContext } from '@playwright/test';
test.skip(!process.env.NEXT_PUBLIC_POSTHOG_KEY, 'Requires the synthetic PostHog project fixture.');
// PostHog silently discards automated browsers (HeadlessChrome, navigator.webdriver).
// Present a regular desktop browser so the opt-in path can be observed.
test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
  });
});

async function interceptPostHog(target: Page | BrowserContext) {
  const requests: string[] = [];
  await target.route(/https:\/\/(us|eu)\.i\.posthog\.com\//, async route => { requests.push(new URL(route.request().url()).pathname); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' }); });
  return requests;
}
const loaded = (page: Page) => page.evaluate(() => Boolean((window as Window & { devilsPostHogLoaded?: boolean }).devilsPostHogLoaded));
const phKeys = (page: Page) => page.evaluate(() => [...Object.keys(localStorage), ...document.cookie.split(';').map(c => c.split('=')[0].trim())].filter(k => k.startsWith('ph_')));

test('PostHog sends nothing before consent and starts only after opt-in', async ({ page }) => {
  const requests = await interceptPostHog(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Optional website analytics' })).toBeVisible();
  await expect(page.getByText(/PostHog/).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toHaveLength(0);
  expect(await loaded(page)).toBe(false);
  await page.getByRole('button', { name: 'Allow website analytics', exact: true }).click();
  await expect.poll(() => requests.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(requests.every(path => !/flags|decide|array|recorder|surveys/.test(path))).toBe(true);
  expect(await phKeys(page)).not.toHaveLength(0);
});

test('PostHog does not carry into private pages', async ({ page }) => {
  await interceptPostHog(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow website analytics', exact: true }).click();
  await expect.poll(() => loaded(page)).toBe(true);
  await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(await loaded(page)).toBe(false);
});

test('declining or withdrawing removes PostHog identifiers and stops loading', async ({ page, context }) => {
  const requests = await interceptPostHog(context);
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow website analytics', exact: true }).click();
  await expect.poll(() => phKeys(page).then(keys => keys.length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Analytics privacy choices', exact: true }).click();
  await page.getByRole('button', { name: 'Turn analytics off', exact: true }).click();
  await expect.poll(() => loaded(page)).toBe(false);
  await expect.poll(() => phKeys(page)).toEqual([]);
  const before = requests.length;
  await page.goto('/features');
  await page.waitForTimeout(1000);
  expect(await loaded(page)).toBe(false);
  expect(requests.length).toBe(before);
});
