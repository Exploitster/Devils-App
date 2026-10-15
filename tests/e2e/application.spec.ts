import { test, expect } from '@playwright/test';
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}
for (const mode of ['Business', 'Philosophy']) test(`${mode}: conversation, source, card, history and resume`, async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click();
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page.getByLabel('Your message')).toBeVisible();
  await page.getByLabel('Your message').fill(mode === 'Business' ? 'I want to build an open source database startup because developer tools customers will pay for support but serving costs may be high.' : 'I am deciding whether to leave my work because I value freedom and have obligations to my family.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Strengths' })).toBeVisible();
  const source = page.getByRole('button', { name: /View source/ }).first();
  await expect(source).toBeVisible(); await source.click(); await expect(page.getByRole('dialog', {name: /./})).toBeVisible(); await page.keyboard.press('Escape'); await expect(source).toBeFocused();
  await page.getByRole('button', { name: 'Make a hand-back card' }).click();
  await expect(page.getByRole('heading', { name: /Hand-back card/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Markdown' })).toBeVisible();
  const url = page.url();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.locator(`a[href="${new URL(url).pathname}"]`).click();
  await expect(page.getByRole('heading', { name: /Hand-back card/ })).toBeVisible();
});
test('expired access preserves history and offers billing', async ({ page }) => {
  await page.goto('/login'); await page.getByLabel('Email address').fill('expired@example.test'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: /View plans/ })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click(); await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
});
test('stale revisions and offline submission keep the unsent message', async ({ page, context }) => {
  await login(page); await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page.getByLabel('Your message')).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop();
  const current = await (await page.request.get(`/api/sessions/${id}`)).json();
  await page.request.patch(`/api/sessions/${id}`, { data: {title: 'Updated in another tab', expectedRevision: current.session.revision}, headers: {Origin: 'http://127.0.0.1:3000'} });
  const draft = 'An unsent idea about developer tools and customer value.';
  await page.getByLabel('Your message').fill(draft); await page.getByRole('button', {name:'Send',exact:true}).click();
  await expect(page.locator('.notice[role=alert]')).toContainText('unsent text is preserved');
  await expect(page.getByLabel('Your message')).toHaveValue(draft);
  await page.getByRole('button', {name:'Try again'}).click();
  await expect(page.getByRole('heading', {name:'Updated in another tab'})).toBeVisible();
  await context.setOffline(true); await page.getByRole('button', {name:'Send',exact:true}).click();
  await expect(page.locator('.notice[role=alert]')).toBeVisible(); await expect(page.getByLabel('Your message')).toHaveValue(draft);
  await context.setOffline(false); await page.getByRole('button', {name:'Send',exact:true}).click();
  await expect(page.getByLabel('Your message')).toHaveValue('');
});
test('deferred payments retain pricing and cannot change access', async ({ page }) => {
  await login(page);
  const before = await (await page.request.get('/api/billing')).json();
  expect(before.paymentsEnabled).toBe(false);
  await page.goto('/billing?testCheckout=11111111-1111-4111-8111-111111111111');
  await expect(page.getByText('Payments are not connected yet', {exact:true})).toBeVisible();
  await expect(page.locator('.price').filter({hasText:'$59'})).toBeVisible();
  await expect(page.locator('.price').filter({hasText:'$150'})).toBeVisible();
  await expect(page.getByText(/Business and philosophy modes, saved conversations/)).toBeVisible();
  for (const name of ['Choose monthly', 'Choose yearly', 'Manage billing']) {
    await expect(page.getByRole('button', {name, exact:true})).toBeDisabled();
  }
  await expect(page.getByRole('button', {name:'Confirm simulated subscription'})).toHaveCount(0);
  const response = await page.request.post('/api/billing/checkout', {
    data: {plan:'yearly'}, headers: {Origin:new URL(page.url()).origin}
  });
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe('PAYMENTS_DISABLED');
  const after = await (await page.request.get('/api/billing')).json();
  expect(after.access).toEqual(before.access);
  expect(after.subscription).toEqual(before.subscription);
});

test('earlier saved questions remain readable after pushback and reload', async ({ page }) => {
  await login(page);
  await page.getByRole('button', {name:'Start a conversation'}).click();
  await expect(page.getByLabel('Your message')).toBeVisible();
  await page.getByLabel('Your message').fill('I want to build an open source database because developer tools customers will pay for support, but serving costs may be high.');
  await page.getByRole('button', {name:'Send', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Strengths'})).toBeVisible();
  const endpoint = `/api/sessions/${new URL(page.url()).pathname.split('/').pop()}`;
  const saved = await (await page.request.get(endpoint)).json();
  const earlier = saved.session.messages.find((message: {role:string}) => message.role === 'assistant');
  const question = saved.session.state.openQuestions[0];
  expect(question).toBeTruthy();
  await page.getByLabel('How to frame it').selectOption('pushback');
  await page.getByLabel('Your message').fill('I disagree: committed support contracts could cover the serving costs. Which assumption should I test next?');
  await page.getByRole('button', {name:'Send', exact:true}).click();
  await expect(page.getByLabel('Your message')).toHaveValue('');
  await page.reload();
  const response = page.locator('.message.assistant').filter({hasText:earlier.text});
  await response.getByText('Read full saved response', {exact:true}).click();
  await expect(response.locator('.preserve')).toHaveText(earlier.text);
  await expect(response.locator('.preserve')).toContainText(question);
});
