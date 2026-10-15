import { test, expect, type Locator } from '@playwright/test';

test('pricing decision starts with relevant clarification and keeps pushback and cards after reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('sam@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.getByRole('button', { name: 'Pricing decision', exact: true }).click();
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
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
  const question = page.locator('.panel').filter({has:page.getByRole('heading', {name:'One question before we go further'})});
  await expect(question).toContainText(/price|customer|cost/i);
  await page.getByLabel('Your message').fill('Our current price is $20 per month and the proposed price is $25. We have 100 small business customers, variable costs of $5 per customer, and want to improve margins. We do not know churn yet.');
  await saveTurn(page.getByRole('button', { name: 'Send', exact: true }));
  for (let i = 0; i < 3; i++) {
    if (!(await page.getByRole('button', {name:'I’m not sure — skip this question'}).count())) break;
    await saveTurn(page.getByRole('button', {name:'I’m not sure — skip this question'}));
  }
  await expect(page.getByRole('heading', { name: 'Strengths', exact: true })).toBeVisible();
  await page.getByLabel('How to frame it').selectOption('pushback');
  await page.getByLabel('Your message').fill('I disagree: a staged price test with existing customers could reduce the risk. What would challenge that approach?');
  await saveTurn(page.getByRole('button', {name:'Send', exact:true}));
  await page.getByRole('button', {name:'Make a hand-back card'}).click();
  await expect(page.getByRole('heading', {name:'Hand-back card · version 1'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name:'Hand-back card · version 1'})).toBeVisible();
  await expect(page.locator('.message.user').filter({hasText:'a staged price test'})).toBeVisible();
});
