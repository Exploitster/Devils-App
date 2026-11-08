import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startConversation } from './support/navigation';
import { seedLegacySession } from './support/legacy-session';

// A full case sends up to ten requests, the per-account limit per minute, so each test gets its own account.
async function signUp(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Casey');
  await page.getByLabel('Email address').fill(`case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('My long unique test password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto('/home');
}
const composer = (page: Page) => page.getByLabel('Your message', { exact: true });
const progress = (page: Page) => page.getByRole('region', { name: 'Case progress' });
const area = (page: Page, label: string) => progress(page).getByRole('listitem').filter({ hasText: label });
const assessment = (page: Page) => page.getByRole('region', { name: 'Your assessment' });
const assessmentRow = (page: Page, label: string) => assessment(page).getByRole('list', { name: 'Area by area' }).getByRole('listitem').filter({ hasText: label });
const sessionId = (page: Page) => new URL(page.url()).pathname.split('/').pop()!;

async function answer(page: Page, text: string) {
  await composer(page).fill(text);
  const saved = page.waitForResponse(response => response.url().endsWith('/turns') && response.request().method() === 'POST');
  await composer(page).press('Enter');
  expect((await saved).ok()).toBe(true);
  await expect(composer(page)).toHaveValue('');
}

const business = [
  ['Problem and why now', 'Independent tutors lose about five hours every week arranging lesson times by text message.'],
  ['Who the customer is', 'Solo maths tutors in Pune with twenty or more weekly students would pay first.'],
  ['How big the market is', 'About four thousand such tutors work in Pune, based on the coaching directory listings.'],
  ['What people use today', 'Today they juggle WhatsApp threads and paper diaries, which breaks down when lessons move.'],
  ['The MVP', 'A shared booking link with reminders, built in three weeks, leaving payments out entirely.'],
  ['How it was validated', 'Twelve tutors I interviewed described the same scheduling pain, and five prepaid for access.'],
  ['How it makes money', 'Tutors pay a monthly subscription of four hundred rupees once they pass ten students.'],
  ['How it reaches customers', 'We reach tutors through coaching centre owners who refer their freelance teachers to us.'],
  ['Why you', 'I ran a tutoring business for six years and built its booking spreadsheet myself.'],
] as const;
const personal = [
  ['What is really being decided', 'I am deciding whether to leave a stable design job to freelance full time.'],
  ['What matters most', 'Learning new crafts and having time with my young daughter matter most to me.'],
  ['Options not yet considered', 'I could negotiate a four day week and freelance on the fifth day instead.'],
  ['Assumptions', 'I assume three current clients would keep paying me after I leave the studio.'],
  ['Who else is affected', 'My partner would carry our rent alone for the first six months of freelancing.'],
  ['What you would regret', 'I would regret staying another five years without testing whether freelancing suits me.'],
  ['How reversible it is', 'My studio said they would rehire me within a year, so it is partly reversible.'],
] as const;

test('a full business case ends with an assessment that arrives without being asked and downloads as Markdown', async ({ page }) => {
  test.setTimeout(120000);
  await signUp(page);
  await startConversation(page);
  for (const [label, text] of business) {
    await answer(page, text);
    await expect(area(page, label)).toContainText('Strong');
  }
  await expect(page.getByText('Every area is covered. I am writing your assessment now.')).toBeVisible();
  await expect(assessment(page)).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.message.assistant').last()).toContainText('Your assessment is ready');
  for (const [label] of business) await expect(assessmentRow(page, label)).toContainText('Strong');
  await expect(assessment(page)).toContainText('Your call. Always.');

  const download = page.waitForEvent('download');
  await assessment(page).getByRole('button', { name: 'Download Markdown', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^assessment-\d{4}-\d{2}-\d{2}\.md$/);
  const markdown = readFileSync((await file.path())!, 'utf8');
  for (const [label] of business) expect(markdown).toContain(`**${label}**: Strong`);
  expect(markdown).toContain('Your call. Always.');
});

test('the assessment export names the post, authors and licence of a Stack Exchange source', async ({ page }) => {
  await signUp(page);
  await startConversation(page, { mode: 'philosophy' });
  // Reviewed philosophy sources are matched on words such as freedom, obligations and family.
  await answer(page, 'I am deciding whether to leave my work because I value freedom and have obligations to my family.');
  await page.getByRole('button', { name: 'Get assessment', exact: true }).click();
  await expect(assessment(page)).toBeVisible({ timeout: 20000 });
  const cited = assessment(page).getByRole('button', { name: /View source/ });
  await expect(cited.first()).toBeVisible();
  const attribution = { site: 'Philosophy Stack Exchange', postUrl: 'https://philosophy.stackexchange.com/a/1', authors: [{ name: 'A. Writer', profileUrl: 'https://philosophy.stackexchange.com/users/1' }], licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
  await page.route('**/api/evidence/*', async route => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, evidence: { ...body.evidence, attribution } } });
  });
  const download = page.waitForEvent('download');
  await assessment(page).getByRole('button', { name: 'Download Markdown', exact: true }).click();
  const markdown = readFileSync((await (await download).path())!, 'utf8');
  expect(markdown).toContain('From Philosophy Stack Exchange: https://philosophy.stackexchange.com/a/1');
  expect(markdown).toContain('A. Writer (https://philosophy.stackexchange.com/users/1)');
  expect(markdown).toContain('Licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)');
});

test('a vague answer is probed, "I don\'t know yet" marks the area untested, and an early assessment marks the rest not covered', async ({ page }) => {
  await signUp(page);
  await startConversation(page);
  await answer(page, business[0][1]);
  await expect(area(page, 'Problem and why now')).toContainText('Strong');
  await answer(page, 'everyone who has a clinic, I guess');
  await expect(area(page, 'Who the customer is')).toContainText('In progress');
  await expect(page.locator('.message.assistant').last()).toContainText('You said “everyone who has a clinic, I guess”.');

  const skip = page.waitForRequest(request => request.url().endsWith('/turns') && request.method() === 'POST');
  await page.getByRole('button', { name: 'I don’t know yet', exact: true }).click();
  expect((await skip).postDataJSON()).toMatchObject({ action: 'skip', text: 'I don’t know yet' });
  await expect(area(page, 'Who the customer is')).toContainText('Untested');
  await expect(area(page, 'How big the market is')).toContainText('In progress');

  await page.route('**/api/sessions/*/card', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'The AI service is busy. Try again shortly.' } }) }));
  await page.getByRole('button', { name: 'Get assessment', exact: true }).click();
  const failed = page.getByRole('group', { name: 'Assessment not written' });
  await expect(failed).toContainText('The AI service is busy');
  await page.unroute('**/api/sessions/*/card');
  await failed.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(assessment(page)).toBeVisible({ timeout: 20000 });
  await expect(assessmentRow(page, 'Problem and why now')).toContainText('Strong');
  await expect(assessmentRow(page, 'Who the customer is')).toContainText('Untested');
  await expect(assessmentRow(page, 'How big the market is')).toContainText('Weak');
  for (const [label] of business.slice(3)) await expect(assessmentRow(page, label)).toContainText('Not covered');

  // The case carries on after an early assessment, and the button now offers an update.
  await expect(page.getByRole('button', { name: 'Update assessment', exact: true })).toBeVisible();
  await expect(page.locator('.reply-question')).toContainText(/how did you arrive at that number\?/);
});

test('reloading between the final answer and the assessment still produces it', async ({ page }) => {
  test.setTimeout(120000);
  await signUp(page);
  await startConversation(page, { mode: 'philosophy' });
  await page.route('**/api/sessions/*/card', route => route.abort());
  for (const [, text] of personal) await answer(page, text);
  await expect(page.getByRole('group', { name: 'Assessment not written' })).toBeVisible();
  await expect(assessment(page)).toHaveCount(0);
  await page.unroute('**/api/sessions/*/card');
  await page.reload();
  await expect(assessment(page)).toBeVisible({ timeout: 20000 });
  for (const [label] of personal) await expect(assessmentRow(page, label)).toContainText('Strong');
});

test('after completion only a correction is accepted, and "Update assessment" replaces the assessment', async ({ page }) => {
  test.setTimeout(120000);
  await signUp(page);
  await startConversation(page, { mode: 'philosophy' });
  await page.route('**/api/sessions/*/card', async route => { await new Promise(resolve => setTimeout(resolve, 800)); await route.continue(); });
  for (const [, text] of personal) await answer(page, text);
  await expect(page.getByRole('status').filter({ hasText: 'Writing your assessment' })).toBeVisible();
  await expect(assessment(page)).toBeVisible({ timeout: 20000 });
  const first = await assessment(page).getAttribute('data-assessment-id');

  const actions = page.getByRole('group', { name: 'Reply actions' });
  await expect(actions.getByRole('button')).toHaveText(['Correct my position', 'Update assessment']);
  const correction = page.waitForRequest(request => request.url().endsWith('/turns') && request.method() === 'POST');
  await answer(page, 'I am now deciding whether to move abroad for a research post instead.');
  expect((await correction).postDataJSON().action).toBe('correction');
  await expect(area(page, 'What is really being decided')).toContainText('Strong');
  await expect(area(page, 'What matters most')).toContainText('In progress');
  await expect(area(page, 'How reversible it is')).toContainText('Not asked');

  await page.getByRole('button', { name: 'Update assessment', exact: true }).click();
  await expect(assessment(page)).not.toHaveAttribute('data-assessment-id', first!, { timeout: 20000 });
  await expect(assessment(page)).toHaveCount(1);
  await expect(assessmentRow(page, 'How reversible it is')).toContainText('Not covered');
});

test('a conversation saved before case prep opens read-only and "Start a case" carries the old position over', async ({ page }) => {
  await signUp(page);
  await startConversation(page, { title: 'Database support idea' });
  const position = 'I want to build an open source database startup because developer tools customers will pay for support.';
  const { reply } = seedLegacySession(sessionId(page), position);
  await page.reload();
  await expect(page.locator('.message.assistant')).toContainText(reply);
  await expect(page.getByRole('heading', { name: 'Hand-back card · version 1' })).toBeVisible();
  await expect(composer(page)).toHaveCount(0);
  await expect(progress(page)).toHaveCount(0);
  const legacyId = sessionId(page);

  await page.getByRole('button', { name: 'Start a case', exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(legacyId));
  await expect(page.locator('.message.user .preserve').first()).toHaveText(position);
  await expect(area(page, 'Problem and why now')).toContainText('Strong');
  await expect(page.getByRole('heading', { name: 'Database support idea', level: 1 })).toBeVisible();
});
