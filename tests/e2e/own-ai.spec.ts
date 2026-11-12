import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startConversation } from './support/navigation';

// Local mode accepts keys that start with `local-` and calls no provider.
const localKey = 'local-test-key-0123456789abcd';

async function signUp(page: Page) {
  const email = `own-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Riley');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('My long unique test password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}
const panel = (page: Page) => page.locator('section.panel', { has: page.getByRole('heading', { name: 'Your own AI' }) });

test('a person connects their own key, changes the model, keeps chatting and removes the key', async ({ page }) => {
  await signUp(page);
  await page.goto('/account');
  const own = panel(page);
  await expect(own.getByLabel('Provider')).toHaveValue('anthropic');
  await expect(own.getByRole('button', { name: 'Connect key' })).toBeDisabled();

  await own.getByLabel('API key').fill('sk-not-a-local-key-0123456789');
  await own.getByRole('button', { name: 'Connect key' }).click();
  await expect(own.getByRole('alert')).toContainText('Claude did not accept that API key');

  await own.getByLabel('API key').fill(localKey);
  await own.getByRole('button', { name: 'Connect key' }).click();
  await expect(own.getByText('Connected. Key ending abcd.')).toBeVisible();
  await expect(own.getByRole('status').filter({ hasText: 'Your key is connected' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(localKey);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await own.getByLabel('Model').selectOption('local-claude-small');
  await expect(own.getByRole('status').filter({ hasText: 'Model updated.' })).toBeVisible();
  await page.reload();
  await expect(panel(page).getByLabel('Model')).toHaveValue('local-claude-small');
  await expect(page.locator('body')).not.toContainText(localKey);
  const saved = await page.evaluate(async () => (await fetch('/api/account/model-key', { credentials: 'same-origin' })).text());
  expect(saved).not.toContain(localKey);
  expect(JSON.parse(saved)).toMatchObject({ available: true, connection: { provider: 'anthropic', model: 'local-claude-small', last4: 'abcd', needsReconnect: false } });

  await page.goto('/home');
  await startConversation(page);
  const composer = page.getByLabel('Your message', { exact: true });
  await composer.fill('Independent tutors lose about five hours every week arranging lesson times by text message.');
  const turn = page.waitForResponse(response => response.url().endsWith('/turns') && response.request().method() === 'POST');
  await composer.press('Enter');
  expect((await turn).ok()).toBe(true);

  await page.goto('/account');
  await panel(page).getByRole('button', { name: 'Remove key' }).click();
  await expect(panel(page).getByRole('button', { name: 'Connect key' })).toBeVisible();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Your key has been removed' })).toBeVisible();
});

test('the key API refuses unknown fields, so another account cannot be named', async ({ page }) => {
  await signUp(page);
  const statuses = await page.evaluate(async key => {
    const send = (method: string, body?: unknown) => fetch('/api/account/model-key', { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(response => response.status);
    return [await send('GET'), await send('PUT', { provider: 'openai', apiKey: key, userId: 'someone-else' }), await send('PATCH', { model: 'local-gpt-small' })];
  }, localKey);
  // Unknown fields are refused, and there is no key to change a model on.
  expect(statuses).toEqual([200, 400, 404]);
});
