/** Own the sole session key and the non-secure, browser-local demo sign-in flow. */
import { createUser, exactRecord, failure, getUsers, readStored, requiredText, usernameKey, writeStored } from './storage';

/** @typedef {{userId:string,username:string,displayName:string,role:string}} Session */
const SESSION_KEY = 'writespace_session';
export const BUILTIN_ADMIN = Object.freeze({
  userId: 'builtin-admin', username: 'admin', displayName: 'Administrator', role: 'admin',
});

/** Accept only the supported full session shape and role. @returns {boolean} */
export function isSession(value) {
  return exactRecord(value, ['userId', 'username', 'displayName', 'role'])
    && ['user', 'admin'].includes(value.role);
}

/** Restore a supported session or fail closed without altering storage. @returns {Session|null} */
export function getSession() {
  const result = readStored(SESSION_KEY, isSession, null);
  return result.ok ? result.value : null;
}

/** Persist a session; never claim sign-in if writing fails. @returns {import('./storage').Result<Session>} */
export function setSession(session) {
  return writeStored(SESSION_KEY, session, isSession);
}

/** Remove only the session key on activation. @returns {import('./storage').Result<null>} */
export function clearSession() {
  let store;
  try {
    store = window.localStorage;
  } catch {
    return failure('unavailable', 'Browser-local storage is unavailable. Sign-out did not complete.');
  }
  try {
    store.removeItem(SESSION_KEY);
    return { ok: true, value: null };
  } catch {
    return failure('remove', 'Sign-out did not complete. Check your browser storage settings and try again.');
  }
}

/** Choose a valid session's role home. @param {Session} session Identity. @returns {string} */
export function roleHome(session) {
  return session?.role === 'admin' ? '/admin' : '/blogs';
}

/** Construct a session without persisting passwords or account-only fields. @returns {Session} */
function sessionFromUser(user) {
  return { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

/** Match source-defined demo credentials first, then local accounts case-insensitively.
 * @param {{username:string,password:string}} input Entered demo credentials.
 * @returns {import('./storage').Result<Session>} Invalid credentials never reveal their values.
 */
export function login(input) {
  if (!input || !requiredText(input.username) || !requiredText(input.password)) {
    return failure('invalid', 'Username and password are required.');
  }
  if (usernameKey(input.username) === 'admin') {
    return input.password === 'admin' ? setSession({ ...BUILTIN_ADMIN })
      : failure('invalid', 'The username or password is incorrect.');
  }
  const user = getUsers().find((account) => usernameKey(account.username) === usernameKey(input.username)
    && account.password === input.password);
  return user ? setSession(sessionFromUser(user)) : failure('invalid', 'The username or password is incorrect.');
}

/** Register only a user, saving the account before attempting the session.
 * @param {{displayName:string,username:string,password:string,confirmPassword:string}} input Form data.
 * @returns {object} Result; partial failure adds accountCreated:true after a successful user write.
 */
export function register(input) {
  if (!input || !['displayName', 'username', 'password', 'confirmPassword'].every((key) => requiredText(input[key]))) {
    return failure('invalid', 'All registration fields are required.');
  }
  if (input.password !== input.confirmPassword) return failure('invalid', 'Passwords do not match.');
  const created = createUser({ ...input, role: 'user' });
  if (!created.ok) return created;
  const signedIn = setSession(sessionFromUser(created.value));
  if (!signedIn.ok) {
    return { ...signedIn, accountCreated: true, error: {
      code: signedIn.error.code,
      message: 'Your account was created locally, but sign-in did not persist. Go to sign in and try again.',
    } };
  }
  return signedIn;
}
