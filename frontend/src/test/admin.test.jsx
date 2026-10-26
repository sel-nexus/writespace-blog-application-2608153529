/** Administration contracts: real local persistence, full Results and activated routed controls. */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import { StatCard } from '../components/StatCard';
import { UserRow } from '../components/UserRow';
import { BUILTIN_ADMIN, getSession, setSession } from '../utils/auth';
import { createUser, deleteUser, getUsers, saveUsers, savePosts, getPosts } from '../utils/storage';

const account = {
  id: 'reader-id', displayName: 'Demo Reader', username: 'reader', password: 'synthetic-secret',
  role: 'user', createdAt: '2026-01-01T12:00:00.000Z',
};
const localAdmin = { ...account, id: 'local-admin', displayName: 'Local Admin', username: 'local-admin', role: 'admin' };
const readerSession = { userId: account.id, displayName: account.displayName, username: account.username, role: 'user' };
const adminSession = { userId: localAdmin.id, displayName: localAdmin.displayName, username: localAdmin.username, role: 'admin' };
const input = { displayName: 'New Reader', username: 'new-reader', password: 'synthetic-new-secret', role: 'user' };
const deletion = { targetUserId: account.id, confirmed: true, isBuiltIn: false };
const storedUsers = () => JSON.parse(localStorage.getItem('writespace_users'));
const route = () => screen.getByLabelText('Current route').textContent;

/** Build complete synthetic posts with predictable timestamps, including another author's post. */
function post(index, overrides = {}) {
  return {
    id: `post-${index}`, title: `Story ${index}`, content: `Body ${index}`,
    createdAt: `2026-01-0${index + 1}T12:00:00.000Z`, authorId: account.id, authorName: account.displayName,
    ...overrides,
  };
}

/** Expose navigation as observable output. */
function Location() {
  return (
    <output aria-label="Current route">{useLocation().pathname}</output>
  );
}

/** Mount production routing with a real persisted identity. */
function mount(path = '/admin', session = BUILTIN_ADMIN) {
  if (session) setSession(session);
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}

/** Preserve real reads for post-write state checks while failing a selected write key. */
function failWrites(key = 'writespace_users', name = 'Error') {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(target, value) {
    if (target === key) throw new DOMException('synthetic-secret', name);
    return original.call(this, target, value);
  });
}

/** Fill actual controlled fields, avoiding per-character cost for large values. */
function fillAccount(values = input) {
  for (const [key, label] of [['displayName', 'Display name'], ['username', 'Username'], ['password', 'Password']]) {
    fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value: values[key] } });
  }
  fireEvent.change(screen.getByLabelText('Role', { exact: true }), { target: { value: values.role } });
}

/** Verify exact discriminated failure shape, including safe message, rather than a truthy flag. */
function expectFailure(result, code) {
  expect(result).toEqual({ ok: false, error: { code, message: expect.any(String) } });
  expect(result.error.message).not.toMatch(/synthetic-secret|synthetic-new-secret/);
}

const desktop = () => screen.getByTestId('users-desktop');
const mobile = () => screen.getByTestId('users-mobile');

describe('deleteUser Result and persistence boundaries', () => {
  it.each(['user', 'admin'])('deletes an eligible %s preserving the exact remaining array and unrelated keys', (role) => {
    const target = { ...account, role };
    const records = [target, localAdmin];
    saveUsers(records);
    localStorage.setItem('unrelated', 'keep');
    const snapshot = Object.freeze(records.map((user) => Object.freeze({ ...user })));
    expect(deleteUser(deletion, BUILTIN_ADMIN, snapshot)).toEqual({ ok: true, value: { deleted: true, userId: account.id } });
    expect(storedUsers()).toEqual([localAdmin]);
    expect(getUsers()).toEqual([localAdmin]);
    expect(snapshot).toEqual(records);
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(localStorage.getItem('writespace_session')).toBeNull();
  });

  it('deletes the final stored user with a local administrator actor and saves an exact empty array', () => {
    saveUsers([account]);
    expect(deleteUser(deletion, adminSession)).toEqual({ ok: true, value: { deleted: true, userId: account.id } });
    expect(localStorage.getItem('writespace_users')).toBe('[]');
  });

  it('cancels without a write even when writes would fail', () => {
    saveUsers([account]);
    const writes = failWrites();
    expect(deleteUser({ ...deletion, confirmed: false }, BUILTIN_ADMIN))
      .toEqual({ ok: true, value: { deleted: false, reason: 'cancelled' } });
    expect(storedUsers()).toEqual([account]);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each([undefined, null, {}, [], { ...deletion, targetUserId: '' }, { ...deletion, targetUserId: ' \n ' },
    { ...deletion, targetUserId: 1 }, { ...deletion, confirmed: 'true' }, { ...deletion, confirmed: undefined },
    { ...deletion, isBuiltIn: undefined }, { ...deletion, isBuiltIn: 'false' }].map((value) => [value]))
    ('rejects invalid delete input %j and retains state', (value) => {
      saveUsers([account]);
      expectFailure(deleteUser(value, BUILTIN_ADMIN), 'invalid');
      expect(storedUsers()).toEqual([account]);
    });

  it.each([undefined, null, {}, [], { role: 'admin' }, { ...BUILTIN_ADMIN, role: 'owner' },
    { ...BUILTIN_ADMIN, userId: '' }, { ...BUILTIN_ADMIN, username: ' ' }, { ...BUILTIN_ADMIN, displayName: 1 },
    { ...BUILTIN_ADMIN, extra: true }].map((value) => [value]))('rejects malformed actor %j without mutation', (actor) => {
      saveUsers([account]);
      expectFailure(deleteUser(deletion, actor), 'invalid');
      expect(storedUsers()).toEqual([account]);
    });

  it.each([true, false])('denies a user actor even with confirmation %s', (confirmed) => {
    saveUsers([account]);
    expectFailure(deleteUser({ ...deletion, confirmed }, readerSession), 'forbidden');
    expect(storedUsers()).toEqual([account]);
  });

  it.each([
    { ...deletion, targetUserId: BUILTIN_ADMIN.userId, isBuiltIn: false },
    { ...deletion, targetUserId: BUILTIN_ADMIN.userId, isBuiltIn: true },
    { ...deletion, isBuiltIn: true },
    { ...deletion, targetUserId: localAdmin.id },
  ])('protects source ID, source flag or active self for %j before any write', (value) => {
    saveUsers([account, localAdmin]);
    expectFailure(deleteUser(value, adminSession), 'protected');
    expect(storedUsers()).toEqual([account, localAdmin]);
  });

  it.each([true, false])('returns notFound for missing target with confirmation %s, without creating storage', (confirmed) => {
    expectFailure(deleteUser({ ...deletion, confirmed }, BUILTIN_ADMIN), 'notFound');
    expect(localStorage.getItem('writespace_users')).toBeNull();
  });

  it('reads current persisted records rather than deleting from a stale snapshot, including large arrays', () => {
    const records = Array.from({ length: 2000 }, (_, index) => ({ ...account, id: `user-${index}`, username: `user-${index}` }));
    const stale = [account];
    saveUsers([account, ...records]);
    expect(deleteUser(deletion, BUILTIN_ADMIN, stale)).toEqual({ ok: true, value: { deleted: true, userId: account.id } });
    expect(storedUsers()).toEqual(records);
    expect(stale).toEqual([account]);
    expectFailure(deleteUser(deletion, BUILTIN_ADMIN, stale), 'notFound');
    expect(storedUsers()).toEqual(records);
  });

  it.each([null, {}, 'users', [null], [{ ...account, extra: true }]].map((value) => [value]))
    ('rejects invalid snapshot %j preserving the authoritative array', (value) => {
      saveUsers([account]);
      expectFailure(deleteUser(deletion, BUILTIN_ADMIN, value), 'shape');
      expect(storedUsers()).toEqual([account]);
    });

  it.each(['{', 'null', '{}', '[null]', '[{}]'])('preserves corrupt persisted bytes %s even with a valid snapshot', (raw) => {
    localStorage.setItem('writespace_users', raw);
    expectFailure(deleteUser(deletion, BUILTIN_ADMIN, [account]), raw === '{' ? 'parse' : 'shape');
    expect(localStorage.getItem('writespace_users')).toBe(raw);
  });

  it.each(['property', 'getItem'])('preserves bytes when %s reads are blocked', (boundary) => {
    saveUsers([account]);
    const read = localStorage.getItem.bind(localStorage);
    if (boundary === 'property') {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('synthetic-secret'); } });
    } else {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('synthetic-secret'); });
    }
    expectFailure(deleteUser(deletion, BUILTIN_ADMIN), 'unavailable');
    expect(read('writespace_users')).toBe(JSON.stringify([account]));
  });

  it.each(['Error', 'QuotaExceededError'])('reports %s write failure with no stored change', (name) => {
    saveUsers([account, localAdmin]);
    failWrites('writespace_users', name);
    expectFailure(deleteUser(deletion, BUILTIN_ADMIN), name === 'Error' ? 'write' : 'quota');
    expect(storedUsers()).toEqual([account, localAdmin]);
  });

  it('preserves existing records after serialization failure', () => {
    saveUsers([account]);
    vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('synthetic-secret'); });
    expectFailure(deleteUser(deletion, BUILTIN_ADMIN), 'write');
    expect(storedUsers()).toEqual([account]);
  });
});

describe('admin createUser full shapes and failures', () => {
  it.each(['user', 'admin'])('generates exact supported fields for %s with UUID time and large escaped input', (role) => {
    const values = { ...input, role, displayName: '<script>literal</script>'.repeat(1000), username: 'x'.repeat(1000) };
    saveUsers([account]);
    const before = Date.now();
    const result = createUser(values);
    expect(result).toEqual({ ok: true, value: { ...values, id: expect.any(String), createdAt: expect.any(String) } });
    expect(result.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(result.value.createdAt).toISOString()).toBe(result.value.createdAt);
    expect(Date.parse(result.value.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.value.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(storedUsers()).toEqual([account, result.value]);
    expect(result.value).not.toHaveProperty('isBuiltIn');
  });

  it.each(['displayName', 'username', 'password', 'role'])('rejects missing create field %s without changing state', (key) => {
    saveUsers([account]);
    const value = { ...input };
    delete value[key];
    expectFailure(createUser(value), 'invalid');
    expect(storedUsers()).toEqual([account]);
  });

  it.each([null, {}, { ...input, role: 'owner' }, { ...input, password: ' ' }, { ...input, username: [] },
    { ...input, displayName: 1 }])('rejects invalid create %j without mutation', (value) => {
    saveUsers([account]);
    expectFailure(createUser(value), 'invalid');
    expect(storedUsers()).toEqual([account]);
  });

  it.each([['READER', 'duplicate'], ['ADMIN', 'protected']])('rejects %s conflict with complete failure shape', (username, code) => {
    saveUsers([account]);
    expectFailure(createUser({ ...input, username }), code);
    expect(storedUsers()).toEqual([account]);
  });

  it.each(['', null, 1])('rejects unusable generated UUID %j and preserves storage', (id) => {
    saveUsers([account]);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    expectFailure(createUser(input), 'shape');
    expect(storedUsers()).toEqual([account]);
  });

  it.each(['uuid', 'timestamp'])('reports %s generation exceptions without storage change', (boundary) => {
    saveUsers([account]);
    if (boundary === 'uuid') vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('synthetic-secret'); });
    else vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => { throw new Error('synthetic-secret'); });
    expectFailure(createUser(input), 'unavailable');
    expect(storedUsers()).toEqual([account]);
  });

  it.each(['{', '{}', '[null]'])('does not overwrite unreadable users %s during creation', (raw) => {
    localStorage.setItem('writespace_users', raw);
    expectFailure(createUser(input), raw === '{' ? 'parse' : 'shape');
    expect(localStorage.getItem('writespace_users')).toBe(raw);
  });
});

describe('blocked reads and escaped account presentation', () => {
  it.each(['/admin', '/users'])('discloses denied collection reads at %s while preserving the live session', (path) => {
    saveUsers([account]);
    savePosts([post(0)]);
    const original = Storage.prototype.getItem;
    const read = localStorage.getItem.bind(localStorage);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key !== 'writespace_session') throw new Error('synthetic-secret');
      return original.call(this, key);
    });
    mount(path);
    const statuses = within(screen.getByRole('main')).getAllByRole('status');
    expect(statuses).toHaveLength(path === '/admin' ? 2 : 1);
    statuses.forEach((status) => expect(status).toHaveTextContent('Browser-local data is unavailable'));
    expect(getSession()).toEqual(BUILTIN_ADMIN);
    expect(read('writespace_users')).toBe(JSON.stringify([account]));
    expect(read('writespace_posts')).toBe(JSON.stringify([post(0)]));
    expect(route()).toBe(path);
    if (path === '/users') {
      expect(within(desktop()).getAllByRole('row')).toHaveLength(2);
      expect(within(mobile()).getAllByRole('article')).toHaveLength(1);
    }
  });

  it('escapes large display names and usernames in both account layouts without rendering secrets', async () => {
    mount('/users');
    const values = { ...input, displayName: '<script>literal</script>'.repeat(100), username: '<svg>literal</svg>' };
    fillAccount(values);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const created = storedUsers()[0];
    expect(created).toEqual({ ...values, id: expect.any(String), createdAt: expect.any(String) });
    for (const layout of [desktop(), mobile()]) {
      expect(within(layout).getByText(values.displayName)).toBeInTheDocument();
      expect(within(layout).getByText(values.username)).toBeInTheDocument();
      expect(layout.querySelectorAll('script, svg')).toHaveLength(0);
      expect(layout.textContent).not.toContain(values.password);
    }
  });
});

describe('metric and row component props', () => {
  it('renders zero and nonzero defined counts and a truly blank reserved position ignoring supplied data', () => {
    render(
      <div>
        <StatCard label="Total Posts" value={0} />
        <StatCard label="Total Users" value={3} />
        <StatCard reserved label="Ignored" value={99} />
        <StatCard reserved />
      </div>,
    );
    const cards = screen.getAllByTestId('stat-card');
    expect(cards[0]).toHaveTextContent('Total Posts0');
    expect(cards[1]).toHaveTextContent('Total Users3');
    for (const card of cards.slice(2)) {
      expect(card.textContent).toBe('');
      expect(card.children).toHaveLength(0);
      expect(card).toHaveAttribute('aria-hidden', 'true');
      expect(card).not.toHaveAttribute('aria-label');
    }
  });

  it.each([false, true])('renders only identity/date/role and activates the same handler for mobile=%s', async (isMobile) => {
    const onDelete = vi.fn();
    const element = (
      <UserRow user={account} activeUserId={BUILTIN_ADMIN.userId} mobile={isMobile} onDelete={onDelete} />
    );
    const { container } = render(isMobile ? element : (
      <table>
        <tbody>{element}</tbody>
      </table>
    ));
    expect(screen.getByText(account.displayName)).toBeInTheDocument();
    expect(screen.getByText(account.username)).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2026')).toBeInTheDocument();
    expect(container.textContent).not.toContain(account.password);
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: `Delete ${account.displayName}` }));
    expect(onDelete).toHaveBeenCalledWith(account, false);
  });

  it.each([false, true])('disables built-in and active rows without inventing a tooltip for mobile=%s', async (isMobile) => {
    const onDelete = vi.fn();
    const elements = (
      <>
        <UserRow user={{ ...account, id: BUILTIN_ADMIN.userId }} activeUserId={localAdmin.id} mobile={isMobile} onDelete={onDelete} />
        <UserRow user={localAdmin} activeUserId={localAdmin.id} mobile={isMobile} onDelete={onDelete} />
        <UserRow user={account} activeUserId={localAdmin.id} mobile={isMobile} isBuiltIn onDelete={onDelete} />
      </>
    );
    render(isMobile ? elements : (
      <table>
        <tbody>{elements}</tbody>
      </table>
    ));
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      expect(button).not.toHaveAttribute('title');
      await userEvent.click(button);
    }
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Source-defined account')).toBeInTheDocument();
  });

  it('renders legacy invalid creation dates safely', () => {
    render(
      <UserRow user={{ ...account, createdAt: 'legacy' }} activeUserId="other" mobile onDelete={vi.fn()} />,
    );
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
  });
});

describe('real dashboard and routed controls', () => {
  it('renders defined counts, four positions, stable newest five with metadata, without changing storage', () => {
    const records = [post(0, { createdAt: 'legacy' }), ...Array.from({ length: 7 }, (_, i) => post(i + 1))];
    savePosts(records);
    saveUsers([account, localAdmin]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    const metrics = screen.getByTestId('admin-metrics');
    const cards = within(metrics).getAllByTestId('stat-card');
    expect(cards.map((card) => card.textContent)).toEqual(['Total Posts8', 'Total Users3', 'Admins2', '']);
    expect(cards[3].children).toHaveLength(0);
    expect(cards[3]).not.toHaveAttribute('aria-label');
    expect(metrics).not.toHaveTextContent(/unresolved|clarification/);
    expect(screen.getByText(/fourth metric is unresolved/)).toBeInTheDocument();
    expect(screen.getByText(/counts include the source-defined/)).toBeInTheDocument();
    const articles = screen.getAllByRole('article');
    expect(articles.map((article) => within(article).getByRole('heading').textContent))
      .toEqual(['Story 7', 'Story 6', 'Story 5', 'Story 4', 'Story 3']);
    articles.forEach((article) => {
      expect(within(article).getByText(account.displayName)).toBeInTheDocument();
      expect(article.querySelector('time')).toHaveAttribute('datetime');
      expect(within(article).getByRole('link', { name: /^Edit/ })).toBeInTheDocument();
      expect(within(article).getByRole('button', { name: /^Delete/ })).toBeInTheDocument();
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(getPosts()).toEqual(records);
    expect(storedUsers()).toEqual([account, localAdmin]);
    expect(route()).toBe('/admin');
    expect(document.body.textContent).not.toContain(account.password);
    expect(within(screen.getByRole('navigation', { name: 'Quick actions' })).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['Write New Post', 'Manage Users']);
  });

  it.each([0, 1, 5, 6])('renders min(count,5) recent posts for %s records and counts the unstored built-in once', (count) => {
    savePosts(Array.from({ length: count }, (_, index) => post(index)));
    mount();
    expect(screen.queryAllByRole('article')).toHaveLength(Math.min(count, 5));
    expect(screen.getAllByTestId('stat-card').map((card) => card.textContent))
      .toEqual([`Total Posts${count}`, 'Total Users1', 'Admins1', '']);
    expect(localStorage.getItem('writespace_users')).toBeNull();
    if (!count) expect(screen.getByText('No local posts to review yet.')).toBeInTheDocument();
  });

  it('keeps tied/invalid post ordering stable and escapes titles/authors including large text', () => {
    const records = [post(0, { title: '<script>literal</script>', authorName: '<svg>literal</svg>', createdAt: 'legacy' }),
      post(1, { createdAt: 'legacy' }), post(2), post(3, { createdAt: post(2).createdAt, title: 'x'.repeat(1000) })];
    savePosts(records);
    const { container } = mount();
    expect(screen.getAllByRole('article').map((article) => within(article).getByRole('heading').textContent))
      .toEqual([records[2].title, records[3].title, records[0].title, records[1].title]);
    expect(screen.getAllByText('Date unavailable')).toHaveLength(2);
    expect(container.querySelectorAll('time[datetime]')).toHaveLength(2);
    expect(container.querySelectorAll('script, svg')).toHaveLength(0);
    expect(getPosts()).toEqual(records);
  });

  it.each(['posts', 'users'])('shows safe unreadable %s diagnostics without repair', (key) => {
    localStorage.setItem(`writespace_${key}`, '{');
    mount();
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(/unavailable|cannot be/);
    expect(localStorage.getItem(`writespace_${key}`)).toBe('{');
    expect(screen.getAllByTestId('stat-card')[3].textContent).toBe('');
  });

  it.each([['Write New Post', '/write', 'Write a post'], ['Manage Users', '/users', 'Manage Users']])
    ('activates %s from the exact quick actions to the real page', async (name, path, heading) => {
      mount();
      expect(route()).toBe('/admin');
      await userEvent.click(within(screen.getByRole('navigation', { name: 'Quick actions' })).getByRole('link', { name }));
      expect(route()).toBe(path);
      expect(screen.getByRole('heading', { name: heading, exact: true })).toBeInTheDocument();
      expect(localStorage.getItem('writespace_posts')).toBeNull();
      expect(localStorage.getItem('writespace_users')).toBeNull();
    });

  it('activates inline edit of another author and saves through the existing editor preserving metadata', async () => {
    const record = post(0);
    savePosts([record]);
    mount();
    await userEvent.click(screen.getByRole('link', { name: 'Edit Story 0' }));
    expect(route()).toBe('/edit/post-0');
    expect(screen.getByLabelText('Title', { exact: false })).toHaveValue(record.title);
    fireEvent.change(screen.getByLabelText('Title', { exact: false }), { target: { value: 'Moderated title' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(getPosts()).toEqual([{ ...record, title: 'Moderated title' }]);
    expect(route()).toBe('/blog/post-0');
  });

  it('cancels inline deletion in place, then confirms deletion and navigates to blogs', async () => {
    savePosts([post(0), post(1)]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount();
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Story 0' }));
    expect(route()).toBe('/admin');
    expect(getPosts()).toEqual([post(0), post(1)]);
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Story 0' }));
    expect(route()).toBe('/blogs');
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post(1)]);
  });

  it.each(['Error', 'QuotaExceededError'])('keeps inline post deletion unsaved on %s failure', async (name) => {
    savePosts([post(0)]);
    mount();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    failWrites('writespace_posts', name);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Story 0' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(route()).toBe('/admin');
    expect(getPosts()).toEqual([post(0)]);
    expect(screen.getByRole('heading', { name: 'Story 0' })).toBeInTheDocument();
  });

  it.each(['before', 'during'])('rechecks admin role %s confirmation even when the new user owns the post', async (when) => {
    savePosts([post(0)]);
    mount();
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => {
      if (when === 'during') setSession(readerSession);
      return true;
    });
    if (when === 'before') setSession(readerSession);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Story 0' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only an administrator');
    expect(getPosts()).toEqual([post(0)]);
    expect(route()).toBe('/admin');
    if (when === 'before') expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['missing', 'corrupt'])('refuses inline deletion after persisted posts become %s', async (state) => {
    savePosts([post(0)]);
    mount();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    if (state === 'missing') savePosts([]);
    else localStorage.setItem('writespace_posts', '{');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Story 0' }));
    expect(screen.getByRole('alert')).toHaveTextContent(state === 'missing' ? 'Post not found' : 'not been changed');
    expect(localStorage.getItem('writespace_posts')).toBe(state === 'missing' ? '[]' : '{');
    expect(route()).toBe('/admin');
  });
});

describe('user management actual form, responsive controls and guards', () => {
  it.each(['user', 'admin'])('creates the %s role via form and restores full persisted state without exposing passwords', async (role) => {
    saveUsers([account]);
    mount('/users');
    expect(storedUsers()).toEqual([account]);
    expect(desktop()).toHaveClass('hidden', 'sm:block');
    expect(mobile()).toHaveClass('sm:hidden');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByRole('option').map((option) => option.value)).toEqual(['user', 'admin']);
    fillAccount({ ...input, role });
    expect(storedUsers()).toEqual([account]);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const created = storedUsers()[1];
    expect(created).toEqual({ ...input, role, id: expect.any(String), createdAt: expect.any(String) });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Account saved');
    expect(screen.getByLabelText('Password', { exact: false })).toHaveValue('');
    expect(document.body.textContent).not.toContain(account.password);
    expect(document.body.textContent).not.toContain(input.password);
    expect(within(desktop()).getByText(input.displayName)).toBeInTheDocument();
    expect(within(mobile()).getByText(input.displayName)).toBeInTheDocument();
    cleanup();
    mount('/users');
    expect(storedUsers()).toEqual([account, created]);
    expect(within(desktop()).getByText(created.displayName)).toBeInTheDocument();
    expect(getSession()).toEqual(BUILTIN_ADMIN);
  });

  it('associates all required field errors and invalid role errors with inputs without storing anything', async () => {
    mount('/users');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'owner' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    for (const label of ['Display name', 'Username', 'Password']) {
      expect(screen.getByLabelText(label, { exact: false })).toHaveAccessibleDescription(`${label} is required.`);
      expect(screen.getByLabelText(label, { exact: false })).toHaveAttribute('aria-invalid', 'true');
    }
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription('Choose user or admin.');
    expect(localStorage.getItem('writespace_users')).toBeNull();
    fillAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(storedUsers()).toHaveLength(1);
  });

  it.each(['READER', 'ADMIN'])('shows associated duplicate/reserved username error for %s and retains form', async (username) => {
    saveUsers([account]);
    mount('/users');
    fillAccount({ ...input, username });
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Username', { exact: false }))
      .toHaveAccessibleDescription(expect.stringContaining(username === 'ADMIN' ? 'reserved' : 'already used'));
    expect(screen.getByLabelText('Display name', { exact: false })).toHaveValue(input.displayName);
    expect(storedUsers()).toEqual([account]);
    expect(screen.queryByText('Account saved in this browser.')).not.toBeInTheDocument();
  });

  it.each(['write', 'quota', 'uuid', 'corrupt'])('never claims account creation on %s failure and preserves stored data', async (boundary) => {
    saveUsers([account]);
    mount('/users');
    fillAccount();
    if (boundary === 'write' || boundary === 'quota') failWrites('writespace_users', boundary === 'quota' ? 'QuotaExceededError' : 'Error');
    if (boundary === 'uuid') vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('synthetic-secret'); });
    if (boundary === 'corrupt') localStorage.setItem('writespace_users', '{');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Account saved in this browser.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Display name', { exact: false })).toHaveValue(input.displayName);
    expect(localStorage.getItem('writespace_users')).toBe(boundary === 'corrupt' ? '{' : JSON.stringify([account]));
  });

  it.each([null, readerSession, { ...BUILTIN_ADMIN, role: 'owner' }])('rechecks the live role before account creation for %j', async (identity) => {
    mount('/users');
    fillAccount();
    localStorage.setItem('writespace_session', JSON.stringify(identity));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only an administrator');
    expect(localStorage.getItem('writespace_users')).toBeNull();
    expect(route()).toBe('/users');
  });

  it('discloses demo limitations and tooltip gap with separate source row and no persisted built-in fields', async () => {
    saveUsers([account, localAdmin]);
    mount('/users', adminSession);
    expect(screen.getByText(/Passwords are plaintext/)).toHaveTextContent(/hard-coded/);
    expect(screen.getByText(/Passwords are plaintext/)).toHaveTextContent(/not real authorization/);
    expect(screen.getByText(/source does not specify/)).toBeInTheDocument();
    expect(within(desktop()).getAllByRole('row')).toHaveLength(4);
    for (const layout of [desktop(), mobile()]) {
      const builtinButton = within(layout).getByRole('button', { name: 'Delete Administrator' });
      const selfButton = within(layout).getByRole('button', { name: 'Delete Local Admin' });
      expect(builtinButton).toBeDisabled();
      expect(builtinButton).not.toHaveAttribute('title');
      expect(selfButton).toBeDisabled();
      await userEvent.click(builtinButton);
      await userEvent.click(selfButton);
    }
    expect(storedUsers()).toEqual([account, localAdmin]);
    expect(document.body.textContent).not.toContain(account.password);
  });

  it.each(['desktop', 'mobile'])('uses shared %s controls to cancel then confirm deletion with actual stored state', async (layoutName) => {
    saveUsers([account, localAdmin]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount('/users');
    expect(confirm).not.toHaveBeenCalled();
    const layout = layoutName === 'desktop' ? desktop() : mobile();
    await userEvent.click(within(layout).getByRole('button', { name: 'Delete Demo Reader' }));
    expect(storedUsers()).toEqual([account, localAdmin]);
    expect(route()).toBe('/users');
    expect(screen.queryByText('Account deleted in this browser.')).not.toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(within(layout).getByRole('button', { name: 'Delete Demo Reader' }));
    expect(storedUsers()).toEqual([localAdmin]);
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Account deleted');
    expect(within(desktop()).queryByText(account.displayName)).not.toBeInTheDocument();
    expect(within(mobile()).queryByText(account.displayName)).not.toBeInTheDocument();
  });

  it.each(['Error', 'QuotaExceededError'])('keeps accounts visible and unsaved after confirmed %s deletion failure', async (name) => {
    saveUsers([account]);
    mount('/users');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    failWrites('writespace_users', name);
    await userEvent.click(within(desktop()).getByRole('button', { name: 'Delete Demo Reader' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(within(desktop()).getByText(account.displayName)).toBeInTheDocument();
    expect(storedUsers()).toEqual([account]);
    expect(screen.queryByText('Account deleted in this browser.')).not.toBeInTheDocument();
  });

  it.each(['before', 'during', 'self', 'missing', 'corrupt'])('rechecks %s boundary on activated account deletion', async (boundary) => {
    saveUsers([account]);
    mount('/users');
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => {
      if (boundary === 'during') setSession(readerSession);
      if (boundary === 'self') setSession({ ...readerSession, role: 'admin' });
      return true;
    });
    if (boundary === 'before') setSession(readerSession);
    if (boundary === 'missing') saveUsers([]);
    if (boundary === 'corrupt') localStorage.setItem('writespace_users', '{');
    await userEvent.click(within(desktop()).getByRole('button', { name: 'Delete Demo Reader' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_users'))
      .toBe(boundary === 'missing' ? '[]' : boundary === 'corrupt' ? '{' : JSON.stringify([account]));
    expect(route()).toBe('/users');
    if (boundary === 'before') expect(confirm).not.toHaveBeenCalled();
  });

  it('protects the newly active administrator before confirmation even if the rendered button was eligible', async () => {
    saveUsers([localAdmin]);
    mount('/users');
    setSession(adminSession);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(within(mobile()).getByRole('button', { name: 'Delete Local Admin' }));
    expect(screen.getByRole('alert')).toHaveTextContent('protected account');
    expect(confirm).not.toHaveBeenCalled();
    expect(storedUsers()).toEqual([localAdmin]);
  });

  it.each(['{', '{}', '[null]'])('renders corrupt users %s safely with source-only rows, blocks create without repair', async (raw) => {
    localStorage.setItem('writespace_users', raw);
    mount('/users');
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Stored accounts cannot be shown');
    expect(screen.getByText('No stored local accounts yet.')).toBeInTheDocument();
    expect(within(desktop()).getAllByRole('row')).toHaveLength(2);
    fillAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_users')).toBe(raw);
  });

  it.each(['/admin', '/users'])('guests and ordinary users receive correct direct-entry guards for %s', (path) => {
    mount(path, null);
    expect(route()).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    cleanup();
    mount(path, readerSession);
    expect(route()).toBe('/blogs');
    expect(screen.queryByRole('link', { name: 'Users', exact: true })).not.toBeInTheDocument();
    expect(localStorage.getItem('writespace_users')).toBeNull();
  });

  it('activates the admin-only Users navigation link and closes the mobile menu, then returns through Admin home', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await userEvent.click(screen.getByRole('link', { name: 'Users', exact: true }));
    expect(route()).toBe('/users');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('link', { name: 'Admin home', exact: true }));
    expect(route()).toBe('/admin');
    expect(localStorage.getItem('writespace_users')).toBeNull();
  });
});
