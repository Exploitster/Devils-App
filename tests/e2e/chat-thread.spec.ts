import { test, expect, type Page } from '@playwright/test';
import { startConversation } from './support/navigation';

// Each test gets its own account: these tests send many turns, and sharing one
// account would trip the per-account submission limit for the specs that follow.
async function signIn(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Jordan');
  await page.getByLabel('Email address').fill(`thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('My long unique test password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto('/home');
}
const composer = (page: Page) => page.getByLabel('Your message', { exact: true });
const sessionPath = (page: Page) => `/api/sessions/${new URL(page.url()).pathname.split('/').pop()}`;
async function send(page: Page, text: string) {
  await composer(page).fill(text);
  const saved = page.waitForResponse(response => response.url().endsWith('/turns') && response.request().method() === 'POST');
  await composer(page).press('Enter');
  return saved;
}
async function occurrences(page: Page, text: string) {
  return page.evaluate(value => document.body.innerText.split(value).length - 1, text);
}

test('a clarifying question appears once, with answer and skip replies', async ({ page }) => {
  await signIn(page);
  await startConversation(page, { title: 'Pricing decision' });
  await send(page, 'I am considering changing the price of my subscription product.');
  const session = (await (await page.request.get(sessionPath(page))).json()).session;
  const pending = session.state.clarifications.find((item: { answer?: string; skipped?: boolean }) => item.answer === undefined && !item.skipped);
  expect(pending).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Answer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip question', exact: true })).toBeVisible();
  expect(await occurrences(page, pending.question)).toBe(1);
  await page.getByRole('button', { name: 'Answer', exact: true }).click();
  await expect(composer(page)).toBeFocused();
});

test('after the questions end, the summary is not repeated under the reflection reply', async ({ page }) => {
  await signIn(page);
  await startConversation(page, { title: 'Pricing decision' });
  await send(page, 'I am considering changing the price of my subscription product.');
  for (let i = 0; i < 4 && await page.getByRole('button', { name: 'Skip question', exact: true }).count(); i++) {
    const saved = page.waitForResponse(response => response.url().endsWith('/turns'));
    await page.getByRole('button', { name: 'Skip question', exact: true }).click();
    await saved;
  }
  const session = (await (await page.request.get(sessionPath(page))).json()).session;
  await expect(page.getByRole('button', { name: 'Push back', exact: true })).toBeVisible();
  expect(await occurrences(page, session.state.underlyingQuestion)).toBe(1);
});

test('a reply that adds a question outside the clarifying step shows it once', async ({ page }) => {
  await signIn(page);
  await startConversation(page);
  await send(page, 'I want to build an open source database because developer tools customers will pay for support.');
  const added = 'Which customers have already asked for paid support?';
  await page.route(`**${sessionPath(page)}`, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); const body = await response.json();
    body.session.state.phase = 'debate';
    body.session.state.clarifications.push({ id: 'synthetic-question', question: added });
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Skip question', exact: true })).toBeVisible();
  expect(await occurrences(page, added)).toBe(1);
});

test('reply actions hide while generating and push back tags the composer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page);
  await startConversation(page);
  await send(page, 'I want to build an open source database because developer tools customers will pay for support.');
  for (let i = 0; i < 4 && await page.getByRole('button', { name: 'Skip question', exact: true }).count(); i++) {
    const saved = page.waitForResponse(response => response.url().endsWith('/turns'));
    await page.getByRole('button', { name: 'Skip question', exact: true }).click();
    await saved;
  }
  const pushBack = page.getByRole('button', { name: 'Push back', exact: true });
  await expect(pushBack).toBeVisible();
  await pushBack.click();
  await expect(page.locator('.composer-tag')).toHaveText(/Pushing back/);
  await page.route('**/api/sessions/*/turns', async route => { await new Promise(resolve => setTimeout(resolve, 1200)); await route.continue(); });
  await composer(page).fill('I disagree: support contracts could cover serving costs.');
  const request = page.waitForRequest(req => req.url().endsWith('/turns') && req.method() === 'POST');
  await composer(page).press('Enter');
  expect((await request).postDataJSON().action).toBe('pushback');
  await expect(pushBack).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Push back', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.composer-tag')).toHaveCount(0);
  await page.getByRole('button', { name: 'Correct my position', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Correcting my position', exact: true }).click();
  await expect(page.locator('.composer-tag')).toHaveCount(0);
});

test('an expired trial shows a subscribe line and keeps the typed text', async ({ page }) => {
  await signIn(page);
  await startConversation(page);
  await page.route('**/api/sessions/*/turns', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ACCESS_EXPIRED', message: 'Generation access has expired. Your history remains available.' } }) }));
  await composer(page).fill('Should I open a second location?');
  await composer(page).press('Enter');
  await expect(page.getByText('Your free trial has ended.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Subscribe', exact: true })).toHaveAttribute('href', '/billing');
  await expect(composer(page)).toHaveValue('Should I open a second location?');
});

test('the conversation menu renames and guards deletion', async ({ page }) => {
  await signIn(page);
  await startConversation(page);
  await page.getByLabel('Conversation options').click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Title').fill('Second location');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Second location', level: 1 })).toBeVisible();
  await page.getByLabel('Conversation options').click();
  await page.getByRole('button', { name: 'Delete conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Keep conversation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Second location', level: 1 })).toBeVisible();
});
