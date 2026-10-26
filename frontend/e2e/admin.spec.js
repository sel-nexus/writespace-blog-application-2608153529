/** Real administration journeys; fixtures capture console/page errors before the sole initial navigation. */
import { test, expect } from './fixtures';

const nav = (page) => page.getByRole('navigation', { name: 'Main navigation' });
const quickActions = (page) => page.getByRole('navigation', { name: 'Quick actions' });
const desktop = (page) => page.getByTestId('users-desktop');
const mobile = (page) => page.getByTestId('users-mobile');
const sourceAdmin = { userId: 'builtin-admin', username: 'admin', displayName: 'Administrator', role: 'admin' };

/** Sign in through the existing real form, using synthetic demo credentials only. */
async function login(page, username = 'admin', password = 'admin') {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Create a supported account through the real admin form. */
async function createAccount(page, username, displayName, role) {
  await page.getByLabel('Display name', { exact: true }).fill(displayName);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('demo-only-secret');
  await page.getByLabel('Role', { exact: true }).selectOption(role);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Account saved in this browser.');
}

/** Read the actual browser-local user array after mutations. */
async function storedUsers(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')));
}

/** Read the actual browser-local post array after mutations. */
async function storedPosts(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')));
}

/** Sign out and return to login through visible links rather than another goto. */
async function returnToLogin(page) {
  await nav(page).getByRole('button', { name: 'Sign out', exact: true }).click();
  await nav(page).getByRole('link', { name: 'Sign in', exact: true }).click();
}

/** Assert generated source contract fields and no invented persisted properties. */
function expectAccount(account, username, displayName, role) {
  expect(account).toEqual({
    id: expect.any(String), displayName, username, password: 'demo-only-secret', role, createdAt: expect.any(String),
  });
  expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(new Date(account.createdAt).toISOString()).toBe(account.createdAt);
}

test('real login -> dashboard -> create each account role -> protections/deletion -> write and moderate posts',
  async ({ page, browserErrors }, testInfo) => {
    test.setTimeout(60000);
    await page.goto('/login');
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Administrator home', exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-card')).toHaveText(['Total Posts0', 'Total Users1', 'Admins1', '']);
    await expect(page.getByTestId('stat-card').nth(3)).toHaveAttribute('aria-hidden', 'true');
    expect(await page.getByTestId('stat-card').nth(3).getAttribute('aria-label')).toBeNull();
    await expect(page.getByText(/fourth metric is unresolved/)).toBeVisible();
    await expect(quickActions(page).getByRole('link')).toHaveText(['Write New Post', 'Manage Users']);
    expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
    await quickActions(page).getByRole('link', { name: 'Manage Users', exact: true }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(desktop(page)).toBeVisible();
    await expect(mobile(page)).toBeHidden();
    await expect(page.getByText('No stored local accounts yet.')).toBeVisible();
    await expect(desktop(page).getByRole('button', { name: 'Delete Administrator' })).toBeDisabled();
    expect(await desktop(page).getByRole('button', { name: 'Delete Administrator' }).getAttribute('title')).toBeNull();
    await expect(page.getByText(/source does not specify/)).toBeVisible();
    await expect(page.getByText(/Passwords are plaintext/)).toContainText('hard-coded');
    await expect(page.getByText(/Passwords are plaintext/)).toContainText('not real authorization');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveAccessibleDescription('Display name is required.');
    await expect(page.getByLabel('Username', { exact: true })).toHaveAccessibleDescription('Username is required.');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAccessibleDescription('Password is required.');
    expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
    await createAccount(page, 'author-demo', 'Demo Author', 'user');
    await createAccount(page, 'admin-demo', 'Demo Admin', 'admin');
    const [author, admin] = await storedUsers(page);
    expectAccount(author, 'author-demo', 'Demo Author', 'user');
    expectAccount(admin, 'admin-demo', 'Demo Admin', 'admin');
    await page.getByLabel('Display name', { exact: true }).fill('Duplicate');
    await page.getByLabel('Username', { exact: true }).fill('AUTHOR-DEMO');
    await page.getByLabel('Password', { exact: true }).fill('not-a-real-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByLabel('Username', { exact: true })).toHaveAccessibleDescription('That username is already used in this browser.');
    expect(await storedUsers(page)).toEqual([author, admin]);
    await expect(desktop(page)).not.toContainText('demo-only-secret');
    await expect(mobile(page)).not.toContainText('demo-only-secret');
    await page.reload();
    expect(await storedUsers(page)).toEqual([author, admin]);
    await expect(desktop(page).getByText('Demo Author', { exact: true })).toBeVisible();

    // The created reader produces a real post, so moderation proves cross-feature authorship preservation.
    await returnToLogin(page);
    await login(page, author.username, author.password);
    await nav(page).getByRole('link', { name: 'Write', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Author story');
    await page.getByLabel('Content', { exact: true }).fill('Author plain text.');
    await page.getByRole('button', { name: 'Save post', exact: true }).click();
    const [authorPost] = await storedPosts(page);
    expect(authorPost).toEqual({
      id: expect.any(String), title: 'Author story', content: 'Author plain text.', createdAt: expect.any(String),
      authorId: author.id, authorName: author.displayName,
    });
    await returnToLogin(page);
    await login(page, admin.username, admin.password);
    await nav(page).getByRole('link', { name: 'Users', exact: true }).click();
    await expect(desktop(page).getByRole('button', { name: 'Delete Demo Admin' })).toBeDisabled();
    await expect(desktop(page).getByRole('button', { name: 'Delete Administrator' })).toBeDisabled();
    await returnToLogin(page);
    await login(page);
    await nav(page).getByRole('link', { name: 'Users', exact: true }).click();
    for (const target of [author, admin]) {
      page.once('dialog', (dialog) => dialog.dismiss());
      await desktop(page).getByRole('button', { name: `Delete ${target.displayName}`, exact: true }).click();
      await expect(page).toHaveURL(/\/users$/);
      expect((await storedUsers(page)).some((user) => user.id === target.id)).toBe(true);
      const before = await storedUsers(page);
      page.once('dialog', (dialog) => dialog.accept());
      await desktop(page).getByRole('button', { name: `Delete ${target.displayName}`, exact: true }).click();
      expect(await storedUsers(page)).toEqual(before.filter((user) => user.id !== target.id));
      await expect(page.getByRole('status')).toHaveText('Account deleted in this browser.');
    }
    expect(await storedUsers(page)).toEqual([]);
    expect(await storedPosts(page)).toEqual([authorPost]);
    await nav(page).getByRole('link', { name: 'Admin home', exact: true }).click();
    await expect(page.getByTestId('stat-card')).toHaveText(['Total Posts1', 'Total Users1', 'Admins1', '']);
    await quickActions(page).getByRole('link', { name: 'Write New Post', exact: true }).click();
    await expect(page).toHaveURL(/\/write$/);
    await page.getByLabel('Title', { exact: true }).fill('Administrator note');
    await page.getByLabel('Content', { exact: true }).fill('Local administrator body.');
    await page.getByRole('button', { name: 'Save post', exact: true }).click();
    const adminPost = (await storedPosts(page))[1];
    expect(adminPost).toEqual({
      id: expect.any(String), title: 'Administrator note', content: 'Local administrator body.', createdAt: expect.any(String),
      authorId: sourceAdmin.userId, authorName: sourceAdmin.displayName,
    });
    await nav(page).getByRole('link', { name: 'Admin home', exact: true }).click();
    await page.getByRole('link', { name: 'Edit Author story', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/edit/${authorPost.id}$`));
    await page.getByLabel('Title', { exact: true }).fill('Moderated author story');
    await page.getByLabel('Content', { exact: true }).fill('Moderated plain text.');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const moderated = { ...authorPost, title: 'Moderated author story', content: 'Moderated plain text.' };
    expect(await storedPosts(page)).toEqual([moderated, adminPost]);
    await nav(page).getByRole('link', { name: 'Admin home', exact: true }).click();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Delete Moderated author story', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(await storedPosts(page)).toEqual([moderated, adminPost]);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete Moderated author story', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await storedPosts(page)).toEqual([adminPost]);
    await nav(page).getByRole('link', { name: 'Admin home', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('stat-card')).toHaveText(['Total Posts1', 'Total Users1', 'Admins1', '']);
    expect(await storedPosts(page)).toEqual([adminPost]);
    await page.screenshot({ path: testInfo.outputPath('admin-dashboard-desktop.png'), fullPage: true });
    expect(browserErrors).toEqual([]);
  });

for (const width of [390, 639, 640]) {
  test(`real admin login and responsive accounts at ${width}px support creation and cancel/confirm deletion`,
    async ({ page, browserErrors }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/login');
      await login(page);
      await quickActions(page).getByRole('link', { name: 'Manage Users', exact: true }).click();
      const layout = width < 640 ? mobile(page) : desktop(page);
      await expect(layout).toBeVisible();
      await expect(width < 640 ? desktop(page) : mobile(page)).toBeHidden();
      await expect(layout.getByRole('button', { name: 'Delete Administrator' })).toBeDisabled();
      await createAccount(page, 'mobile-reader', 'Mobile Reader', 'user');
      await createAccount(page, 'mobile-admin', 'Mobile Admin', 'admin');
      const users = await storedUsers(page);
      expectAccount(users[0], 'mobile-reader', 'Mobile Reader', 'user');
      expectAccount(users[1], 'mobile-admin', 'Mobile Admin', 'admin');
      await expect(layout.getByText('Mobile Reader', { exact: true })).toBeVisible();
      await expect(layout.getByText('Mobile Admin', { exact: true })).toBeVisible();
      if (width < 640) await expect(layout.getByRole('article')).toHaveCount(3);
      else await expect(layout.getByRole('row')).toHaveCount(4);
      page.once('dialog', (dialog) => dialog.dismiss());
      await layout.getByRole('button', { name: 'Delete Mobile Reader' }).click();
      expect(await storedUsers(page)).toEqual(users);
      page.once('dialog', (dialog) => dialog.accept());
      await layout.getByRole('button', { name: 'Delete Mobile Reader' }).click();
      expect(await storedUsers(page)).toEqual([users[1]]);
      await expect(layout.getByText('Mobile Reader', { exact: true })).toHaveCount(0);
      await page.reload();
      expect(await storedUsers(page)).toEqual([users[1]]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`users-${width}.png`), fullPage: true });
      if (width < 640) await page.getByRole('button', { name: 'Open navigation' }).click();
      await nav(page).getByRole('link', { name: 'Admin home', exact: true }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByTestId('stat-card')).toHaveText(['Total Posts0', 'Total Users2', 'Admins2', '']);
      if (width < 640) {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await nav(page).getByRole('link', { name: 'Users', exact: true }).click();
        await expect(page).toHaveURL(/\/users$/);
        await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
      }
      expect(browserErrors).toEqual([]);
    });
}

for (const path of ['/admin', '/users']) {
  for (const role of ['guest', 'user']) {
    test(`${role} initial direct entry ${path} applies the real admin guard without local mutation`, async ({ page, browserErrors }) => {
      if (role === 'user') {
        await page.addInitScript(() => {
          localStorage.setItem('writespace_session', JSON.stringify({
            userId: 'reader-id', username: 'reader', displayName: 'Restored Reader', role: 'user',
          }));
        });
      }
      await page.goto(path);
      await expect(page).toHaveURL(role === 'guest' ? /\/login$/ : /\/blogs$/);
      await expect(page.getByRole('heading', { name: role === 'guest' ? 'Welcome back.' : 'Reader home', exact: true })).toBeVisible();
      await expect(nav(page).getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBeNull();
      expect(browserErrors).toEqual([]);
    });
  }
}

test('real login shows newest five after sorting, counts source admin once, and preserves escaped local posts', async ({ page, browserErrors }) => {
  const records = Array.from({ length: 7 }, (_, index) => ({
    id: `post-${index}`, title: index === 6 ? '<script>literal</script>' : `Story ${index}`, content: 'Plain body',
    createdAt: index === 0 ? 'legacy' : `2026-01-0${index}T12:00:00.000Z`, authorId: 'reader-id', authorName: 'Local Reader',
  }));
  await page.addInitScript((posts) => {
    if (sessionStorage.getItem('admin-posts-seeded')) return;
    sessionStorage.setItem('admin-posts-seeded', 'true');
    localStorage.setItem('writespace_posts', JSON.stringify(posts));
  }, records);
  await page.goto('/login');
  await login(page);
  const recent = page.getByRole('region', { name: 'Newest local posts' });
  await expect(recent.getByRole('article')).toHaveCount(5);
  await expect(recent.getByRole('heading', { level: 3 })).toHaveText(['<script>literal</script>', 'Story 5', 'Story 4', 'Story 3', 'Story 2']);
  await expect(page.getByTestId('stat-card')).toHaveText(['Total Posts7', 'Total Users1', 'Admins1', '']);
  await expect(recent.locator('script')).toHaveCount(0);
  await expect(recent.getByRole('article').first()).toContainText('Local Reader');
  await expect(recent.getByRole('article').first().locator('time')).toHaveText('Jan 6, 2026');
  expect(await storedPosts(page)).toEqual(records);
  await page.reload();
  expect(await storedPosts(page)).toEqual(records);
  expect(browserErrors).toEqual([]);
});

test('unreadable local accounts remain untouched through real login, users form and dashboard navigation', async ({ page, browserErrors }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('admin-corrupt-seeded')) return;
    sessionStorage.setItem('admin-corrupt-seeded', 'true');
    localStorage.setItem('writespace_users', '{');
  });
  await page.goto('/login');
  await login(page);
  await expect(page.getByRole('status')).toContainText('Stored account counts are unavailable');
  await quickActions(page).getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Stored accounts cannot be shown');
  await page.getByLabel('Display name', { exact: true }).fill('Unsaved Reader');
  await page.getByLabel('Username', { exact: true }).fill('unsaved-reader');
  await page.getByLabel('Password', { exact: true }).fill('demo-only-secret');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not been changed');
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe('{');
  await nav(page).getByRole('link', { name: 'Admin home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administrator home' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe('{');
  expect(browserErrors).toEqual([]);
});
