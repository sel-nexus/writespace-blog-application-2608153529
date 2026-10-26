/** Real local discovery journeys. Only initial entry uses goto; shared fixtures capture errors. */
import { test, expect } from './fixtures';

// Full synthetic Post shapes seed an existing browser profile, not application demo records.
const posts = [
  { id: 'invalid-a', title: 'Legacy note', content: 'Legacy plain text.', createdAt: 'legacy', authorId: 'reader-id', authorName: 'Local Reader' },
  { id: 'old', title: 'Earlier note', content: 'Earlier plain text.', createdAt: '2024-01-01T00:00:00Z', authorId: 'reader-id', authorName: 'Local Reader' },
  { id: 'equal-a', title: 'Equal first', content: 'Equal first plain text.', createdAt: '2026-01-01T00:00:00Z', authorId: 'reader-id', authorName: 'Local Reader' },
  { id: 'newest', title: '<script>alert(1)</script>', content: '<img src=x onerror=alert(1)>\n  '.repeat(8),
    createdAt: '2027-01-01T00:00:00Z', authorId: 'reader-id', authorName: '<svg onload=alert(2)>' },
  { id: 'equal-b', title: 'Equal second', content: 'Equal second plain text.', createdAt: '2026-01-01T00:00:00Z', authorId: 'reader-id', authorName: 'Local Reader' },
];

/** Seed only the approved browser-local key before entering the app. */
async function seedPosts(page, value = posts) {
  await page.addInitScript((records) => {
    localStorage.setItem('writespace_posts', JSON.stringify(records));
  }, value);
}

const latest = (page) => page.getByRole('region', { name: 'Latest local stories' });

test('local latest-three previews are ordered, escaped, persisted and guest preview activation opens login', async ({ page, browserErrors }) => {
  await seedPosts(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your words. Your space.' })).toBeVisible();
  const stories = latest(page);
  await expect(stories.getByRole('article')).toHaveCount(3);
  await expect(stories.getByRole('heading', { level: 3 })).toHaveText(['<script>alert(1)</script>', 'Equal first', 'Equal second']);
  const excerpt = stories.getByRole('article').first().locator('p.whitespace-pre-wrap');
  expect(await excerpt.textContent()).toBe(posts[3].content.slice(0, 120));
  await expect(stories.getByRole('article').first()).toContainText('Jan 1, 2027');
  await expect(stories.getByRole('article').first()).toContainText('<svg onload=alert(2)>');
  await expect(stories.locator('script, img, svg')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual(posts);
  await page.reload();
  await expect(stories.getByRole('heading', { level: 3 })).toHaveText(['<script>alert(1)</script>', 'Equal first', 'Equal second']);
  await stories.getByRole('link', { name: '<script>alert(1)</script>', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace.', exact: true }).click();
  await expect(stories.getByRole('article')).toHaveCount(3);
  expect(browserErrors).toEqual([]);
});

test('guest CTAs and footer links navigate only on activation with a truthful empty state', async ({ page, browserErrors }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(latest(page).getByText('No local posts to preview yet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Read local stories' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make room for your words' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep the scope personal' })).toBeVisible();
  await expect(page.getByLabel('Demo limitations')).toContainText('plaintext');
  await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace.', exact: true }).click();
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace.', exact: true }).click();
  await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'WriteSpace.', exact: true }).click();
  await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBeNull();
  expect(browserErrors).toEqual([]);
});

for (const raw of ['{', '{}', '[null]']) {
  test(`corrupt local posts ${raw} stay untouched with an empty disclosure and usable CTA`, async ({ page, browserErrors }) => {
    await page.addInitScript((value) => localStorage.setItem('writespace_posts', value), raw);
    await page.goto('/');
    await expect(latest(page).getByRole('status')).toContainText('No local previews can be shown.');
    await expect(latest(page).getByText('No local posts to preview yet.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(raw);
    await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
}

test('legacy invalid dates remain in stable order after valid dates', async ({ page, browserErrors }) => {
  const records = [posts[0], { ...posts[0], id: 'invalid-b', title: 'Legacy second', createdAt: 'invalid' }, posts[1]];
  await seedPosts(page, records);
  await page.goto('/');
  await expect(latest(page).getByRole('heading', { level: 3 })).toHaveText(['Earlier note', 'Legacy note', 'Legacy second']);
  await expect(latest(page).getByText('Date unavailable', { exact: true })).toHaveCount(2);
  await expect(latest(page).locator('time[datetime]')).toHaveCount(1);
  expect(browserErrors).toEqual([]);
});

for (const role of ['user', 'admin']) {
  test(`restored ${role} stays on / with appropriate preview links and activated role-home CTA`, async ({ page, browserErrors }) => {
    await seedPosts(page);
    await page.addInitScript((role) => localStorage.setItem('writespace_session', JSON.stringify({
      userId: 'reader-id', username: 'reader', displayName: 'Local Reader', role,
    })), role);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Your words. Your space.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get Started Free' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Start Reading' })).toHaveCount(0);
    // The signed-in preview points to the real post reader; role-home behavior remains independently covered.
    await expect(latest(page).getByRole('link', { name: 'Equal first', exact: true })).toHaveAttribute('href', '/blog/equal-a');
    await expect(page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Sign in' })).toHaveCount(0);
    await page.getByRole('link', { name: role === 'admin' ? 'Go to Admin Home' : 'Go to Reader Home', exact: true }).click();
    await expect(page).toHaveURL(role === 'admin' ? /\/admin$/ : /\/blogs$/);
    await expect(page.getByRole('heading', { name: role === 'admin' ? 'Administrator home' : 'Reader home', exact: true })).toBeVisible();
    if (role === 'user') {
      await expect(page.getByTestId('all-posts').getByRole('article')).toHaveCount(posts.length);
      await page.getByRole('link', { name: 'Equal first', exact: true }).click();
      await expect(page).toHaveURL(/\/blog\/equal-a$/);
      expect(await page.getByTestId('post-content').textContent()).toBe(posts[2].content);
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your words. Your space.' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
    expect(browserErrors).toEqual([]);
  });
}

for (const [width, columns] of [[390, 1], [639, 1], [768, 2], [1024, 3]]) {
  test(`discovery has ${columns} columns at ${width}px and uses a local photo`, async ({ page, browserErrors }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedPosts(page);
    await page.goto('/');
    const grid = page.getByTestId('latest-posts');
    const sizes = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' '));
    expect(sizes).toHaveLength(columns);
    const photo = page.getByRole('img', { name: 'A typewriter ready for a page of writing' });
    await expect(photo).toHaveAttribute('src', '/writing.jpg');
    await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
}
