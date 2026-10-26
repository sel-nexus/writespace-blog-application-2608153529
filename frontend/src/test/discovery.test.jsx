/** Discovery contract tests using real browser-local helpers and activated navigation. */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import LandingPage from '../pages/LandingPage';
import { BlogCard } from '../components/BlogCard';
import { sortPosts, formatPostDate } from '../utils/posts';
import { getPosts, savePosts } from '../utils/storage';
import { getSession, setSession } from '../utils/auth';

const session = { userId: 'reader-id', username: 'reader', displayName: 'Local Reader', role: 'user' };

/** Full synthetic supported post shape; never used as application demo data. */
function post(id, createdAt = '2026-01-01T12:00:00.000Z', overrides = {}) {
  return { id, title: `Story ${id}`, content: `Content for ${id}`, createdAt,
    authorId: 'reader-id', authorName: 'Local Reader', ...overrides };
}

/** Expose actual router state, not the target href alone. */
function Location() {
  return (
    <output aria-label="Current route">{useLocation().pathname}</output>
  );
}

/** Mount with the same sole-router architecture as the application. */
function mount(element, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {element}
      <Location />
    </MemoryRouter>,
  );
}

const landing = () => screen.getByRole('heading', { name: 'Your words. Your space.' });
const latest = () => screen.getByRole('region', { name: 'Latest local stories' });

describe('pure post sorting and date formatting', () => {
  it('sorts a mixed collection newest-first with stable equal instants and invalid dates last without mutation', () => {
    const source = [post('invalid-a', 'legacy'), post('old', '2024-01-01T00:00:00Z'),
      post('equal-a', '2026-01-01T00:00:00Z'), post('invalid-b', 'not-a-date'),
      post('equal-b', '2025-12-31T19:00:00-05:00'), post('newest', '2027-01-01T00:00:00Z')];
    source.forEach(Object.freeze);
    Object.freeze(source);
    const sorted = sortPosts(source);
    expect(sorted.map(({ id }) => id)).toEqual(['newest', 'equal-a', 'equal-b', 'old', 'invalid-a', 'invalid-b']);
    expect(source.map(({ id }) => id)).toEqual(['invalid-a', 'old', 'equal-a', 'invalid-b', 'equal-b', 'newest']);
    expect(sorted).not.toBe(source);
    expect(sorted[0]).toBe(source[5]);
  });

  it('keeps entirely invalid or identical-date inputs stable and copies singleton/empty arrays', () => {
    const invalid = [post('a', 'bad'), post('b', 'also bad'), post('c', ' ' )];
    expect(sortPosts(invalid)).toEqual(invalid);
    const equal = [post('a'), post('b'), post('c')];
    expect(sortPosts(equal)).toEqual(equal);
    const singleton = [post('one')];
    expect(sortPosts(singleton)).toEqual(singleton);
    expect(sortPosts(singleton)).not.toBe(singleton);
    const empty = [];
    expect(sortPosts(empty)).toEqual([]);
    expect(sortPosts(empty)).not.toBe(empty);
  });

  it.each([undefined, null, {}, 'posts', 42])('returns an empty array for unsupported collection %s', (value) => {
    expect(sortPosts(value)).toEqual([]);
  });

  it('tolerates missing and non-string dates without crashing and places them after even pre-epoch dates', () => {
    const values = [null, {}, { createdAt: 0 }, { createdAt: undefined }, post('epoch', '1970-01-01T00:00:00Z'),
      post('older', '1960-01-01T00:00:00Z')];
    expect(sortPosts(values)).toEqual([values[4], values[5], ...values.slice(0, 4)]);
  });

  it('formats valid dates in UTC consistently, including pre-epoch and offset timestamps', () => {
    expect(formatPostDate('2026-01-01T12:00:00Z')).toBe('Jan 1, 2026');
    expect(formatPostDate('2025-12-31T23:30:00-02:00')).toBe('Jan 1, 2026');
    expect(formatPostDate('1960-01-01T00:00:00Z')).toBe('Jan 1, 1960');
  });

  it.each(['legacy', '', ' ', undefined, null, 0, {}, [], '999999-99-99'].map((value) => [value]))
    ('labels invalid date %s without throwing', (value) => {
    expect(formatPostDate(value)).toBe('Date unavailable');
  });
});

describe('BlogCard plain-text previews', () => {
  it.each([0, 1, 119, 120, 121, 500])('uses exactly the first 120 characters of a %s-character body with no suffix', (length) => {
    const content = 'x'.repeat(length);
    const { container } = mount(
      <BlogCard post={post('excerpt', undefined, { content })} />,
    );
    const excerpt = container.querySelector('article > p.whitespace-pre-wrap');
    expect(excerpt.textContent).toBe(content.slice(0, 120));
    expect(excerpt.textContent.length).toBe(Math.min(length, 120));
  });

  it('escapes XSS in title, excerpt and author, preserves whitespace and renders date/avatar', () => {
    const title = '<script>alert(1)</script>';
    const content = '<img src=x onerror=alert(1)>\n  <b>plain text</b>';
    const authorName = '<svg onload=alert(2)>';
    const { container } = mount(
      <BlogCard post={post('safe', undefined, { title, content, authorName })} />,
    );
    expect(screen.getByRole('link', { name: title })).toBeInTheDocument();
    expect(container.querySelector('article > p.whitespace-pre-wrap').textContent).toBe(content);
    expect(screen.getByText(authorName)).toBeInTheDocument();
    expect(container.querySelectorAll('script, img, svg, b')).toHaveLength(0);
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-01-01T12:00:00.000Z');
    expect(screen.getByText('Jan 1, 2026')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('<O');
  });

  it('shows a legacy invalid date without emitting an invalid machine-readable timestamp', () => {
    const { container } = mount(
      <BlogCard post={post('legacy', 'invalid date')} />,
    );
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(container.querySelector('time')).not.toHaveAttribute('datetime');
  });

  it('repeats the four top accents by index modulo four', () => {
    mount(
      <div>
        {Array.from({ length: 8 }, (_, index) => (
          <BlogCard key={index} post={post(String(index))} index={index} />
        ))}
      </div>,
    );
    const cards = screen.getAllByRole('article');
    const accents = ['border-t-primary', 'border-t-secondary', 'border-t-warning', 'border-t-success'];
    cards.forEach((card, index) => expect(card).toHaveClass('border-t-4', accents[index % 4]));
  });

  it('defaults to the first accent and navigates a guest only when the preview is activated', async () => {
    mount(
      <BlogCard post={post('guest')} />,
    );
    expect(screen.getByRole('article')).toHaveClass('border-t-primary');
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('link', { name: 'Story guest' })).toHaveAttribute('href', '/login');
    await userEvent.click(screen.getByRole('link', { name: 'Story guest' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
  });

  it.each(['user', 'admin'])('activates a signed-in %s preview to the future detail route', async (role) => {
    mount(
      <BlogCard post={post('a/b')} session={{ ...session, role }} />,
    );
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    await userEvent.click(screen.getByRole('link', { name: 'Story a/b' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/blog/a%2Fb');
  });
});

describe('LandingPage and the real App root route', () => {
  it('renders the actual App landing at / without redirecting, seeding records, or claiming shared publishing', () => {
    mount(
      <App />,
    );
    expect(landing()).toBeInTheDocument();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('region', { name: 'Simple by design. Local by nature.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Read local stories' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Make room for your words' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Keep the scope personal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Demo limitations')).toHaveTextContent('plaintext');
    expect(screen.getByRole('img')).toHaveAttribute('src', '/writing.jpg');
    expect(within(latest()).getByText('No local posts to preview yet.')).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('sorts all local posts before applying the latest-three limit and never changes stored order', () => {
    const posts = [post('invalid', 'legacy'), post('old', '2020-01-01T00:00:00Z'),
      post('equal-a'), post('new', '2027-01-01T00:00:00Z'), post('equal-b')];
    expect(savePosts(posts).ok).toBe(true);
    const raw = localStorage.getItem('writespace_posts');
    mount(
      <App />,
    );
    expect(within(latest()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['Story new', 'Story equal-a', 'Story equal-b']);
    expect(within(latest()).getAllByRole('article')).toHaveLength(3);
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual(posts);
  });

  it.each([0, 1, 2, 3, 4])('renders min(count, 3) for %s saved posts', (count) => {
    savePosts(Array.from({ length: count }, (_, i) => post(String(i))));
    mount(
      <LandingPage />,
    );
    expect(within(latest()).queryAllByRole('article')).toHaveLength(Math.min(count, 3));
    if (!count) expect(within(latest()).getByText('No local posts to preview yet.')).toBeInTheDocument();
  });

  it.each(['{', '{}', 'null', '[null]', '[{"id":"incomplete"}]'])('discloses corrupt/unsupported posts %s with a non-destructive empty state', (raw) => {
    localStorage.setItem('writespace_posts', raw);
    mount(
      <App />,
    );
    expect(landing()).toBeInTheDocument();
    expect(within(latest()).getByRole('status')).toHaveTextContent('No local previews can be shown.');
    expect(within(latest()).getByText('No local posts to preview yet.')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual([]);
  });

  it.each(['property', 'getItem'])('discloses unavailable storage from %s and keeps guest entry usable', async (failure) => {
    if (failure === 'property') {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    } else {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    }
    mount(
      <App />,
    );
    expect(landing()).toBeInTheDocument();
    expect(within(latest()).getByRole('status')).toHaveTextContent('Browser-local data is unavailable.');
    expect(within(latest()).queryAllByRole('article')).toHaveLength(0);
    await userEvent.click(screen.getByRole('link', { name: 'Start Reading' }));
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });

  it.each([
    ['Start Reading', '/login', 'Welcome back.'],
    ['Get Started Free', '/register', 'Create your account.'],
  ])('activates %s through the real App without navigating on render', async (name, route, heading) => {
    mount(
      <App />,
    );
    expect(landing()).toBeInTheDocument();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    await userEvent.click(screen.getByRole('link', { name }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(route);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it('activates a real App guest preview to login, then returns through the guest brand link', async () => {
    savePosts([post('preview')]);
    mount(
      <App />,
    );
    await userEvent.click(within(latest()).getByRole('link', { name: 'Story preview' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'WriteSpace.' }));
    expect(landing()).toBeInTheDocument();
  });

  it.each(['user', 'admin'])('keeps a restored %s on landing and activates its interim role-home CTA', async (role) => {
    const identity = { ...session, role };
    setSession(identity);
    savePosts([post('member')]);
    mount(
      <App />,
    );
    expect(landing()).toBeInTheDocument();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.queryByRole('link', { name: 'Start Reading' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get Started Free' })).not.toBeInTheDocument();
    expect(within(latest()).getByRole('link', { name: 'Story member' })).toHaveAttribute('href', '/blog/member');
    const footer = screen.getByRole('navigation', { name: 'Footer navigation' });
    expect(within(footer).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: role === 'admin' ? 'Admin home' : 'Reader home' }))
      .toHaveAttribute('href', role === 'admin' ? '/admin' : '/blogs');
    await userEvent.click(screen.getByRole('link', { name: role === 'admin' ? 'Go to Admin Home' : 'Go to Reader Home' }));
    expect(screen.getByRole('heading', { name: role === 'admin' ? 'Administrator home' : 'Reader home' })).toBeInTheDocument();
    expect(getSession()).toEqual(identity);
  });

  it('successful sign-out clears only the session and returns to the guest landing', async () => {
    setSession(session);
    savePosts([post('retained')]);
    mount(
      <App />, '/blogs',
    );
    expect(screen.getByRole('heading', { name: 'Reader home' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(landing()).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(getPosts()).toEqual([post('retained')]);
    expect(within(latest()).getByRole('link', { name: 'Story retained' })).toHaveAttribute('href', '/login');
  });

  it.each(['user', 'admin'])('activates the signed-in %s footer role-home destination', async (role) => {
    mount(
      <LandingPage session={{ ...session, role }} />,
    );
    const footer = screen.getByRole('navigation', { name: 'Footer navigation' });
    await userEvent.click(within(footer).getByRole('link', { name: role === 'admin' ? 'Admin home' : 'Reader home' }));
    expect(screen.getByLabelText('Current route').textContent).toBe(role === 'admin' ? '/admin' : '/blogs');
  });

  it('treats a corrupt session as guest without rewriting it', () => {
    localStorage.setItem('writespace_session', '{');
    mount(
      <App />,
    );
    expect(landing()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    expect(localStorage.getItem('writespace_session')).toBe('{');
  });

  it('activates each guest footer destination without writes', async () => {
    for (const [name, route] of [['Discover WriteSpace', '/'], ['Sign in', '/login'], ['Create account', '/register']]) {
      mount(
        <App />,
      );
      await userEvent.click(within(screen.getByRole('navigation', { name: 'Footer navigation' })).getByRole('link', { name }));
      expect(screen.getByLabelText('Current route').textContent).toBe(route);
      expect(localStorage.length).toBe(0);
      cleanup();
    }
  });

  it('uses intrinsic one/two/three-column Tailwind grids at the required breakpoints', () => {
    savePosts([post('one')]);
    mount(
      <LandingPage />,
    );
    expect(screen.getByTestId('latest-posts')).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
  });
});
