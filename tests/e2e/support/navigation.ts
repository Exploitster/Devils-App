import type { Page } from '@playwright/test';

/** Opens the conversation drawer when the layout hides the sidebar behind the menu button. */
export async function openNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  if (await menu.isVisible()) await menu.click();
}
export async function goToHistory(page: Page) {
  await openNavigation(page);
  await page.getByRole('link', { name: 'All conversations', exact: true }).click();
}
export async function signOut(page: Page) {
  await openNavigation(page);
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
}
export async function openAccountMenu(page: Page) {
  await openNavigation(page);
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
}
