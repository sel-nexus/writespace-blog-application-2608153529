/** Specify post Result contracts, persisted state transitions, and real routed component interactions. */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import { BUILTIN_ADMIN, setSession } from '../utils/auth';
import { createPost, deletePost, getPosts, readPosts, savePosts, updatePost } from '../utils/storage';

const session = { userId: 'writer-id', username: 'writer', displayName: 'Local Writer', role: 'user' };
const other = { userId: 'other-id', username: 'other', displayName: 'Other Writer', role: 'user' };
const input = { title: '  Local title  ', content: '  Plain text\n\n  with spaces  ' };
const post = {
  id: 'post-id', title: 'Original title', content: 'Original\n  plain text',
  createdAt: '2026-01-01T12:00:00.000Z', authorId: session.userId, authorName: session.displayName,
};
const companion = { ...post, id: 'companion', title: 'Keep this post', authorId: other.userId, authorName: other.displayName };

/** Expose actual navigation rather than merely asserting href attributes. */
function Location() {
  return (
    <output aria-label="Current route">{useLocation().pathname}</output>
  );
}

/** Mount the production route tree; restored profiles use full synthetic storage shapes. */
function mount(path = '/blogs', identity = session) {
  if (identity) setSession(identity);
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}

/** Fail only writes to posts, leaving persisted bytes readable for outcome assertions. */
function failWrites(name = 'Error') {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
    if (key === 'writespace_posts') throw new DOMException('private body must not leak', name);
    return original.call(this, key, value);
  });
}

/** Invoke each public mutation with a shared target while preserving the individual result contract. */
function mutate(operation, actor = session, posts) {
  if (operation === 'create') return createPost(input, actor, posts);
  if (operation === 'update') return updatePost({ postId: post.id, ...input }, actor, posts);
  return deletePost({ postId: post.id, confirmed: true }, actor, posts);
}

/** Fill controlled text without expensive per-character simulation on large payloads. */
function fillPost(values = input) {
  fireEvent.change(screen.getByLabelText('Title', { exact: false }), { target: { value: values.title } });
  fireEvent.change(screen.getByLabelText('Content', { exact: true }), { target: { value: values.content } });
}

const route = () => screen.getByLabelText('Current route').textContent;
const persisted = () => JSON.parse(localStorage.getItem('writespace_posts'));

describe('createPost persisted Result contract', () => {
  it.each([session, BUILTIN_ADMIN])('creates a UUID/timestamp and derives authorship for $role without accepting form metadata', (actor) => {
    savePosts([companion]);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('generated-post-id');
    const before = Date.now();
    const result = createPost({ ...input, authorId: 'forged', authorName: 'Forged', id: 'forged', createdAt: 'forged' }, actor);
    expect(result).toEqual({ ok: true, value: {
      id: 'generated-post-id', ...input, authorId: actor.userId, authorName: actor.displayName, createdAt: expect.any(String),
    } });
    expect(new Date(result.value.createdAt).toISOString()).toBe(result.value.createdAt);
    expect(Date.parse(result.value.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.value.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(persisted()).toEqual([companion, result.value]);
    expect(getPosts()).toEqual([companion, result.value]);
  });

  it('creates from missing storage and accepts large plain text without normalizing it', () => {
    const content = '<script>alert(1)</script>\n  '.repeat(5000);
    const result = createPost({ title: 'x'.repeat(1000), content }, session, []);
    expect(result.ok).toBe(true);
    expect(result.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(persisted()).toEqual([result.value]);
    expect(getPosts()[0].content).toBe(content);
  });

  it.each([undefined, null, {}, { ...input, title: ' \n ' }, { ...input, content: '  ' },
    { ...input, title: 4 }, { ...input, content: {} }, { content: 'body' }, { title: 'title' }])
    ('rejects invalid create input %j without modifying existing storage', (value) => {
      savePosts([post]);
      expect(createPost(value, session).error.code).toBe('invalid');
      expect(persisted()).toEqual([post]);
    });

  it('catches UUID exceptions and rejects unusable/generated duplicate identities without saving', () => {
    savePosts([post]);
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('private'); });
    expect(createPost(input, session).error.code).toBe('unavailable');
    uuid.mockReturnValue('');
    expect(createPost(input, session).error.code).toBe('shape');
    uuid.mockReturnValue(post.id);
    expect(createPost(input, session).error.code).toBe('duplicate');
    expect(persisted()).toEqual([post]);
  });

  it('catches unavailable UUID support and timestamp failure without changing records', () => {
    savePosts([post]);
    vi.stubGlobal('crypto', {});
    expect(createPost(input, session).error.code).toBe('unavailable');
    vi.unstubAllGlobals();
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => { throw new Error('private'); });
    expect(createPost(input, session).error.code).toBe('unavailable');
    expect(persisted()).toEqual([post]);
  });
});

describe('updatePost and deletePost persisted Result contracts', () => {
  it.each([session, BUILTIN_ADMIN])('permits $role edits while preserving ID date and original author, ignoring supplied metadata', (actor) => {
    savePosts([post, companion]);
    const snapshot = Object.freeze([Object.freeze({ ...post }), Object.freeze({ ...companion })]);
    const result = updatePost({ postId: post.id, ...input, authorId: 'forged', authorName: 'forged', createdAt: 'later' }, actor, snapshot);
    expect(result).toEqual({ ok: true, value: { ...post, ...input } });
    expect(snapshot).toEqual([post, companion]);
    expect(persisted()).toEqual([{ ...post, ...input }, companion]);
    expect(getPosts()).toEqual([{ ...post, ...input }, companion]);
  });

  it.each([session, BUILTIN_ADMIN])('permits $role confirmed deletion of only the target', (actor) => {
    savePosts([post, companion]);
    const snapshot = Object.freeze([Object.freeze({ ...post }), Object.freeze({ ...companion })]);
    expect(deletePost({ postId: post.id, confirmed: true }, actor, snapshot))
      .toEqual({ ok: true, value: { deleted: true, postId: post.id } });
    expect(snapshot).toEqual([post, companion]);
    expect(persisted()).toEqual([companion]);
    expect(getPosts()).toEqual([companion]);
  });

  it('preserves metadata and full large escaped-text input in a persisted edit', () => {
    savePosts([post, companion]);
    const content = '<img src=x onerror=alert(1)>\n  '.repeat(5000);
    const result = updatePost({ postId: post.id, title: 'x'.repeat(1000), content }, session);
    expect(result).toEqual({ ok: true, value: { ...post, title: 'x'.repeat(1000), content } });
    expect(persisted()).toEqual([result.value, companion]);
    expect(getPosts()[0].content).toBe(content);
  });

  it('returns successful cancellation without even attempting a write or changing records', () => {
    savePosts([post]);
    const writes = failWrites();
    expect(deletePost({ postId: post.id, confirmed: false }, session))
      .toEqual({ ok: true, value: { deleted: false, reason: 'cancelled' } });
    expect(writes).not.toHaveBeenCalled();
    expect(persisted()).toEqual([post]);
  });

  it.each(['update', 'delete'])('rejects other-author %s and missing targets without mutation', (operation) => {
    savePosts([post, companion]);
    expect(mutate(operation, other).error.code).toBe('forbidden');
    const result = operation === 'update' ? updatePost({ postId: 'missing', ...input }, session)
      : deletePost({ postId: 'missing', confirmed: true }, session);
    expect(result.error.code).toBe('notFound');
    expect(persisted()).toEqual([post, companion]);
  });

  it.each([null, {}, { ...input }, { postId: '', ...input }, { postId: post.id, title: ' ', content: 'body' },
    { postId: post.id, title: 'title', content: '' }, { postId: post.id, title: [], content: 'body' },
    { postId: post.id, title: 'title', content: false }])('rejects invalid edit %j without writing', (value) => {
      savePosts([post]);
      expect(updatePost(value, session).error.code).toBe('invalid');
      expect(persisted()).toEqual([post]);
    });

  it.each(['postId', 'title', 'content'])('rejects independently omitted %s with valid remaining fields and unchanged bytes', (field) => {
    savePosts([post, companion]);
    const before = localStorage.getItem('writespace_posts');
    const value = { postId: post.id, ...input };
    delete value[field];
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(updatePost(value, session)).toEqual({
      ok: false, error: { code: 'invalid', message: 'Post ID, title and content are required.' },
    });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem('writespace_posts')).toBe(before);
  });

  it.each([null, {}, { confirmed: true }, { postId: ' ', confirmed: true }, { postId: post.id },
    { postId: post.id, confirmed: 'true' }, { postId: post.id, confirmed: 1 }, { postId: [], confirmed: false }])
    ('rejects invalid delete %j without writing', (value) => {
      savePosts([post]);
      expect(deletePost(value, session).error.code).toBe('invalid');
      expect(persisted()).toEqual([post]);
    });
});

for (const operation of ['create', 'update', 'delete']) {
  describe(`${operation} shared failure boundaries`, () => {
    it.each([null, undefined, {}, [], { ...session, role: 'owner' }, { ...session, userId: ' ' },
      { ...session, displayName: '' }, { ...session, username: '' }, { ...session, extra: true }].map((value) => [value]))
      ('rejects malformed session %j and preserves existing records', (actor) => {
        savePosts([post]);
        // Explicit undefined must be passed to the operation rather than the helper default.
        const result = operation === 'create' ? createPost(input, actor)
          : operation === 'update' ? updatePost({ postId: post.id, ...input }, actor)
            : deletePost({ postId: post.id, confirmed: true }, actor);
        expect(result.error.code).toBe('invalid');
        expect(persisted()).toEqual([post]);
      });

    it.each([null, {}, 'posts', [null], [{ ...post, content: '' }], [{ ...post, extra: true }]].map((value) => [value]))
      ('rejects invalid caller list %j without overwriting supported persisted data', (value) => {
        savePosts([post]);
        expect(mutate(operation, session, value).error.code).toBe('shape');
        expect(persisted()).toEqual([post]);
      });

    it.each(['{', 'null', '{}', '[null]', '[{}]'])('never overwrites corrupt persisted %s even with a valid snapshot', (raw) => {
      localStorage.setItem('writespace_posts', raw);
      const result = mutate(operation, session, [post]);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(raw === '{' ? 'parse' : 'shape');
      expect(localStorage.getItem('writespace_posts')).toBe(raw);
    });

    it.each(['property', 'getItem'])('catches %s access failure without claiming a successful mutation', (boundary) => {
      savePosts([post]);
      const store = window.localStorage;
      const originalGet = store.getItem.bind(store);
      if (boundary === 'property') {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('private'); } });
      } else {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private'); });
      }
      expect(mutate(operation).error.code).toBe('unavailable');
      expect(originalGet('writespace_posts')).toBe(JSON.stringify([post]));
    });

    it('catches serialization failure without changing persisted records or leaking exception data', () => {
      savePosts([post]);
      vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('private content'); });
      const result = mutate(operation);
      expect(result).toMatchObject({ ok: false, error: { code: 'write' } });
      expect(result.error.message).not.toContain('private content');
      expect(persisted()).toEqual([post]);
      expect(getPosts()).toEqual([post]);
    });

    it.each(['Error', 'QuotaExceededError'])('reports %s failure without changing persisted state or leaking content', (name) => {
      savePosts([post]);
      failWrites(name);
      const result = mutate(operation);
      expect(result).toMatchObject({ ok: false, error: { code: name === 'Error' ? 'write' : 'quota' } });
      expect(result.error.message).not.toMatch(/private|Plain text|Original/);
      expect(persisted()).toEqual([post]);
      expect(getPosts()).toEqual([post]);
    });
  });
}

describe('post collection and reader components', () => {
  it('renders all posts sorted stably, complete card presentation, four repeating accents and a responsive grid', async () => {
    const records = [
      { ...post, id: 'invalid-a', createdAt: 'legacy' }, { ...post, id: 'old', createdAt: '2024-01-01T00:00:00Z' },
      { ...post, id: 'equal-a' }, { ...post, id: 'new', createdAt: '2027-01-01T00:00:00Z' },
      { ...post, id: 'equal-b' }, { ...post, id: 'invalid-b', createdAt: 'bad' },
    ].map((record) => ({ ...record, title: record.id, content: 'x'.repeat(121) }));
    savePosts(records);
    const { container } = mount();
    expect(screen.getByRole('heading', { name: 'Welcome, Local Writer.' })).toBeInTheDocument();
    expect(screen.getByTestId('all-posts')).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent))
      .toEqual(['new', 'equal-a', 'equal-b', 'old', 'invalid-a', 'invalid-b']);
    const accents = ['border-t-primary', 'border-t-secondary', 'border-t-warning', 'border-t-success'];
    cards.forEach((card, index) => {
      expect(card).toHaveClass(accents[index % 4]);
      expect(card.querySelector('p.whitespace-pre-wrap').textContent).toBe('x'.repeat(120));
      expect(within(card).getByText('Local Writer')).toBeInTheDocument();
      expect(card.querySelector('[aria-hidden="true"]')).toHaveTextContent('LW');
    });
    expect(container.querySelectorAll('time[datetime]')).toHaveLength(4);
    expect(persisted()).toEqual(records);
    await userEvent.click(screen.getByRole('link', { name: 'new', exact: true }));
    expect(route()).toBe('/blog/new');
    expect(screen.getByTestId('post-content').textContent).toBe('x'.repeat(121));
  });

  it('shows a non-mutating empty state whose Write action opens the real form', async () => {
    mount();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByText('No local posts to read yet.')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBeNull();
    const collection = screen.getByRole('region', { name: 'Reader home' });
    await userEvent.click(within(collection).getByRole('link', { name: 'Write', exact: true }));
    expect(route()).toBe('/write');
    expect(screen.getByRole('heading', { name: 'Write a post' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBeNull();
  });

  it.each(['{', '{}', '[null]'])('handles corrupt collection %s without destructive repair', (raw) => {
    localStorage.setItem('writespace_posts', raw);
    mount();
    expect(within(screen.getByRole('region', { name: 'Reader home' })).getByRole('status'))
      .toHaveTextContent(/not been changed/);
    expect(screen.getByText('No local posts to read yet.')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(readPosts().ok).toBe(false);
  });

  it('handles a failed post read as an empty collection while preserving session navigation', () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === 'writespace_posts') throw new Error('blocked');
      return original.call(this, key);
    });
    mount();
    expect(within(screen.getByRole('region', { name: 'Reader home' })).getByRole('status'))
      .toHaveTextContent('Browser-local data is unavailable');
    expect(screen.getByRole('heading', { name: 'Reader home' })).toBeInTheDocument();
  });

  it('renders full large XSS content, title and author as escaped text with exact whitespace and legacy date handling', () => {
    const record = { ...post, title: '<script>alert(1)</script>', authorName: '<svg onload=alert(2)>',
      createdAt: 'legacy', content: '<img src=x onerror=alert(1)>\n\n  <b>literal</b>  '.repeat(5000) };
    savePosts([record]);
    const { container } = mount(`/blog/${post.id}`);
    expect(screen.getByRole('heading', { name: record.title })).toBeInTheDocument();
    expect(screen.getByTestId('post-content').textContent).toBe(record.content);
    expect(screen.getByTestId('post-content')).toHaveClass('whitespace-pre-wrap', 'break-words');
    expect(screen.getByText(record.authorName)).toBeInTheDocument();
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(container.querySelector('time')).not.toHaveAttribute('datetime');
    expect(container.querySelectorAll('script, svg, img, b')).toHaveLength(0);
    expect(persisted()).toEqual([record]);
  });

  it.each(['/blog/missing', '/edit/missing'])('shows exact missing state and an activated back link at %s', async (path) => {
    savePosts([post]);
    mount(path);
    expect(screen.getByRole('heading', { name: 'Post not found', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Back to blogs' }));
    expect(route()).toBe('/blogs');
    expect(persisted()).toEqual([post]);
  });

  describe.each([`/blog/${post.id}`, `/edit/${post.id}`])('failed initial lookup at %s', (path) => {
    it.each([
      ['{private body', 'Browser-local data could not be read. It has not been changed.'],
      ['{"private":"body"}', 'Browser-local data has an unsupported format. It has not been changed.'],
    ])('discloses corrupt data %s without mutation or confirmation and activates the back link', async (raw, message) => {
      localStorage.setItem('writespace_posts', raw);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mount(path);
      const writes = vi.spyOn(Storage.prototype, 'setItem');
      expect(screen.getByRole('heading', { name: 'Local data unavailable', exact: true })).toBeInTheDocument();
      expect(screen.getByRole('alert').textContent).toBe(message);
      expect(screen.queryByRole('heading', { name: 'Post not found', exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain('private');
      expect(route()).toBe(path);
      expect(localStorage.getItem('writespace_posts')).toBe(raw);
      await userEvent.click(screen.getByRole('link', { name: 'Back to blogs' }));
      expect(route()).toBe('/blogs');
      expect(localStorage.getItem('writespace_posts')).toBe(raw);
      expect(writes).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('discloses denied getItem without leaking the exception, writing, or confirming and activates the back link', async () => {
      savePosts([post, companion]);
      const original = Storage.prototype.getItem;
      const before = original.call(localStorage, 'writespace_posts');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
        if (key === 'writespace_posts') throw new DOMException('private body must not leak', 'SecurityError');
        return original.call(this, key);
      });
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mount(path);
      const writes = vi.spyOn(Storage.prototype, 'setItem');
      expect(screen.getByRole('heading', { name: 'Local data unavailable', exact: true })).toBeInTheDocument();
      expect(screen.getByRole('alert').textContent)
        .toBe('Browser-local data is unavailable. Check your browser storage settings.');
      expect(screen.queryByRole('heading', { name: 'Post not found', exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain('private body');
      expect(route()).toBe(path);
      expect(original.call(localStorage, 'writespace_posts')).toBe(before);
      await userEvent.click(screen.getByRole('link', { name: 'Back to blogs' }));
      expect(route()).toBe('/blogs');
      expect(original.call(localStorage, 'writespace_posts')).toBe(before);
      expect(writes).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });
  });

  it('allows reading another author but hides management controls and redirects a direct forbidden edit', () => {
    savePosts([post]);
    mount(`/blog/${post.id}`, other);
    expect(screen.getByTestId('post-content').textContent).toBe(post.content);
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    cleanup();
    mount(`/edit/${post.id}`, other);
    expect(route()).toBe('/blogs');
    expect(persisted()).toEqual([post]);
  });

  it.each(['/blogs', '/blog/post-id', '/write', '/edit/post-id'])('guards actual guest direct entry %s', (path) => {
    mount(path, null);
    expect(route()).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBeNull();
  });
});

describe('activated writing and deleting journeys', () => {
  it.each([session, BUILTIN_ADMIN])('creates through the $role Write link, opens the reader, edits and restores persisted metadata on remount', async (actor) => {
    mount('/blogs', actor);
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Write' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    fillPost();
    expect(localStorage.getItem('writespace_posts')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save post' }));
    const created = persisted()[0];
    expect(created).toMatchObject({ ...input, authorId: actor.userId, authorName: actor.displayName });
    expect(route()).toBe(`/blog/${created.id}`);
    expect(screen.getByTestId('post-content').textContent).toBe(input.content);
    await userEvent.click(screen.getByRole('link', { name: 'Edit', exact: true }));
    expect(screen.getByLabelText('Title', { exact: false })).toHaveValue(input.title);
    expect(screen.getByLabelText('Content', { exact: true })).toHaveValue(input.content);
    fillPost({ title: '  Revised  ', content: '  Revised\nbody  ' });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(persisted()).toEqual([{ ...created, title: '  Revised  ', content: '  Revised\nbody  ' }]);
    cleanup();
    mount(`/blog/${created.id}`, actor);
    expect(screen.getByTestId('post-content').textContent).toBe('  Revised\nbody  ');
    expect(screen.getByRole('heading', { name: 'Revised' })).toBeInTheDocument();
  });

  it('lets an administrator edit and delete another author without changing authorship', async () => {
    savePosts([post, companion]);
    mount(`/blog/${post.id}`, BUILTIN_ADMIN);
    await userEvent.click(screen.getByRole('link', { name: 'Edit', exact: true }));
    fillPost();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(persisted()).toEqual([{ ...post, ...input }, companion]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(route()).toBe('/blogs');
    expect(persisted()).toEqual([companion]);
  });

  it.each(['/write', `/edit/${post.id}`])('validates each required field at %s and keeps persisted records untouched', async (path) => {
    savePosts([post]);
    mount(path);
    fillPost({ title: ' \n ', content: '  ' });
    const name = path === '/write' ? 'Save post' : 'Save changes';
    await userEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByLabelText('Title', { exact: false })).toHaveAccessibleDescription('Title is required.');
    expect(screen.getByLabelText('Content', { exact: true })).toHaveAccessibleDescription('Content is required.');
    fillPost({ title: 'Valid', content: '' });
    await userEvent.click(screen.getByRole('button', { name }));
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Content', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    fillPost({ title: '', content: 'Valid' });
    await userEvent.click(screen.getByRole('button', { name }));
    expect(screen.queryByText('Content is required.')).not.toBeInTheDocument();
    expect(route()).toBe(path);
    expect(persisted()).toEqual([post]);
  });

  it.each(['/write', `/edit/${post.id}`])('cancel at %s navigates without saving entered changes', async (path) => {
    savePosts([post]);
    mount(path);
    fillPost();
    await userEvent.click(screen.getByRole('link', { name: 'Cancel', exact: true }));
    expect(route()).toBe(path === '/write' ? '/blogs' : `/blog/${post.id}`);
    expect(persisted()).toEqual([post]);
  });

  it.each(['/write', `/edit/${post.id}`])('keeps values and route unsaved on quota failure at %s, then permits activated retry', async (path) => {
    savePosts([post]);
    mount(path);
    fillPost();
    const writes = failWrites('QuotaExceededError');
    const name = path === '/write' ? 'Save post' : 'Save changes';
    await userEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(screen.getByLabelText('Title', { exact: false })).toHaveValue(input.title);
    expect(screen.getByLabelText('Content', { exact: true })).toHaveValue(input.content);
    expect(route()).toBe(path);
    expect(persisted()).toEqual([post]);
    writes.mockRestore();
    await userEvent.click(screen.getByRole('button', { name }));
    expect(route()).toMatch(/^\/blog\//);
    expect(getPosts()).toHaveLength(path === '/write' ? 2 : 1);
    expect(persisted().find((record) => record.title === input.title).content).toBe(input.content);
  });

  it('keeps the create form unsaved after UUID failure and refuses overwriting corrupt records', async () => {
    mount('/write');
    fillPost();
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unsupported'); });
    await userEvent.click(screen.getByRole('button', { name: 'Save post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
    expect(route()).toBe('/write');
    expect(localStorage.getItem('writespace_posts')).toBeNull();
    uuid.mockRestore();
    localStorage.setItem('writespace_posts', '{');
    await userEvent.click(screen.getByRole('button', { name: 'Save post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not been changed');
    expect(localStorage.getItem('writespace_posts')).toBe('{');
  });

  it.each([null, { ...session, role: 'owner' }])('rechecks the live session on create activation and refuses invalid %j', async (actor) => {
    mount('/write');
    fillPost();
    localStorage.setItem('writespace_session', JSON.stringify(actor));
    await userEvent.click(screen.getByRole('button', { name: 'Save post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid local session');
    expect(route()).toBe('/write');
    expect(localStorage.getItem('writespace_posts')).toBeNull();
  });

  it('rechecks live ownership on edit submit and redirects without saving', async () => {
    savePosts([post]);
    mount(`/edit/${post.id}`);
    fillPost();
    setSession(other);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(route()).toBe('/blogs');
    expect(persisted()).toEqual([post]);
  });

  it('handles a target removed after edit prefill without saving a replacement', async () => {
    savePosts([post]);
    mount(`/edit/${post.id}`);
    fillPost();
    savePosts([]);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('heading', { name: 'Post not found' })).toBeInTheDocument();
    expect(route()).toBe(`/edit/${post.id}`);
    expect(persisted()).toEqual([]);
  });

  it('never confirms or writes on reader render; cancelled delete stays put, then confirmed delete returns to blogs', async () => {
    savePosts([post, companion]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount(`/blog/${post.id}`);
    expect(confirm).not.toHaveBeenCalled();
    const writes = failWrites();
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(writes).not.toHaveBeenCalled();
    expect(route()).toBe(`/blog/${post.id}`);
    expect(persisted()).toEqual([post, companion]);
    writes.mockRestore();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(route()).toBe('/blogs');
    expect(persisted()).toEqual([companion]);
  });

  it.each([
    ['{private body', 'Browser-local data could not be read. It has not been changed.'],
    ['{"private":"body"}', 'Browser-local data has an unsupported format. It has not been changed.'],
  ])('refuses deletion after corruption %s without confirming or changing corrupt bytes', async (raw, message) => {
    savePosts([post]);
    mount(`/blog/${post.id}`);
    expect(screen.getByTestId('post-content').textContent).toBe(post.content);
    localStorage.setItem('writespace_posts', raw);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(screen.getByRole('heading', { name: 'Local data unavailable', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(screen.queryByRole('heading', { name: 'Post not found', exact: true })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private');
    expect(route()).toBe(`/blog/${post.id}`);
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    await userEvent.click(screen.getByRole('link', { name: 'Back to blogs' }));
    expect(route()).toBe('/blogs');
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(writes).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['persistent', 'one-shot'])('refuses deletion on %s post-read denial before confirmation or mutation', async (boundary) => {
    savePosts([post, companion]);
    mount(`/blog/${post.id}`);
    expect(screen.getByTestId('post-content').textContent).toBe(post.content);
    const original = Storage.prototype.getItem;
    const before = original.call(localStorage, 'writespace_posts');
    let denied = false;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === 'writespace_posts' && (boundary === 'persistent' || !denied)) {
        denied = true;
        throw new DOMException('private body must not leak', 'SecurityError');
      }
      return original.call(this, key);
    });
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(screen.getByRole('alert').textContent)
      .toBe('Browser-local data is unavailable. Check your browser storage settings.');
    expect(screen.queryByRole('heading', { name: 'Post not found', exact: true })).not.toBeInTheDocument();
    if (boundary === 'persistent') {
      expect(screen.getByRole('heading', { name: 'Local data unavailable', exact: true })).toBeInTheDocument();
    } else {
      expect(screen.getByTestId('post-content').textContent).toBe(post.content);
    }
    expect(document.body.textContent).not.toContain('private body');
    expect(route()).toBe(`/blog/${post.id}`);
    expect(original.call(localStorage, 'writespace_posts')).toBe(before);
    await userEvent.click(screen.getByRole('link', { name: 'Back to blogs' }));
    expect(route()).toBe('/blogs');
    expect(original.call(localStorage, 'writespace_posts')).toBe(before);
    expect(writes).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps the reader and post intact after confirmed delete storage failure', async () => {
    savePosts([post]);
    mount(`/blog/${post.id}`);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    failWrites();
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(screen.getByTestId('post-content').textContent).toBe(post.content);
    expect(route()).toBe(`/blog/${post.id}`);
    expect(persisted()).toEqual([post]);
  });

  it.each(['other-session', 'invalid-session', 'missing-post'])('rechecks %s on deletion before confirmation and makes no write', async (boundary) => {
    savePosts([post]);
    mount(`/blog/${post.id}`);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    if (boundary === 'other-session') setSession(other);
    if (boundary === 'invalid-session') localStorage.setItem('writespace_session', '{');
    if (boundary === 'missing-post') savePosts([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(route()).toBe(`/blog/${post.id}`);
    expect(persisted()).toEqual(boundary === 'missing-post' ? [] : [post]);
    if (boundary === 'missing-post') expect(screen.getByRole('heading', { name: 'Post not found' })).toBeInTheDocument();
    else expect(screen.getByRole('alert')).toHaveTextContent('cannot be deleted');
  });

  it('rechecks posts changed during confirmation and refuses deletion of a newly unauthorized target', async () => {
    savePosts([post]);
    mount(`/blog/${post.id}`);
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      savePosts([{ ...post, authorId: other.userId }]);
      return true;
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(route()).toBe(`/blog/${post.id}`);
    expect(persisted()).toEqual([{ ...post, authorId: other.userId }]);
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be deleted');
  });
});
