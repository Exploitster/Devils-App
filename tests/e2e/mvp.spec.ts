import { test, expect, type Locator } from '@playwright/test';
import { startConversation } from './support/navigation';

test('pricing decision starts as a case and keeps pushback and the assessment after reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('sam@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await startConversation(page, { title: 'Pricing decision' });
  await expect(page.getByRole('heading', { name: 'Pricing decision', exact: true })).toBeVisible();
  await expect(page.getByText(/current and proposed prices/i)).toBeVisible();
  const endpoint = `/api/sessions/${new URL(page.url()).pathname.split('/').pop()}`;
  async function saveTurn(button: Locator) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === `${endpoint}/turns` && response.request().method() === 'POST'),
      button.click(),
    ]);
    expect(response.ok()).toBe(true);
    await expect(page.getByLabel('Your message')).toHaveValue('');
    await expect(page.getByRole('button', {name:'Cancel generation', exact:true})).toHaveCount(0);
  }
  const initial = await (await page.request.get(endpoint)).json();
  expect(initial.session).toMatchObject({mode:'business', topic:'startup', title:'Pricing decision'});

  await page.getByRole('button', { name: 'Use pricing example', exact: true }).click();
  await expect(page.getByLabel('Your message')).toHaveValue(/example/i);
  expect((await (await page.request.get(endpoint)).json()).session.messages).toHaveLength(0);
  await page.getByLabel('Your message').fill('I am considering changing the price of my subscription product.');
  await saveTurn(page.getByRole('button', { name: 'Send', exact: true }));
  const progress = page.getByRole('region', { name: 'Case progress' });
  await expect(progress.getByRole('listitem').filter({ hasText: 'Problem and why now' })).toContainText('Strong');
  const question = page.locator('.message.assistant').last();
  await expect(question).toContainText('Who exactly feels this problem most');
  await expect(question.locator('.preserve')).toHaveText(/\?$/);
  await page.getByLabel('Your message').fill('Our current price is $20 per month and the proposed price is $25. We have 100 small business customers, variable costs of $5 per customer, and want to improve margins. We do not know churn yet.');
  await saveTurn(page.getByRole('button', { name: 'Send', exact: true }));
  await expect(progress.getByRole('listitem').filter({ hasText: 'Who the customer is' })).toContainText('Strong');
  await page.getByRole('button', {name:'Push back', exact:true}).click();
  await page.getByLabel('Your message').fill('I disagree: a staged price test with existing customers could reduce the risk. What would challenge that approach?');
  await saveTurn(page.getByRole('button', {name:'Send', exact:true}));
  await expect(page.locator('.message.assistant').last()).toContainText('Put another way');
  await page.getByRole('button', {name:'Get assessment', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Your assessment'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name:'Your assessment'})).toBeVisible();
  await expect(page.locator('.message.user').filter({hasText:'a staged price test'})).toBeVisible();
});
