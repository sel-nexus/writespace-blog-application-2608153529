/** Specify account persistence, failure contracts, permissions and activated UI behavior. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as storage from '../utils/storage';
import * as auth from '../utils/auth';
import { canManagePost, canManageUsers } from '../utils/permissions';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PublicNavbar } from '../components/PublicNavbar';
import { Navbar } from '../components/Navbar';
import { Avatar } from '../components/Avatar';
import { FormField } from '../components/FormField';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import App from '../App';

const user = {
  id: 'reader-id', displayName: 'Demo Reader', username: 'Reader', password: 'x',
  role: 'user', createdAt: '2026-01-01T00:00:00.000Z',
};
const post = {
  id: 'post-id', title: 'Local note', content: 'Plain text', createdAt: 'legacy-invalid-date',
  authorId: user.id, authorName: user.displayName,
};
const session = { userId: user.id, username: user.username, displayName: user.displayName, role: 'user' };
const registration = { displayName: 'Demo Writer', username: 'Writer', password: 'x', confirmPassword: 'x' };

/** Report router outcomes as observable content. */
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">{location.pathname}</output>
  );
}

/** Mount real routing with future flags to avoid third-party migration warnings. */
function mount(element, path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {element}
      <Location />
    </MemoryRouter>,
  );
}

/** Fill the real controlled registration fields using their associated labels. */
async function fillRegistration(values = registration) {
  const actor = userEvent.setup();
  for (const [label, key] of [
    ['Display name', 'displayName'], ['Username', 'username'], ['Password', 'password'], ['Confirm password', 'confirmPassword'],
  ]) {
    await actor.type(screen.getByLabelText(new RegExp(`^${label}\\s*\\*?$`)), values[key]);
  }
  return actor;
}

/** Fail writes for a selected key while preserving all other real localStorage behavior. */
function failWrites(key, name = 'Error') {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(target, value) {
    if (target === key) throw new DOMException('synthetic storage failure', name);
    return original.call(this, target, value);
  });
}

describe('strict storage records and safe reads', () => {
  it('returns empty collections and a null session for missing exact keys without creating them', () => {
    expect(storage.getUsers()).toEqual([]);
    expect(storage.getPosts()).toEqual([]);
    expect(auth.getSession()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('persists full arrays under exact keys, preserving unrelated keys and legacy date strings', () => {
    localStorage.setItem('unrelated', 'keep');
    expect(storage.saveUsers([user])).toEqual({ ok: true, value: [user] });
    expect(storage.savePosts([post])).toEqual({ ok: true, value: [post] });
    expect(storage.getUsers()).toEqual([user]);
    expect(storage.getPosts()).toEqual([post]);
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([user]);
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post]);
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(storage.saveUsers([]).ok).toBe(true);
    expect(storage.savePosts([]).ok).toBe(true);
    expect(storage.getUsers()).toEqual([]);
    expect(storage.getPosts()).toEqual([]);
  });

  it.each(['{', '', 'null', '{}', '"text"', '12', '[null]', '[{}]'])('rejects invalid collection bytes %s without repair', (raw) => {
    localStorage.setItem('writespace_users', raw);
    localStorage.setItem('writespace_posts', raw);
    expect(storage.getUsers()).toEqual([]);
    expect(storage.getPosts()).toEqual([]);
    expect(localStorage.getItem('writespace_users')).toBe(raw);
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(storage.createUser({ ...registration, role: 'user' }).ok).toBe(false);
    expect(localStorage.getItem('writespace_users')).toBe(raw);
    expect(auth.getSession()).toBeNull();
  });

  it.each(Object.keys(user))('rejects a user missing required field %s', (field) => {
    const incomplete = { ...user };
    delete incomplete[field];
    localStorage.setItem('writespace_users', JSON.stringify([user, incomplete]));
    expect(storage.getUsers()).toEqual([]);
    expect(storage.saveUsers([incomplete]).error.code).toBe('shape');
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([user, incomplete]);
  });

  it.each(Object.keys(post))('rejects a post missing required field %s', (field) => {
    const incomplete = { ...post };
    delete incomplete[field];
    localStorage.setItem('writespace_posts', JSON.stringify([incomplete]));
    expect(storage.getPosts()).toEqual([]);
    expect(storage.savePosts([incomplete]).error.code).toBe('shape');
  });

  it.each([null, undefined, '', '   ', 9, false, {}, []])('rejects invalid required field value %j', (value) => {
    expect(storage.isUser({ ...user, displayName: value })).toBe(false);
    expect(storage.isPost({ ...post, authorName: value })).toBe(false);
    expect(auth.isSession({ ...session, userId: value })).toBe(false);
  });

  it('rejects extra persisted fields, wrong roles and invalid array top levels', () => {
    expect(storage.saveUsers([{ ...user, isBuiltIn: true }]).error.code).toBe('shape');
    expect(storage.saveUsers([{ ...user, role: 'owner' }]).ok).toBe(false);
    expect(storage.savePosts([{ ...post, extra: 'no' }]).ok).toBe(false);
    expect(storage.saveUsers({} ).ok).toBe(false);
    expect(storage.savePosts(null).ok).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(storage.usernameKey(null)).toBe('');
    expect(storage.usernameKey(' Reader ')).toBe(' reader ');
  });

  it('catches localStorage property access errors in all reads, writes, creation and removal', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    expect(storage.getUsers()).toEqual([]);
    expect(storage.getPosts()).toEqual([]);
    expect(auth.getSession()).toBeNull();
    expect(storage.saveUsers([user]).error.code).toBe('unavailable');
    expect(storage.savePosts([post]).error.code).toBe('unavailable');
    expect(auth.setSession(session).error.code).toBe('unavailable');
    expect(auth.clearSession().error.code).toBe('unavailable');
    expect(storage.createUser({ ...registration, role: 'user' }).error.code).toBe('unavailable');
  });

  it('catches getItem failures without writing a replacement', () => {
    localStorage.setItem('writespace_users', JSON.stringify([user]));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(storage.getUsers()).toEqual([]);
    expect(storage.getPosts()).toEqual([]);
    expect(auth.getSession()).toBeNull();
    expect(storage.readUsers().error.code).toBe('unavailable');
  });

  it.each(['Error', 'QuotaExceededError'])('reports %s write failure without false success or changes', (name) => {
    storage.saveUsers([user]);
    storage.savePosts([post]);
    auth.setSession(session);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('secret', name); });
    const code = name === 'QuotaExceededError' ? 'quota' : 'write';
    for (const result of [storage.saveUsers([]), storage.savePosts([]), auth.setSession(auth.BUILTIN_ADMIN)]) {
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(code);
      expect(result.error.message).not.toContain('secret');
    }
    expect(storage.getUsers()).toEqual([user]);
    expect(storage.getPosts()).toEqual([post]);
    expect(auth.getSession()).toEqual(session);
  });

  it('handles serialization exceptions without modifying stored users', () => {
    storage.saveUsers([user]);
    const unserializable = [{ ...user, toJSON: undefined }];
    // Non-enumerable serialization behavior does not alter the persisted schema.
    delete unserializable[0].toJSON;
    Object.defineProperty(unserializable[0], 'toJSON', { value() { throw new Error('sensitive'); } });
    expect(storage.saveUsers(unserializable).error.code).toBe('write');
    expect(storage.getUsers()).toEqual([user]);
  });
});

describe('account creation and auth results', () => {
  it.each(['user', 'admin'])('creates a supported %s account using generated identity/time and exact fields', (role) => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('generated-id');
    const result = storage.createUser({ ...registration, role, extra: 'ignore' }, []);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      id: 'generated-id', displayName: registration.displayName, username: registration.username,
      password: 'x', role, createdAt: expect.any(String),
    });
    expect(new Date(result.value.createdAt).toISOString()).toBe(result.value.createdAt);
    expect(storage.getUsers()).toEqual([result.value]);
    expect(auth.getSession()).toBeNull();
  });

  it.each(['displayName', 'username', 'password', 'role'])('rejects missing account field %s without mutation', (field) => {
    const input = { ...registration, role: 'user' };
    delete input[field];
    expect(storage.createUser(input, []).error.code).toBe('invalid');
    expect(localStorage.length).toBe(0);
  });

  it.each([null, {}, { ...registration, role: 'owner' }, { ...registration, role: 'user', password: '  ' }])(
    'rejects invalid account input %j without mutation', (input) => {
      expect(storage.createUser(input, []).error.code).toBe('invalid');
      expect(localStorage.length).toBe(0);
    },
  );

  it('rejects case-insensitive duplicates and reserved names while preserving existing accounts', () => {
    storage.saveUsers([user]);
    for (const username of ['reader', 'READER']) {
      expect(storage.createUser({ ...registration, username, role: 'user' }, [user]).error.code).toBe('duplicate');
    }
    for (const username of ['admin', 'ADMIN', 'AdMiN']) {
      expect(storage.createUser({ ...registration, username, role: 'admin' }, [user]).error.code).toBe('protected');
    }
    expect(storage.getUsers()).toEqual([user]);
  });

  it('rejects invalid caller collections, UUID failures and account write failures', () => {
    expect(storage.createUser({ ...registration, role: 'user' }, {}).error.code).toBe('shape');
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unsupported'); });
    expect(storage.createUser({ ...registration, role: 'user' }).error.code).toBe('unavailable');
    uuid.mockRestore();
    failWrites('writespace_users');
    expect(storage.createUser({ ...registration, role: 'user' }).error.code).toBe('write');
    expect(storage.getUsers()).toEqual([]);
  });

  it('preserves entered whitespace, accepts a one-character demo password and escapes display text later', () => {
    const result = auth.register({ displayName: '<img src=x onerror=alert(1)>', username: ' Writer ', password: ' x ', confirmPassword: ' x ' });
    expect(result.ok).toBe(true);
    expect(storage.getUsers()[0].username).toBe(' Writer ');
    expect(storage.getUsers()[0].password).toBe(' x ');
    expect(auth.login({ username: ' writer ', password: ' x ' }).ok).toBe(true);
    expect(auth.login({ username: 'writer', password: ' x ' }).ok).toBe(false);
  });

  it('logs in source-defined built-in admin first without storing an admin user or password in session', () => {
    storage.saveUsers([{ ...user, username: 'admin', password: 'wrong' }]);
    expect(auth.login({ username: 'ADMIN', password: 'admin' })).toEqual({ ok: true, value: auth.BUILTIN_ADMIN });
    expect(auth.getSession()).toEqual(auth.BUILTIN_ADMIN);
    expect(auth.getSession().userId).toBe('builtin-admin');
    expect(Object.keys(auth.getSession()).sort()).toEqual(['displayName', 'role', 'userId', 'username']);
    expect(auth.login({ username: 'admin', password: 'wrong' }).ok).toBe(false);
    expect(storage.getUsers()).toHaveLength(1);
    expect(auth.roleHome(auth.BUILTIN_ADMIN)).toBe('/admin');
    expect(auth.roleHome(session)).toBe('/blogs');
  });

  it.each(['user', 'admin'])('logs in a local %s with case-insensitive username and exact password', (role) => {
    storage.saveUsers([{ ...user, role }]);
    expect(auth.login({ username: 'rEaDeR', password: 'x' })).toEqual({ ok: true, value: { ...session, role } });
    expect(auth.getSession()).toEqual({ ...session, role });
  });

  it.each([undefined, {}, { username: ' ', password: 'x' }, { username: 'Reader', password: '' },
    { username: 'unknown', password: 'password-secret' }, { username: 'Reader', password: 'wrong' }])(
    'rejects invalid login %j without creating a session or leaking input', (input) => {
      storage.saveUsers([user]);
      const result = auth.login(input);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('invalid');
      expect(result.error.message).not.toMatch(/password-secret|Reader|unknown|wrong|admin\/admin/);
      expect(auth.getSession()).toBeNull();
    },
  );

  it('does not log in when session persistence fails for built-in or local account', () => {
    storage.saveUsers([user]);
    failWrites('writespace_session', 'QuotaExceededError');
    expect(auth.login({ username: 'admin', password: 'admin' }).error.code).toBe('quota');
    expect(auth.login({ username: 'Reader', password: 'x' }).error.code).toBe('quota');
    expect(auth.getSession()).toBeNull();
  });

  it('registers only a user even when caller supplies admin role, then persists the session', () => {
    const result = auth.register({ ...registration, role: 'admin' });
    expect(result.ok).toBe(true);
    const account = storage.getUsers()[0];
    expect(account.role).toBe('user');
    expect(account.password).toBe('x');
    expect(auth.getSession()).toEqual({ userId: account.id, username: 'Writer', displayName: 'Demo Writer', role: 'user' });
  });

  it.each(['displayName', 'username', 'password', 'confirmPassword'])('rejects missing registration field %s before saving', (field) => {
    const input = { ...registration };
    delete input[field];
    expect(auth.register(input).error.code).toBe('invalid');
    expect(localStorage.length).toBe(0);
  });

  it('rejects null registration and password mismatch without persisting anything', () => {
    expect(auth.register(null).ok).toBe(false);
    expect(auth.register({ ...registration, confirmPassword: 'different' }).error.message).toBe('Passwords do not match.');
    expect(localStorage.length).toBe(0);
  });

  it('stops after account-save failure without claiming a partial result or signing in', () => {
    failWrites('writespace_users');
    const result = auth.register(registration);
    expect(result.ok).toBe(false);
    expect(result.accountCreated).toBeUndefined();
    expect(storage.getUsers()).toEqual([]);
    expect(auth.getSession()).toBeNull();
  });

  it('reports an account-saved/session-failed partial result and permits later login', () => {
    failWrites('writespace_session');
    const result = auth.register(registration);
    expect(result).toMatchObject({ ok: false, accountCreated: true, error: { code: 'write' } });
    expect(result.error.message).toMatch(/created locally, but sign-in did not persist/);
    expect(storage.getUsers()).toHaveLength(1);
    expect(auth.getSession()).toBeNull();
    vi.restoreAllMocks();
    expect(auth.login({ username: 'writer', password: 'x' }).ok).toBe(true);
    expect(auth.getSession().userId).toBe(storage.getUsers()[0].id);
  });
});

describe('session validation and logout', () => {
  it.each(Object.keys(session))('fails closed on a missing session field %s without deleting bytes', (field) => {
    const incomplete = { ...session };
    delete incomplete[field];
    const raw = JSON.stringify(incomplete);
    localStorage.setItem('writespace_session', raw);
    expect(auth.getSession()).toBeNull();
    expect(auth.setSession(incomplete).error.code).toBe('shape');
    expect(localStorage.getItem('writespace_session')).toBe(raw);
  });

  it.each(['{', 'null', '[]', '{}', '"admin"', JSON.stringify({ ...session, role: 'owner' }),
    JSON.stringify({ ...session, password: 'no' })])('fails closed for invalid session %s', (raw) => {
    localStorage.setItem('writespace_session', raw);
    expect(auth.getSession()).toBeNull();
    expect(localStorage.getItem('writespace_session')).toBe(raw);
  });

  it('removes only the session and is idempotent when no session exists', () => {
    storage.saveUsers([user]);
    storage.savePosts([post]);
    auth.setSession(session);
    expect(auth.clearSession()).toEqual({ ok: true, value: null });
    expect(auth.getSession()).toBeNull();
    expect(storage.getUsers()).toEqual([user]);
    expect(storage.getPosts()).toEqual([post]);
    expect(auth.clearSession().ok).toBe(true);
  });

  it('returns remove failure and preserves the session when removeItem throws', () => {
    auth.setSession(session);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('secret'); });
    expect(auth.clearSession()).toMatchObject({ ok: false, error: { code: 'remove' } });
    expect(auth.getSession()).toEqual(session);
  });
});

describe('permissions and route guard matrix', () => {
  it('permits owner or admin posts and admin users, denying guests, others and malformed values', () => {
    expect(canManagePost(session, post)).toBe(true);
    expect(canManagePost(auth.BUILTIN_ADMIN, post)).toBe(true);
    expect(canManageUsers(auth.BUILTIN_ADMIN)).toBe(true);
    expect(canManageUsers(session)).toBe(false);
    for (const actor of [null, {}, { ...session, userId: 'other' }, { ...session, role: 'owner' }]) {
      expect(canManagePost(actor, post)).toBe(false);
    }
    for (const actor of [null, {}, { role: 'admin' }]) expect(canManageUsers(actor)).toBe(false);
    for (const invalid of [null, {}, { ...post, authorId: '' }]) expect(canManagePost(session, invalid)).toBe(false);
  });

  for (const path of ['/blogs', '/blog/note', '/write', '/edit/note', '/admin', '/users']) {
    for (const role of ['guest', 'user', 'admin']) {
      it(`${role} receives the documented guard outcome at ${path}`, () => {
        const actor = role === 'guest' ? null : role === 'admin' ? auth.BUILTIN_ADMIN : session;
        const adminOnly = ['/admin', '/users'].includes(path);
        mount(
          <Routes>
            <Route path={path} element={
              <ProtectedRoute session={actor} adminOnly={adminOnly}>
                <h1>Allowed content</h1>
              </ProtectedRoute>
            } />
            <Route path="/login" element={
              <h1>Guest sign in</h1>
            } />
            {path !== '/blogs' && (
              <Route path="/blogs" element={
                <h1>Reader destination</h1>
              } />
            )}
          </Routes>, path,
        );
        const expected = role === 'guest' ? '/login' : adminOnly && role === 'user' ? '/blogs' : path;
        expect(screen.getByLabelText('Current route')).toHaveTextContent(expected);
        expect(screen.getByRole('heading')).toHaveTextContent(
          role === 'guest' ? 'Guest sign in' : adminOnly && role === 'user' ? 'Reader destination' : 'Allowed content',
        );
      });
    }
  }
});

describe('fields, avatars, navigation and forms', () => {
  it('associates controlled required fields and validation feedback accessibly', async () => {
    const changed = vi.fn();
    render(
      <FormField id="name" label="Display name" value="" onChange={changed} error="Display name is required." />,
    );
    const input = screen.getByLabelText('Display name', { exact: false });
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Display name is required.');
    await userEvent.type(input, 'a');
    expect(changed).toHaveBeenCalled();
    cleanup();
    render(
      <FormField id="name" label="Display name" value="Valid" onChange={changed} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
  });

  it.each([['Demo Reader', 'DR'], ['   ', '?'], ['Alice', 'A'], [' one two three ', 'OT'], [undefined, '?']])(
    'renders safe initials for %s', (displayName, initials) => {
      render(
        <Avatar displayName={displayName} />,
      );
      expect(screen.getByText(initials)).toHaveAttribute('aria-hidden', 'true');
    },
  );

  it('opens/closes public navigation only on activation and activates signup/login/brand links', async () => {
    const actor = userEvent.setup();
    mount(
      <PublicNavbar />,
    );
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await actor.click(toggle);
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
    await actor.click(screen.getByRole('link', { name: 'Create account' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/register');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    await actor.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('aria-current', 'page');
    await actor.click(screen.getByRole('link', { name: 'WriteSpace.' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
  });

  it('never logs out on render; failed activation retains session and successful retry clears it', async () => {
    auth.setSession(session);
    mount(
      <App />, '/blogs',
    );
    expect(auth.getSession()).toEqual(session);
    expect(screen.getByRole('heading', { name: 'Reader home' })).toBeInTheDocument();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('failure'); });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-out did not complete');
    expect(auth.getSession()).toEqual(session);
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/blogs');
    remove.mockRestore();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.getSession()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });

  it('shows admin-only home link, updates menu state and activates admin/reader/brand navigation', async () => {
    const actor = userEvent.setup();
    const changed = vi.fn();
    mount(
      <Navbar session={auth.BUILTIN_ADMIN} onSessionChange={changed} />, '/blogs',
    );
    await actor.click(screen.getByRole('button', { name: 'Open navigation' }));
    await actor.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    await actor.click(screen.getByRole('link', { name: 'Admin home' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    await actor.click(screen.getByRole('link', { name: 'Reader home' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/blogs');
    await actor.click(screen.getByRole('link', { name: 'WriteSpace.' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(changed).not.toHaveBeenCalled();
    cleanup();
    mount(
      <Navbar session={session} onSessionChange={changed} />,
    );
    expect(screen.queryByRole('link', { name: 'Admin home' })).not.toBeInTheDocument();
  });

  it('displays login required errors, invalid credential errors and session write errors without navigating', async () => {
    mount(
      <App />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Username', { exact: false })).toHaveAccessibleDescription('Username is required.');
    expect(screen.getByLabelText('Password', { exact: false })).toHaveAccessibleDescription('Password is required.');
    await userEvent.type(screen.getByLabelText('Username', { exact: false }), 'admin');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'bad-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The username or password is incorrect.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('bad-secret');
    await userEvent.clear(screen.getByLabelText('Password', { exact: false }));
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'admin');
    failWrites('writespace_session');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(auth.getSession()).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
  });

  it.each(['user', 'admin'])('activates successful local %s login and redirects to its role home', async (role) => {
    storage.saveUsers([{ ...user, role }]);
    mount(
      <App />,
    );
    await userEvent.type(screen.getByLabelText('Username', { exact: false }), 'reader');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(role === 'admin' ? '/admin' : '/blogs');
    expect(auth.getSession()).toEqual({ ...session, role });
    expect(screen.getByRole('heading', { name: 'Welcome, Demo Reader.' })).toBeInTheDocument();
  });

  it('activates built-in login and discloses the real hint and plaintext/client-only limitations', async () => {
    mount(
      <App />,
    );
    expect(screen.getByLabelText('Demo limitations')).toHaveTextContent(/plaintext/);
    expect(screen.getByLabelText('Demo limitations')).toHaveTextContent(/bypassable/);
    expect(screen.getByText(/Try the built-in demo/)).toHaveTextContent('username admin, password admin');
    await userEvent.type(screen.getByLabelText('Username', { exact: false }), 'ADMIN');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'admin');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Administrator home' })).toBeInTheDocument();
    expect(auth.getSession()).toEqual(auth.BUILTIN_ADMIN);
    await userEvent.click(screen.getByRole('link', { name: 'Visit reader home' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/blogs');
  });

  it('shows all registration required errors and associates mismatch with confirmation', async () => {
    mount(
      <RegisterPage onSessionChange={vi.fn()} />, '/register',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    const actor = await fillRegistration({ ...registration, confirmPassword: 'y' });
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Confirm password', { exact: false })).toHaveAccessibleDescription('Passwords do not match.');
    expect(storage.getUsers()).toEqual([]);
  });

  it.each([['ADMIN', 'reserved'], ['reader', 'already used']])('associates username %s conflict with the field', async (username, message) => {
    storage.saveUsers([user]);
    mount(
      <RegisterPage onSessionChange={vi.fn()} />, '/register',
    );
    const actor = await fillRegistration({ ...registration, username });
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Username', { exact: false })).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(storage.getUsers()).toEqual([user]);
    expect(auth.getSession()).toBeNull();
  });

  it('keeps the registration form unsaved on account write failure', async () => {
    mount(
      <App />, '/register',
    );
    const actor = await fillRegistration();
    failWrites('writespace_users', 'QuotaExceededError');
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display name', { exact: false })).toHaveValue('Demo Writer');
    expect(storage.getUsers()).toEqual([]);
    expect(auth.getSession()).toBeNull();
  });

  it('offers sign-in after partial registration and does not falsely update authenticated state', async () => {
    mount(
      <App />, '/register',
    );
    const actor = await fillRegistration();
    failWrites('writespace_session');
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('created locally, but sign-in did not persist');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(storage.getUsers()).toHaveLength(1);
    expect(auth.getSession()).toBeNull();
    await actor.click(within(screen.getByRole('form', { name: 'Create account' })).getByRole('link', { name: 'Go to sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });

  it('activates account registration from sign-in, shows escaped identity and restores it after remount', async () => {
    mount(
      <App />,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Create an account' }));
    const actor = await fillRegistration({ ...registration, displayName: '<script>alert(1)</script>' });
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('heading', { name: 'Reader home' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome, <script>alert(1)</script>.' })).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    const restored = auth.getSession();
    cleanup();
    mount(
      <App />, '/blogs',
    );
    expect(screen.getByRole('heading', { name: 'Welcome, <script>alert(1)</script>.' })).toBeInTheDocument();
    expect(auth.getSession()).toEqual(restored);
  });

  it('activates the registration sign-in text link without saving an account', async () => {
    mount(
      <App />, '/register',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Go to sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(storage.getUsers()).toEqual([]);
  });
});

describe('account app routing and session restoration', () => {
  it.each(['/login', '/register', '/'])('redirects a restored admin from public entry %s', (path) => {
    auth.setSession(auth.BUILTIN_ADMIN);
    mount(
      <App />, path,
    );
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(screen.getByRole('heading', { name: 'Administrator home' })).toBeInTheDocument();
  });

  it.each(['/login', '/register', '/', '/admin', '/unknown'])('redirects a restored user from entry %s to reader home', (path) => {
    auth.setSession(session);
    mount(
      <App />, path,
    );
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/blogs');
    expect(screen.getByRole('heading', { name: 'Reader home' })).toBeInTheDocument();
  });

  it.each(['/', '/blogs', '/admin', '/unknown'])('redirects guest entry %s to sign-in', (path) => {
    mount(
      <App />, path,
    );
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });

  it('treats a corrupt restored session as a guest without destructive repair', () => {
    localStorage.setItem('writespace_session', '{');
    mount(
      <App />, '/admin',
    );
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_session')).toBe('{');
  });
});
