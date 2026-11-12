import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('sample answers produce a mini assessment and switching modes resets the flow', async ({ page }) => {
  await page.goto('/');
  const sample = page.getByRole('region', { name: 'Answer three questions. See the assessment.' });
  await sample.getByRole('button', { name: 'Start sample', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await sample.locator('[aria-live] .sample-controls button').first().click();
  }
  await sample.getByRole('button', { name: 'See my assessment' }).click();
  await expect(sample.getByRole('heading', { name: 'Your mini assessment', exact: true })).toBeVisible();
  await expect(sample.locator('.sample-handback')).toContainText('Your call. Always.');
  await sample.getByRole('button', { name: 'Philosophy', exact: true }).click();
  await expect(sample.getByRole('button', { name: 'Start sample', exact: true })).toBeVisible();
  await expect(sample.locator('.sample-handback')).toHaveCount(0);
  await sample.getByRole('button', { name: 'Move cities?' }).click();
  await expect(sample).toContainText('job offer in another city');
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('local price uses regional estimates, allows override and keeps the INR checkout base', async ({ page }) => {
  await page.route('**/api/pricing', route => route.fulfill({ json: { currency: 'USD', locationDetected: true, date: '2026-10-26', rates: { INR: 1, USD: 0.01, GBP: 0.008 } } }));
  await page.goto('/');
  const price = page.locator('.local-price');
  await expect(price).toContainText('$20.00 USD / month');
  await price.getByRole('combobox').selectOption('GBP');
  await expect(price).toContainText('16.00 GBP / month');
  await price.getByRole('combobox').selectOption('JPY');
  await expect(price).toContainText('Local estimate unavailable');
  await expect(page.getByRole('link', { name: /Subscribe for ₹200/ })).toHaveAttribute('href', '/billing');
});
