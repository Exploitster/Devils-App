import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function signUp(page: Page) {
  const email = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Riley');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('My long unique test password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}
async function createConversations(page: Page, count: number) {
  await page.evaluate(async total => {
    for (let index = 1; index <= total; index++) {
      const response = await fetch('/api/sessions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'business', topic: 'startup', title: `Topic ${String(index).padStart(2, '0')}` }) });
      if (!response.ok) throw new Error(`create failed: ${response.status}`);
    }
  }, count);
}
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Conversations and account' });

test('a new account sees an empty conversation list', async ({ page }) => {
  await signUp(page);
  await page.goto('/history');
  await expect(sidebar(page).getByText('Your conversations will appear here.')).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: 'New conversation', exact: true })).toBeVisible();
});

test('the sidebar lists the 15 newest conversations and marks the open one', async ({ page }) => {
  await signUp(page);
  await createConversations(page, 16);
  await page.goto('/history');
  const links = sidebar(page).locator('.recent li a');
  await expect(links).toHaveCount(15);
  await expect(links.first()).toHaveText('Topic 16');
  await expect(links.last()).toHaveText('Topic 02');
  await links.nth(2).click();
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(sidebar(page).getByRole('link', { name: 'Topic 14', exact: true })).toHaveAttribute('aria-current', 'page');
  await sidebar(page).getByRole('link', { name: 'All conversations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
});

test('the account menu holds account, billing, theme and sign out', async ({ page }) => {
  await signUp(page);
  await page.goto('/history');
  const trigger = page.getByRole('button', { name: 'Account menu', exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Account', 'Billing']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Dark|Light) theme$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('on a phone the sidebar opens as a drawer and closes on Escape or navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await signUp(page);
  await createConversations(page, 2);
  await page.goto('/history');
  await expect(sidebar(page)).toBeHidden();
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  await menu.click();
  await expect(sidebar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebar(page)).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await sidebar(page).getByRole('link', { name: 'Topic 02', exact: true }).click();
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(sidebar(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the drawer closes on a link to the current page and when the window widens to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 760 });
  await signUp(page);
  await page.goto('/history');
  const menu = page.locator('.menu-button');
  await menu.click();
  await sidebar(page).getByRole('link', { name: 'All conversations', exact: true }).click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  await menu.click();
  await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
  await page.setViewportSize({ width: 1280, height: 760 });
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  await page.locator('main').getByRole('link', { name: 'New conversation', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
});

test('the signed-in shell has no accessibility violations', async ({ page }) => {
  await signUp(page);
  await page.goto('/history');
  await expect(sidebar(page).getByText('Your conversations will appear here.')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
