import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, email = 'alex@example.test') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}
const composer = (page: Page) => page.getByLabel('Your message', { exact: true });
async function sessionCount(page: Page) {
  return page.evaluate(async () => (await (await fetch('/api/sessions', { credentials: 'same-origin' })).json()).sessions.length as number);
}
async function openedSession(page: Page) {
  const id = new URL(page.url()).pathname.split('/').pop();
  return page.evaluate(async sessionId => (await (await fetch(`/api/sessions/${sessionId}`, { credentials: 'same-origin' })).json()).session, id);
}

test('sending from the new-conversation screen opens the conversation with the message at once', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/sessions/*/turns', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue(); });
  await composer(page).fill('I want to build a scheduling tool for independent tutors.');
  await composer(page).press('Enter');
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(page.locator('.message.user', { hasText: 'I want to build a scheduling tool for independent tutors.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel generation', exact: true })).toBeVisible();
  await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 20000 });
  expect((await openedSession(page)).messages.length).toBeGreaterThanOrEqual(2);
});

test('pressing Enter twice quickly creates only one conversation', async ({ page }) => {
  await signIn(page, 'sam@example.test');
  const before = await sessionCount(page);
  await page.route('**/api/sessions', async route => { if (route.request().method() === 'POST') await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  await composer(page).fill('Should I raise my prices this year?');
  await composer(page).press('Enter');
  await composer(page).press('Enter').catch(() => {});
  await expect(page).toHaveURL(/\/sessions\//);
  expect(await sessionCount(page)).toBe(before + 1);
});

test('the perspective toggle and starters decide the kind of conversation', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /^Philosophy:/ }).click();
  await expect(page.getByRole('button', { name: /^Philosophy:/ })).toHaveAttribute('aria-pressed', 'true');
  await composer(page).fill('I am deciding whether to move cities for a new job.');
  await composer(page).press('Enter');
  await expect(page).toHaveURL(/\/sessions\//);
  expect((await openedSession(page)).mode).toBe('philosophy');
  await page.goto('/home');
  await page.getByRole('button', { name: 'Pricing decision', exact: true }).click();
  await expect(composer(page)).toHaveValue(/changing my price/);
  await expect(composer(page)).toBeFocused();
  await composer(page).pressSequentially('it no longer covers support costs.');
  await composer(page).press('Enter');
  await expect(page).toHaveURL(/\/sessions\//);
  const session = await openedSession(page);
  expect(session).toMatchObject({ mode: 'business', title: 'Pricing decision' });
});

test('the composer keeps new lines, refuses empty sends and shows the counter only near the limit', async ({ page }) => {
  await signIn(page);
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await composer(page).fill('First line');
  await composer(page).press('Shift+Enter');
  await composer(page).pressSequentially('second line');
  await expect(composer(page)).toHaveValue('First line\nsecond line');
  await expect(page).toHaveURL(/\/home/);
  await expect(page.locator('.composer-count')).toHaveCount(0);
  await composer(page).fill('x'.repeat(10500));
  await expect(page.locator('.composer-count')).toHaveText('10,500 / 12,000');
});

test('a failed first reply keeps the typed text in the new conversation', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/sessions/*/turns', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'The AI service is busy. Try again shortly.' } }) }));
  await composer(page).fill('Is a subscription box for plants worth testing?');
  await composer(page).press('Enter');
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(page.getByRole('alert').filter({ hasText: 'The AI service is busy' })).toBeVisible();
  await expect(composer(page)).toHaveValue('Is a subscription box for plants worth testing?');
});
