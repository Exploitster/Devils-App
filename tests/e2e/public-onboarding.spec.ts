import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public signup, guided onboarding, free conversation, history search, and password sign-in work together', async ({ page }, testInfo) => {
  const email = `public-${Date.now()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Taylor');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('My long unique test password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  const firstCreatedAt=(await (await page.request.get('/api/account')).json()).profile.createdAt;
  await expect(page.getByLabel('What should we call you?')).toHaveValue('Taylor');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /A personal decision/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Let’s think it through' }).click();
  await expect(page).toHaveURL(/\/home\?perspective=philosophy/);
  await expect(page.getByRole('button', { name: /^Philosophy:/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await page.getByLabel('Your message').fill('I am deciding whether to leave my work because I value freedom and have obligations to my family.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Strengths', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Make a hand-back card' }).click();
  await expect(page.getByRole('heading', { name: /Hand-back card/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('conversation-desktop.png'), fullPage: true, animations: 'disabled' });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown' }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/hand-back-.*\.md/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('conversation-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByLabel('Search conversations').fill('something that is not here');
  await expect(page.getByRole('heading', { name: 'No thoughts found here.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('My long unique test password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText('Good to see you, Taylor.')).toBeVisible();
  expect((await (await page.request.get('/api/auth')).json()).user.onboarded).toBe(true);
  expect((await (await page.request.get('/api/account')).json()).profile.createdAt).toBe(firstCreatedAt);
});
test('new public pages work on a phone, reset links fail gracefully, and Google does not fake success in local mode', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/signup', '/forgot-password', '/privacy', '/terms']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (path === '/') await page.screenshot({ path: testInfo.outputPath('landing-mobile.png'), fullPage: true, animations: 'disabled' });
  }
  await page.goto('/reset-password');
  await expect(page.getByRole('link', { name: 'Request a new reset link' })).toBeVisible();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.locator('.notice[role=alert]')).toContainText('hosted app');
  await expect(page).toHaveURL(/\/login/);
});

test('a delayed onboarding account check cannot redirect after leaving the page', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let delay = true;
  await page.route('**/api/auth', async route => {
    if (!delay) { await route.continue(); return; }
    await waiting;
    await route.fulfill({ json: { user: null, config: { runtimeMode: 'local' } } });
  });
  await page.goto('/onboarding');
  await expect(page.getByText('Preparing your welcome…')).toBeVisible();
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page).toHaveURL(/\/terms/);
  delay = false;
  const returned = page.waitForResponse(response => response.url().endsWith('/api/auth'));
  release();
  await returned;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page).toHaveURL(/\/terms/);
});

test('homepage subscription entry survives email signup without requiring conversation onboarding', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Subscribe for ₹2,000/ }).click();
  await expect(page).toHaveURL(/login\?next=%2Fbilling/);
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await expect(page).toHaveURL(/signup\?next=%2Fbilling/);
  await page.getByLabel('Your name', { exact: true }).fill('Subscriber');
  await page.getByLabel('Email address').fill(`subscriber-${Date.now()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('My long unique subscriber password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole('heading', { name: 'Your subscription' })).toBeVisible();
  await expect(page.getByText('₹2,000', { exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/auth')).json()).user.onboarded === true).toBe(false);
  await expect(page.getByRole('button', { name: /Subscribe|checkout/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('subscription sign-in preserves the plan and Google requests the billing return destination', async ({ page }) => {
  await page.goto('/login?next=%2Fbilling');
  await page.getByLabel('Email address').fill('sam@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/login?next=%2Fbilling');
  await page.route('**/api/auth', async route => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, config: { ...body.config, runtimeMode: 'services' } } });
  });
  await page.reload();
  let requestBody: unknown;
  await page.route('**/api/auth/account', async route => { requestBody = route.request().postDataJSON(); await route.fulfill({ status: 503, json: { error: { message: 'Test Google boundary' } } }); });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.locator('.notice[role=alert]')).toContainText('Test Google boundary');
  expect(requestBody).toEqual({ action: 'google', next: '/billing' });
});

test('pricing is readable on desktop and mobile with a direct subscription link', async ({ page }) => {
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    const pricing = page.getByRole('region', { name: 'Invest in a clearer next step.' });
    await expect(pricing).toContainText('₹2,000');
    await expect(pricing).toContainText('once every month');
    await expect(pricing).toContainText('no real payment is collected');
    await expect(pricing.getByRole('link', { name: /Subscribe/ })).toHaveAttribute('href', '/billing');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.local/screenshots/pricing-${width}.png`, fullPage: true });
  }
});

test('subscription intent survives switching accounts before the account check returns', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth', async route => {
    await waiting;
    await route.fulfill({ json: { user: null, config: { runtimeMode: 'local' } } });
  });
  try {
    await page.goto('/login?next=%2Fbilling');
    await expect(page.getByRole('link', { name: 'Create an account', exact: true })).toHaveAttribute('href', '/signup?next=%2Fbilling');
    await page.getByRole('link', { name: 'Create an account', exact: true }).click();
    await expect(page).toHaveURL(/signup\?next=%2Fbilling/);
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login?next=%2Fbilling');
  } finally {
    release();
  }
});
