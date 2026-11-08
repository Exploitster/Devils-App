import type { Page } from '@playwright/test';

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

export async function startConversation(page: Page, options: { mode?: 'business' | 'philosophy'; title?: string } = {}) {
  await page.waitForURL(/\/home/);
  const mode = options.mode ?? 'business';
  const id = await page.evaluate(async body => {
    const response = await fetch('/api/sessions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`create failed: ${response.status}`);
    return (await response.json()).session.id as string;
  }, { mode, topic: mode === 'business' ? 'startup' : 'life', ...(options.title ? { title: options.title } : {}) });
  await page.goto(`/sessions/${id}`);
}
