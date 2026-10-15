import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public and mobile authenticated screens are accessible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/', '/login']) {
    await page.goto(path);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel('Email address').fill('sam@example.test'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What would you like to think through?' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: /Dark theme/ }).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({path: '.local/screenshots/home-mobile-dark.png', fullPage:true});
  await page.getByRole('button', {name:'Light theme'}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path: '.local/screenshots/home-desktop.png', fullPage:true});
});
