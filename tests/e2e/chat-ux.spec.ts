import { test, expect } from '@playwright/test';

test('chat keyboard supports new lines, IME composition and Enter submission', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  const input = page.getByLabel('Your message', { exact: true });
  await input.fill('I want to build a scheduling tool');
  await input.press('Shift+Enter');
  await input.press('t');
  await expect(input).toHaveValue('I want to build a scheduling tool\nt');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.locator('.message.user')).toHaveCount(0);
  await input.fill('I want to build a database tool because developers pay for support, but costs may be high.');
  await input.press('Enter');
  await expect(page.locator('.message.user')).toHaveCount(1);
  await expect(input).toHaveValue('');
  await expect(page.locator('.message.assistant .preserve').first()).toBeVisible();
  await expect(page.locator('.message.assistant details')).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an edited draft survives a response arriving for the preceding message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  const input = page.getByLabel('Your message', { exact: true });
  await expect(input).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/turns', async route => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  try {
    await input.fill('I want to build a database tool because developers pay for support, but costs may be high.');
    await input.press('Enter');
    await expect(page.getByRole('button', { name: 'Thinking…', exact: true })).toBeVisible();
    await input.fill('A follow-up I am still composing.');
    release();
    await expect(page.locator('.message.assistant').first()).toBeVisible();
    await expect(input).toHaveValue('A follow-up I am still composing.');
  } finally { release(); }
});
