/** Real post journeys; one initial goto per test, shared pre-navigation error capture, no API mocks. */
import { test, expect } from './fixtures';

const reader = { userId: 'reader-id', username: 'reader', displayName: 'Local Reader', role: 'user' };
const another = { userId: 'other-id', username: 'other', displayName: 'Other Reader', role: 'user' };
const admin = { userId: 'builtin-admin', username: 'admin', displayName: 'Administrator', role: 'admin' };
const storedPost = {
  id: 'stored-post', title: 'Restored local story', content: 'Full plain text\n\n  with indentation  ',
  createdAt: '2026-01-01T12:00:00.000Z', authorId: reader.userId, authorName: reader.displayName,
};
const nav = (page) => page.getByRole('navigation', { name: 'Main navigation' });
const collection = (page) => page.getByRole('region', { name: 'Reader home' });

/** Seed complete synthetic persisted profile shapes only on the initial document load, never after a reload mutation. */
async function restoreProfile(page, identity = reader, posts = [storedPost]) {
  await page.addInitScript(({ identity, posts }) => {
    if (sessionStorage.getItem('posts-spec-initialized')) return;
    sessionStorage.setItem('posts-spec-initialized', 'true');
    localStorage.setItem('writespace_session', JSON.stringify(identity));
    localStorage.setItem('writespace_posts', typeof posts === 'string' ? posts : JSON.stringify(posts));
    localStorage.setItem('writespace_users', JSON.stringify([{
      id: 'reader-id', username: 'reader', displayName: 'Local Reader', password: 'x', role: 'user',
      createdAt: '2026-01-01T12:00:00.000Z',
    }]));
  }, { identity, posts });
}

/** Register through the actual form; no session injection in interactive journeys. */
async function registerReader(page, username, displayName) {
  await page.getByLabel('Display name', { exact: true }).fill(displayName);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByLabel('Confirm password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: `Welcome, ${displayName}.` })).toBeVisible();
}

/** Fill the only editable post fields. */
async function fillPost(page, title, content) {
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Content', { exact: true }).fill(content);
}

/** Re-read real persisted state after each mutation. */
async function postsInStorage(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')));
}

test('register -> write -> read -> edit -> reload -> cancelled/confirmed delete through real links', async ({ page, browserErrors }, testInfo) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await registerReader(page, 'writer-demo', 'Browser Writer');
  await expect(collection(page).getByText('No local posts to read yet.')).toBeVisible();
  await collection(page).getByRole('link', { name: 'Write', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveAccessibleDescription('Title is required.');
  await expect(page.getByLabel('Content', { exact: true })).toHaveAccessibleDescription('Content is required.');
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBeNull();
  const title = '<script>alert(1)</script>';
  const body = '<img src=x onerror=alert(1)>\n\n  literal text  '.repeat(100);
  await fillPost(page, title, body);
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  const [created] = await postsInStorage(page);
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')));
  expect(created).toEqual({ id: expect.any(String), title, content: body, createdAt: expect.any(String),
    authorId: session.userId, authorName: 'Browser Writer' });
  expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(await page.getByTestId('post-content').textContent()).toBe(body);
  await expect(page.getByRole('article').locator('script, img, svg')).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(body);
  await page.getByLabel('Content', { exact: true }).fill('  ');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toHaveAccessibleDescription('Content is required.');
  expect(await postsInStorage(page)).toEqual([created]);
  await fillPost(page, '  Revised local title  ', '  Revised\n\nbody  ');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const updated = { ...created, title: '  Revised local title  ', content: '  Revised\n\nbody  ' };
  expect(await postsInStorage(page)).toEqual([updated]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Revised local title', exact: true })).toBeVisible();
  expect(await page.getByTestId('post-content').textContent()).toBe(updated.content);
  expect(await postsInStorage(page)).toEqual([updated]);
  await page.screenshot({ path: testInfo.outputPath('local-post-reader.png'), fullPage: true });
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  expect(await postsInStorage(page)).toEqual([updated]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(collection(page).getByText('No local posts to read yet.')).toBeVisible();
  expect(await postsInStorage(page)).toEqual([]);
  await page.reload();
  await expect(collection(page).getByText('No local posts to read yet.')).toBeVisible();
  expect(await postsInStorage(page)).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('another registered author can read but not manage; built-in admin can create and moderate through links', async ({ page, browserErrors }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await registerReader(page, 'first-author', 'First Author');
  await nav(page).getByRole('link', { name: 'Write', exact: true }).click();
  await fillPost(page, 'First author story', 'First author full body.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  const [first] = await postsInStorage(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await registerReader(page, 'second-author', 'Second Author');
  await page.getByRole('link', { name: 'First author story', exact: true }).click();
  expect(await page.getByTestId('post-content').textContent()).toBe(first.content);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  expect(await postsInStorage(page)).toEqual([first]);
  await nav(page).getByRole('link', { name: 'Write', exact: true }).click();
  await fillPost(page, 'Second author story', 'Second author body.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  const second = (await postsInStorage(page))[1];
  expect(second.authorName).toBe('Second Author');
  expect(second.authorId).not.toBe(first.authorId);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await nav(page).getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administrator home', exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Users', exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Users', exact: true })).toHaveAttribute('href', '/users');
  await nav(page).getByRole('link', { name: 'Write', exact: true }).click();
  await fillPost(page, 'Administrator story', 'Administrator body.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  const adminPost = (await postsInStorage(page))[2];
  expect(adminPost.authorId).toBe('builtin-admin');
  expect(adminPost.authorName).toBe('Administrator');
  await page.getByRole('link', { name: 'Back to blogs', exact: true }).click();
  await page.getByRole('link', { name: 'First author story', exact: true }).click();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await fillPost(page, 'Moderated first story', 'Moderated plain text.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const moderated = { ...first, title: 'Moderated first story', content: 'Moderated plain text.' };
  expect(await postsInStorage(page)).toEqual([moderated, second, adminPost]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await postsInStorage(page)).toEqual([second, adminPost]);
  expect(browserErrors).toEqual([]);
});

for (const identity of [reader, admin]) {
  test(`restored ${identity.role} landing preview opens full reader and collection back link`, async ({ page, browserErrors }) => {
    await restoreProfile(page, identity);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your words. Your space.' })).toBeVisible();
    await page.getByRole('region', { name: 'Latest local stories' })
      .getByRole('link', { name: storedPost.title, exact: true }).click();
    await expect(page).toHaveURL(/\/blog\/stored-post$/);
    expect(await page.getByTestId('post-content').textContent()).toBe(storedPost.content);
    await expect(page.getByRole('article').getByText('Local Reader', { exact: true })).toBeVisible();
    await expect(page.getByRole('article').locator('time')).toHaveText('Jan 1, 2026');
    await page.getByRole('link', { name: 'Back to blogs', exact: true }).click();
    await expect(collection(page).getByRole('article')).toHaveCount(1);
    expect(await postsInStorage(page)).toEqual([storedPost]);
    expect(browserErrors).toEqual([]);
  });
}

for (const path of ['/blogs', '/blog/stored-post', '/write', '/edit/stored-post']) {
  test(`guest initial direct entry ${path} redirects to login without posts mutation`, async ({ page, browserErrors }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBeNull();
    expect(browserErrors).toEqual([]);
  });
}

for (const path of ['/blog/missing', '/edit/missing']) {
  test(`authenticated initial direct entry ${path} shows exact not-found and activated back link`, async ({ page, browserErrors }) => {
    await restoreProfile(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Post not found', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to blogs', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await postsInStorage(page)).toEqual([storedPost]);
    expect(browserErrors).toEqual([]);
  });
}

test('other-author initial direct edit is refused and reader has no management controls', async ({ page, browserErrors }) => {
  await restoreProfile(page, another);
  await page.goto('/edit/stored-post');
  await expect(page).toHaveURL(/\/blogs$/);
  await page.getByRole('link', { name: storedPost.title, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  expect(await page.getByTestId('post-content').textContent()).toBe(storedPost.content);
  expect(await postsInStorage(page)).toEqual([storedPost]);
  expect(browserErrors).toEqual([]);
});

test('owner initial direct edit prefills and reload retains metadata before activated save', async ({ page, browserErrors }) => {
  await restoreProfile(page);
  await page.goto('/edit/stored-post');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(storedPost.title);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(storedPost.content);
  await page.reload();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(storedPost.content);
  await fillPost(page, 'Direct edit revised', 'Revised body.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(await postsInStorage(page)).toEqual([{ ...storedPost, title: 'Direct edit revised', content: 'Revised body.' }]);
  await expect(page).toHaveURL(/\/blog\/stored-post$/);
  expect(browserErrors).toEqual([]);
});

test('corrupt restored session on initial write entry fails closed without repair', async ({ page, browserErrors }) => {
  await page.addInitScript(() => localStorage.setItem('writespace_session', '{'));
  await page.goto('/write');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBe('{');
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBeNull();
  expect(browserErrors).toEqual([]);
});

test('corrupt persisted posts remain untouched through collection empty action and attempted creation', async ({ page, browserErrors }) => {
  await restoreProfile(page, reader, '{');
  await page.goto('/blogs');
  await expect(collection(page).getByRole('status')).toContainText('not been changed');
  await collection(page).getByRole('link', { name: 'Write', exact: true }).click();
  await fillPost(page, 'Unsaved title', 'Unsaved content.');
  await page.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not been changed');
  await expect(page).toHaveURL(/\/write$/);
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe('{');
  expect(browserErrors).toEqual([]);
});

for (const [width, columns] of [[390, 1], [639, 1], [768, 2], [1024, 3]]) {
  test(`all posts display ${columns} columns at ${width}px with repeating accents and stable newest-first order`,
    async ({ page, browserErrors }, testInfo) => {
      const records = Array.from({ length: 6 }, (_, index) => ({ ...storedPost, id: `post-${index}`,
        title: `Story ${index}`, content: 'x'.repeat(121), createdAt: index < 2 ? 'legacy' : `2026-01-0${index}T12:00:00Z` }));
      await page.setViewportSize({ width, height: 844 });
      await restoreProfile(page, reader, records);
      await page.goto('/blogs');
      const grid = page.getByTestId('all-posts');
      await expect(grid.getByRole('heading', { level: 3 })).toHaveText(['Story 5', 'Story 4', 'Story 3', 'Story 2', 'Story 0', 'Story 1']);
      expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(columns);
      const accents = ['border-t-primary', 'border-t-secondary', 'border-t-warning', 'border-t-success'];
      for (let index = 0; index < 6; index += 1) {
        const card = grid.getByRole('article').nth(index);
        expect((await card.getAttribute('class')).split(' ')).toContain(accents[index % 4]);
        expect(await card.locator('p.whitespace-pre-wrap').textContent()).toBe('x'.repeat(120));
      }
      expect(await postsInStorage(page)).toEqual(records);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await grid.getByRole('link', { name: 'Story 5', exact: true }).click();
      expect(await page.getByTestId('post-content').textContent()).toBe('x'.repeat(121));
      if (width === 390) await page.screenshot({ path: testInfo.outputPath('reader-mobile.png'), fullPage: true });
      expect(browserErrors).toEqual([]);
    });
}
