import { test, expect, type Browser, type Page } from '@playwright/test';
import { openAccountMenu, startConversation } from './support/navigation';

// sam@example.test is the owner on the e2e server; alex@example.test is not.
async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
}
async function openStudio(page: Page) {
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();
}
async function ownerPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, 'sam@example.test');
  return page;
}
const items = (page: Page) => page.getByRole('list', { name: 'Library items' }).getByRole('listitem');
const item = (page: Page, title: string) => items(page).filter({ hasText: title });
const review = (page: Page) => page.getByRole('region', { name: 'Review' });
const area = (page: Page, label: string) => page.getByRole('group', { name: new RegExp(`^Area \\d+: ${label}$`) });
const history = (page: Page) => page.getByRole('list', { name: 'Version history' });
const version = (page: Page, n: number) => history(page).getByRole('listitem').filter({ hasText: new RegExp(`^Version ${n}(?!\\d)`) });

async function openQuestionSets(page: Page, mode: 'Business' | 'Personal' = 'Business') {
  await page.getByRole('tab', { name: 'Question sets', exact: true }).click();
  await page.getByRole('button', { name: mode, exact: true }).click();
  await expect(page.getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: /^Area 1: / })).toBeVisible();
}
async function publish(page: Page) {
  const sent = page.waitForResponse(response => response.url().endsWith('/api/studio/frameworks') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publish new version', exact: true }).click();
  return sent;
}
/** Puts the built-in question set back, so later tests and specs see the default questions. */
async function restoreDefault(page: Page) {
  await page.evaluate(async () => {
    const response = await fetch('/api/studio/frameworks', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', mode: 'business', version: 0 }) });
    if (!response.ok) throw new Error(`restore failed: ${response.status}`);
  });
}

test('the owner opens the Studio from the account menu, pastes a note, approves it and sees it live', async ({ page }) => {
  await signIn(page, 'sam@example.test');
  await openAccountMenu(page);
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();

  await page.getByLabel('Title (optional)').fill('Pricing rule of thumb');
  await page.getByLabel('Paste a note').fill('Founders who charge ten dollars a month rarely cover support costs. Ask what one support ticket costs them.');
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(item(page, 'Pricing rule of thumb')).toContainText('In review');
  await expect(review(page).getByLabel('Text', { exact: true })).toHaveValue(/rarely cover support costs/);

  await review(page).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(item(page, 'Pricing rule of thumb')).toContainText('Live');
  await expect(item(page, 'Pricing rule of thumb')).toContainText('Note');
  await expect(page.getByRole('status').filter({ hasText: '“Pricing rule of thumb” is live.' })).toBeVisible();
  await expect(review(page).getByRole('button', { name: 'Withdraw', exact: true })).toBeVisible();
});

test('a recording is transcribed, and Approve saves a corrected transcript before approving it', async ({ page }) => {
  await signIn(page, 'sam@example.test');
  await openStudio(page);
  await page.getByLabel('Or choose a file').setInputFiles('tests/fixtures/sample.wav');
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  const text = review(page).getByLabel('Text', { exact: true });
  await expect(text).toHaveValue('Local transcript of sample.wav. Ask what the customer pays today to live with the problem.', { timeout: 20000 });
  await expect(item(page, 'sample')).toContainText('In review');
  await expect(item(page, 'sample')).toContainText('Recording');
  await expect(item(page, 'sample')).toContainText(/\d+(\.\d)? KB/);

  await text.fill('Local transcript of sample.wav. Ask what the buyer pays today to live with the problem.');
  await review(page).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(item(page, 'sample')).toContainText('Live');

  const { items: listed } = await (await page.request.get('/api/studio/items')).json();
  const id = listed.find((entry: { title: string }) => entry.title === 'sample').id;
  const { item: stored } = await (await page.request.get(`/api/studio/items/${id}`)).json();
  expect(stored).toMatchObject({ status: 'approved', text: 'Local transcript of sample.wav. Ask what the buyer pays today to live with the problem.' });
});

test('the owner publishes an edited opening, sees it in the history, and restores the built-in default', async ({ page }) => {
  await signIn(page, 'sam@example.test');
  await openStudio(page);
  await openQuestionSets(page);
  await expect(history(page).getByRole('listitem').filter({ hasText: 'Built-in default' })).toContainText('Live');

  await area(page, 'Problem and why now').getByLabel('Opening question').fill('What problem are you solving, and who hit it most recently?');
  await page.getByLabel('Note (optional)').fill('Sharper opening');
  expect((await publish(page)).status()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Published version 1.' })).toBeVisible();
  await expect(version(page, 1)).toContainText('Sharper opening');
  await expect(version(page, 1)).toContainText('Live');
  await expect(area(page, 'Problem and why now').getByLabel('Opening question')).toHaveValue('What problem are you solving, and who hit it most recently?');

  await history(page).getByRole('button', { name: 'Restore built-in default', exact: true }).click();
  await expect(version(page, 2)).toContainText('Restored built-in default');
  await expect(version(page, 2)).toContainText('Live');
  await expect(area(page, 'Problem and why now').getByLabel('Opening question')).toHaveValue('What problem are you solving, and when did someone last run into it?');
});

test('an opening without a question mark is shown next to its area and publishes nothing', async ({ page }) => {
  await signIn(page, 'sam@example.test');
  await openStudio(page);
  await openQuestionSets(page);
  const before = await history(page).getByRole('listitem').count();

  const problem = area(page, 'Problem and why now');
  await problem.getByLabel('Opening question').fill('Tell me about the problem.');
  expect((await publish(page)).status()).toBe(400);
  await expect(problem.getByRole('alert')).toContainText('the opening must be one question ending in “?”');
  await expect(area(page, 'Who the customer is').getByRole('alert')).toHaveCount(0);
  await expect(history(page).getByRole('listitem')).toHaveCount(before);
  await expect(problem.getByLabel('Opening question')).toHaveValue('Tell me about the problem.');

  const customer = area(page, 'Who the customer is');
  for (let n = 3; n > 1; n--) await customer.getByRole('button', { name: `Remove follow-up ${n}`, exact: true }).click();
  await expect(customer.getByRole('button', { name: 'Remove follow-up 1', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Personal', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Business', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(problem.getByLabel('Opening question')).toHaveValue('Tell me about the problem.');
  await page.getByRole('button', { name: 'Personal', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Personal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(area(page, 'What is really being decided')).toBeVisible();
});

test('before the database update the Studio says it is not set up and offers no write controls', async ({ page }) => {
  await signIn(page, 'sam@example.test');
  await page.route('**/api/studio/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'STUDIO_UNAVAILABLE', message: 'Apply migration 005' } }) }));
  await openStudio(page);
  await expect(page.getByText(/Studio isn.t set up yet: apply migration 005/)).toBeVisible();
  await expect(page.getByText('docs/setup-guide.md')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to library' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish new version' })).toHaveCount(0);
});

test('someone who is not the owner sees no Studio link and gets not-found from the page and its APIs', async ({ page }) => {
  await signIn(page, 'alex@example.test');
  await openAccountMenu(page);
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Studio' })).toHaveCount(0);

  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'That page isn’t here.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Studio' })).toHaveCount(0);

  expect((await page.request.get('/api/studio/items')).status()).toBe(404);
  expect((await page.request.get('/api/studio/frameworks?mode=business')).status()).toBe(404);
  const writes = await page.evaluate(async () => Promise.all([
    fetch('/api/studio/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', text: 'A note' }) }).then(response => response.status),
    fetch('/api/studio/frameworks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', mode: 'business', version: 0 }) }).then(response => response.status),
  ]));
  expect(writes).toEqual([404, 404]);
});

test('an opening the owner publishes is the question another account is asked in its next new case', async ({ browser }) => {
  test.setTimeout(90000);
  const owner = await ownerPage(browser);
  const opening = 'Which single kind of buyer would pay you first, and why them?';
  try {
    await openStudio(owner);
    await openQuestionSets(owner);
    await area(owner, 'Who the customer is').getByLabel('Opening question').fill(opening);
    expect((await publish(owner)).status()).toBe(201);
    await expect(owner.getByRole('status').filter({ hasText: /Published version \d+\./ })).toBeVisible();

    const userContext = await browser.newContext();
    const user = await userContext.newPage();
    await signIn(user, 'alex@example.test');
    await startConversation(user, { title: 'Studio question check' });
    // Eight or more words and no filler, so the first area is answered and the case moves on.
    await user.getByLabel('Your message', { exact: true }).fill('Independent tutors lose about five hours every week arranging lesson times by text message.');
    await user.getByLabel('Your message', { exact: true }).press('Enter');
    await expect(user.getByRole('region', { name: 'Case progress' }).getByRole('listitem').filter({ hasText: 'Problem and why now' })).toContainText('Strong');
    await expect(user.locator('.message.assistant').last().locator('p').first()).toHaveText(opening);
    await userContext.close();
  } finally {
    await restoreDefault(owner);
    await owner.context().close();
  }
});
