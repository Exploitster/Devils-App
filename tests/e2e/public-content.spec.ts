import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const slugs = ['about','features','business-validation','philosophical-reflection','how-it-works','pricing','faq','help','contact','security','sources','subscription-and-cancellation','refunds'];
test('customer information is public, linked and uniquely indexed', async ({ page }) => {
  const titles = new Set<string>();
  for (const slug of slugs) {
    await page.goto(`/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await expect(page.locator('h1')).toHaveCount(1);
    const title = await page.title(); expect(titles.has(title)).toBe(false); titles.add(title);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://www.devils-advocate.app/${slug}`);
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  }
  await page.goto('/a-page-that-does-not-exist');
  await expect(page.getByRole('heading', { name: /not|find|here/i })).toBeVisible();
});
test('information and navigation fit mobile and preserve dark theme', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ['features','pricing','help']) {
    await page.goto(`/${slug}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({ path: testInfo.outputPath('information-mobile-dark.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('private pages advertise noindex and sitemap contains only public information', async ({ request }) => {
  const html = await (await request.get('/login')).text();
  expect(html).toContain('noindex');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const slug of slugs) expect(sitemap).toContain(`/${slug}`);
  expect(sitemap).not.toContain('/sessions');
  expect(sitemap).not.toContain('/account');
});
