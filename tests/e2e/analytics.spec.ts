import { test, expect } from '@playwright/test';
test.skip(!process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID, 'Requires the synthetic analytics project fixture.');
test('Clarity starts only after consent and cannot carry into private navigation', async ({ page }) => {
  let tags = 0;
  await page.route('**/www.clarity.ms/tag/**', async route => { tags++; await route.fulfill({ contentType:'application/javascript',body:'window.syntheticRecorderLoaded = true;' }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name:'Optional website analytics' })).toBeVisible();
  expect(tags).toBe(0);
  await page.getByRole('button', { name:'Allow website analytics',exact:true }).click();
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(1);
  await expect.poll(() => tags).toBe(1);
  await page.getByRole('link', { name:'Get started',exact:true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(0);
  expect(await page.evaluate(() => 'syntheticRecorderLoaded' in window)).toBe(false);
});
test('declining analytics prevents loading across public navigation', async ({ page }) => {
  let tags = 0;
  await page.route('**/www.clarity.ms/tag/**', async route => { tags++; await route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name:'No thanks',exact:true }).click();
  await page.goto('/features');
  await expect(page.getByRole('heading', { name:'Optional website analytics' })).toHaveCount(0);
  expect(tags).toBe(0);
});
test('withdrawing consent in another tab stops the loaded recorder', async ({ page, context }) => {
  await context.route('**/www.clarity.ms/tag/**', route => route.fulfill({contentType:'application/javascript',body:'window.syntheticRecorderLoaded = true;'}));
  await page.goto('/');
  await page.getByRole('button',{name:'Allow website analytics',exact:true}).click();
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(1);
  const other = await context.newPage();
  await other.goto('/features');
  await other.getByRole('button',{name:'Analytics privacy choices',exact:true}).click();
  await other.getByRole('button',{name:'Turn analytics off',exact:true}).click();
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(0);
  await expect(other.locator('script[data-devils-analytics=clarity]')).toHaveCount(0);
  expect(await page.evaluate(() => 'syntheticRecorderLoaded' in window)).toBe(false);
});
for (const method of ['pushState','replaceState'] as const) test(`private ${method} navigation removes the public recorder`, async ({ page }) => {
  await page.route('**/www.clarity.ms/tag/**', route => route.fulfill({contentType:'application/javascript',body:'window.syntheticRecorderLoaded = true;'}));
  await page.goto('/');
  await page.getByRole('button',{name:'Allow website analytics',exact:true}).click();
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(1);
  await page.evaluate(method => { history[method]({}, '', '/login'); }, method);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(0);
  expect(await page.evaluate(() => 'syntheticRecorderLoaded' in window)).toBe(false);
});
test('a restored page rechecks consent rather than resuming its recorder', async ({ page }) => {
  await page.route('**/www.clarity.ms/tag/**', route => route.fulfill({contentType:'application/javascript',body:'window.syntheticRecorderLoaded = true;'}));
  await page.goto('/');
  await page.getByRole('button',{name:'Allow website analytics',exact:true}).click();
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(1);
  await page.evaluate(() => {
    localStorage.setItem('devils-analytics-consent-v1','declined');
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await expect(page.locator('script[data-devils-analytics=clarity]')).toHaveCount(0);
  expect(await page.evaluate(() => 'syntheticRecorderLoaded' in window)).toBe(false);
});
