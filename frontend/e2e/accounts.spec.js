/** Exercise real account UI and browser storage; only initial entry uses goto. */
import { test, expect } from './fixtures';

/** Fill required registration fields with non-sensitive demo values. */
async function fillAccount(page, username = 'reader-demo', displayName = 'Browser Reader') {
  await page.getByLabel('Display name', { exact: true }).fill(displayName);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByLabel('Confirm password', { exact: true }).fill('x');
}

test('register, persist on reload, sign out, sign in case-insensitively and reject duplicates', async ({ page, browserErrors }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByLabel('Demo limitations')).toContainText('plaintext');
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await fillAccount(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Browser Reader.' })).toBeVisible();
  const account = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users'))[0]);
  expect(account).toMatchObject({ displayName: 'Browser Reader', username: 'reader-demo', role: 'user', password: 'x' });
  expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(new Date(account.createdAt).toISOString()).toBe(account.createdAt);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Browser Reader.' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')).userId)).toBe(account.id);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await page.getByLabel('Username', { exact: true }).fill('READER-DEMO');
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Browser Reader.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await fillAccount(page, 'READER-DEMO');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already used');
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')).length)).toBe(1);
  expect(browserErrors).toEqual([]);
});

test('required login errors and invalid credentials do not sign in; actual admin hint succeeds', async ({ page, browserErrors }, testInfo) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Username', { exact: true })).toHaveAccessibleDescription('Username is required.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAccessibleDescription('Password is required.');
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('bad-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The username or password is incorrect.');
  await expect(page.getByRole('alert')).not.toContainText('bad-demo');
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await expect(page.getByText(/Try the built-in demo/)).toContainText('username admin, password admin');
  await page.getByLabel('Username', { exact: true }).fill('ADMIN');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Administrator home' })).toBeVisible();
  const identity = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')));
  expect(identity).toEqual({ userId: 'builtin-admin', username: 'admin', displayName: 'Administrator', role: 'admin' });
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
  await page.getByRole('link', { name: 'Visit reader home' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await page.getByRole('link', { name: 'Admin home', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Administrator home' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-session-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('registration required, mismatch and reserved-name feedback blocks persistence', async ({ page, browserErrors }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  await fillAccount(page, 'ADMIN');
  await page.getByLabel('Confirm password', { exact: true }).fill('y');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAccessibleDescription('Passwords do not match.');
  await page.getByLabel('Confirm password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('reserved');
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await page.getByRole('link', { name: 'Go to sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

for (const path of ['/blogs', '/admin']) {
  test(`guest direct entry to ${path} returns sign-in and survives reload`, async ({ page, browserErrors }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
}

for (const path of ['/admin', '/login', '/register']) {
  test(`previously signed-in reader direct entry at ${path} restores role and denies admin access`, async ({ page, browserErrors }) => {
    // Synthetic persisted session represents an existing browser profile; interactive auth is exercised above.
    await page.addInitScript(() => {
      localStorage.setItem('writespace_session', JSON.stringify({
        userId: 'persisted-reader', username: 'reader-local', displayName: 'Restored Reader', role: 'user',
      }));
    });
    await page.goto(path);
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Restored Reader.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin home', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Reader home', exact: true })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
}

test('corrupt direct-entry session fails closed without being repaired', async ({ page, browserErrors }) => {
  await page.addInitScript(() => localStorage.setItem('writespace_session', '{'));
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBe('{');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('mobile guest and account menus activate, close after links and support logout', async ({ page, browserErrors }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Create account', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  await fillAccount(page, 'mobile-reader', 'Mobile Reader');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Mobile Reader.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.screenshot({ path: testInfo.outputPath('account-menu-mobile.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('link', { name: 'Reader home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  expect(browserErrors).toEqual([]);
});
