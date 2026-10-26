/** Capture text-based interface evidence and screenshots before full journey verification. */
import { test, expect } from './fixtures';

/** Attach rendered semantics, styles and HTML without using images for model judgment.
 * @param {import('@playwright/test').Page} page Rendered application page.
 * @param {import('@playwright/test').TestInfo} info Output/attachment destination.
 * @param {string} name Meaningful view/state identifier.
 * @returns {Promise<void>} Evidence is retained as ordinary test attachments.
 */
async function capture(page, info, name) {
  await page.evaluate(() => document.fonts.ready);
  const tree = await page.locator('body').ariaSnapshot();
  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const main = getComputedStyle(document.querySelector('main'));
    const heading = getComputedStyle(document.querySelector('h1'));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bodyFont: body.fontFamily,
      mainFont: main.fontFamily,
      headingFont: heading.fontFamily,
      foreground: main.color,
      background: getComputedStyle(document.querySelector('#root > div')).backgroundColor,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(styles.horizontalOverflow).toBe(false);
  await info.attach(`${name}-accessibility.yaml`, { body: tree, contentType: 'text/yaml' });
  await info.attach(`${name}-styles.json`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
  await info.attach(`${name}-rendered.html`, { body: await page.content(), contentType: 'text/html' });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  console.log(`PREFLIGHT ${name} ${JSON.stringify(styles)}`);
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`public semantics and form errors at ${viewport.width}px`, async ({ page, browserErrors }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your words. Your space.' })).toBeVisible();
    await capture(page, info, `landing-${viewport.width}`);
    if (viewport.width < 640) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await capture(page, info, 'public-navigation-open');
      await page.getByRole('button', { name: 'Close navigation' }).click();
    }
    await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await capture(page, info, `login-errors-${viewport.width}`);
    await page.getByRole('link', { name: 'Create an account', exact: true }).click();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(4);
    await capture(page, info, `registration-errors-${viewport.width}`);
    expect(browserErrors).toEqual([]);
  });

  test(`administration and writing semantics at ${viewport.width}px`, async ({ page, browserErrors }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');
    await page.getByLabel('Username', { exact: true }).fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('admin');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await capture(page, info, `admin-empty-${viewport.width}`);
    await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(3);
    await capture(page, info, `users-errors-${viewport.width}`);
    await page.getByLabel('Display name', { exact: true }).fill('Preflight Reader');
    await page.getByLabel('Username', { exact: true }).fill('preflight-reader');
    await page.getByLabel('Password', { exact: true }).fill('x');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Account saved');
    await capture(page, info, `users-populated-${viewport.width}`);
    if (viewport.width < 640) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Write', exact: true }).click();
    await capture(page, info, `writing-${viewport.width}`);
    expect(browserErrors).toEqual([]);
  });
}
