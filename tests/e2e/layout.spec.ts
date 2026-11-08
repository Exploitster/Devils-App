import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startConversation } from './support/navigation';

// Every screen must fit every width, in both themes, without sideways scrolling.
const widths = [375, 768, 1280, 1440];
const axeWidths = new Set([375, 1280]);
const themes = ['light', 'dark'] as const;
const publicPaths = ['/', '/login', '/signup', '/about', '/features', '/business-validation', '/philosophical-reflection', '/how-it-works', '/pricing', '/faq', '/help', '/contact', '/security', '/sources', '/subscription-and-cancellation', '/refunds', '/accessibility', '/privacy', '/terms'];

async function useTheme(page: Page, theme: (typeof themes)[number]) {
  await page.addInitScript(value => { try { localStorage.setItem('devils-theme', value); } catch { /* storage may be blocked */ } }, theme);
}

/** Visible elements that stick out past the viewport edge, outside any scrolling or clipping container. */
function overflowingElements(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const clipped = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') return true;
      }
      return false;
    };
    const found: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      if ((box.right > limit + 1 || box.left < -1) && !clipped(element)) {
        found.push(`${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, '.')} [${Math.round(box.left)}, ${Math.round(box.right)}]`);
      }
    }
    return { scroll: document.documentElement.scrollWidth - limit, found: found.slice(0, 5) };
  });
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter(item => item.impact === 'serious' || item.impact === 'critical').map(item => `${item.id}: ${item.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
}

async function checkScreen(page: Page, label: string, width: number) {
  const result = await overflowingElements(page);
  expect.soft(result, `${label} at ${width}px fits the width`).toEqual({ scroll: 0, found: [] });
  if (axeWidths.has(width)) expect.soft(await seriousViolations(page), `${label} at ${width}px has no serious accessibility issues`).toEqual([]);
}

async function composerInView(page: Page, label: string, width: number) {
  const box = await page.locator('.chat-composer .composer-box').boundingBox();
  const height = page.viewportSize()!.height;
  expect.soft(box && box.y >= 0 && box.y + box.height <= height, `${label} at ${width}px keeps the composer on screen`).toBe(true);
}

for (const theme of themes) {
  for (const path of publicPaths) {
    test(`${path} fits every width (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('main h1').first()).toBeVisible();
        await checkScreen(page, path, width);
      }
    });
  }

  test(`signed-in screens fit every width (${theme})`, async ({ page }) => {
    test.setTimeout(240000);
    await useTheme(page, theme);
    await page.goto('/login');
    await page.getByLabel('Email address').fill('alex@example.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);

    // One conversation with a reply and a hand-back card, the busiest screen in the app.
    await startConversation(page, { title: 'Layout check' });
    await page.getByLabel('Your message', { exact: true }).fill('I want to build an open source database startup because developer tools customers will pay for support but serving costs may be high.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/Strengths/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Make a hand-back card' }).click();
    await expect(page.getByRole('heading', { name: /Hand-back card/ })).toBeVisible();
    const conversation = new URL(page.url()).pathname;

    const screens = [
      { path: '/home', ready: page.getByRole('heading', { name: 'What would you like to think through?' }), composer: true },
      { path: conversation, ready: page.getByRole('heading', { name: /Hand-back card/ }), composer: true },
      { path: '/history', ready: page.locator('main h1').first(), composer: false },
      { path: '/account', ready: page.locator('main h1').first(), composer: false },
      { path: '/billing', ready: page.getByRole('heading', { name: 'Your subscription' }), composer: false },
    ];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const screen of screens) {
        await page.goto(screen.path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(screen.ready).toBeVisible();
        const label = screen.path === conversation ? 'conversation' : screen.path;
        await checkScreen(page, label, width);
        if (screen.composer) await composerInView(page, label, width);
      }
    }
  });
}
