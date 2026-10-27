import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public and mobile authenticated screens are accessible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/', '/login']) {
    await page.goto(path);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel('Email address').fill('sam@example.test'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What would you like to think through?' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: /Dark theme/ }).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({path: '.local/screenshots/home-mobile-dark.png', fullPage:true, animations:'disabled'});
  await page.goto('/billing');await expect(page.getByRole('heading',{name:'Your subscription'})).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.getByRole('button', {name:'Light theme'}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path: '.local/screenshots/home-desktop.png', fullPage:true, animations:'disabled'});
});

test('temporary rehearsal warns that account and data changes are shared',async({page})=>{
 await page.route('**/api/auth',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{...body,config:{...body.config,sharedDataRehearsal:true}}});});
 for(const width of [360,1440]){await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.getByRole('region',{name:'Temporary test site'})).toContainText('Shares your existing account and saved data');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`.local/screenshots/rehearsal-${width}.png`,fullPage:true});}
});
