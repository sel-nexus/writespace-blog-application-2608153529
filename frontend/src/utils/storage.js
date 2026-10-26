/** Guard browser-local demo records without repairing or deleting unreadable data. */

/** @typedef {{code:string, message:string}} StorageError */
/** @template T @typedef {{ok:true,value:T}|{ok:false,error:StorageError}} Result */
/** @typedef {{id:string,displayName:string,username:string,password:string,role:string,createdAt:string}} User */
/** @typedef {{id:string,title:string,content:string,createdAt:string,authorId:string,authorName:string}} Post */

const USERS_KEY = 'writespace_users';
const POSTS_KEY = 'writespace_posts';

/** Return a safe failure with no record data. @returns {Result<never>} */
export function failure(code, message) {
  return { ok: false, error: { code, message } };
}

/** Check required text without changing the entered value. @returns {boolean} */
export function requiredText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Compare usernames consistently without trimming their stored values. @returns {string} */
export function usernameKey(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/** Accept only complete objects with exactly the supported string fields. @returns {boolean} */
export function exactRecord(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field) && requiredText(value[field]));
}

/** Validate every required local account field and the supported role. @returns {boolean} */
export function isUser(value) {
  return exactRecord(value, ['id', 'displayName', 'username', 'password', 'role', 'createdAt'])
    && ['user', 'admin'].includes(value.role);
}

/** Validate post records while tolerating nonempty legacy date strings. @returns {boolean} */
export function isPost(value) {
  return exactRecord(value, ['id', 'title', 'content', 'createdAt', 'authorId', 'authorName']);
}

/** Read a validated value; missing keys use the supplied empty value.
 * @param {string} key Exact persistence key.
 * @param {Function} validate Shape predicate.
 * @param {*} empty Missing-key value.
 * @returns {Result<*>} Never throws or writes a replacement.
 */
export function readStored(key, validate, empty) {
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return failure('unavailable', 'Browser-local data is unavailable. Check your browser storage settings.');
  }
  if (raw === null) return { ok: true, value: empty };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure('parse', 'Browser-local data could not be read. It has not been changed.');
  }
  if (!validate(value)) return failure('shape', 'Browser-local data has an unsupported format. It has not been changed.');
  return { ok: true, value };
}

/** Persist exactly once after validation, reporting access, serialization and quota failures.
 * @param {string} key Exact persistence key.
 * @param {*} value Supported value.
 * @param {Function} validate Shape predicate.
 * @returns {Result<*>} Success only after setItem completes.
 */
export function writeStored(key, value, validate) {
  if (!validate(value)) return failure('shape', 'The local value was not saved because its format is unsupported.');
  let store;
  try {
    store = window.localStorage;
  } catch {
    return failure('unavailable', 'Browser-local storage is unavailable. Nothing was saved.');
  }
  try {
    store.setItem(key, JSON.stringify(value));
    return { ok: true, value };
  } catch (error) {
    return failure(error?.name === 'QuotaExceededError' ? 'quota' : 'write',
      'The local change was not saved. Check browser storage space and settings, then try again.');
  }
}

/** Check a whole user array; one invalid entry rejects the value. @returns {boolean} */
export function isUsers(value) {
  return Array.isArray(value) && value.every(isUser);
}

/** Check a whole post array; one invalid entry rejects the value. @returns {boolean} */
export function isPosts(value) {
  return Array.isArray(value) && value.every(isPost);
}

/** Read users with diagnostic results for non-destructive mutations. @returns {Result<User[]>} */
export function readUsers() {
  return readStored(USERS_KEY, isUsers, []);
}

/** Read safe users; failures leave persisted bytes untouched. @returns {User[]} */
export function getUsers() {
  const result = readUsers();
  return result.ok ? result.value : [];
}

/** Read safe posts; failures leave persisted bytes untouched. @returns {Post[]} */
export function getPosts() {
  const result = readStored(POSTS_KEY, isPosts, []);
  return result.ok ? result.value : [];
}

/** Save a supported user array. @param {User[]} users Records. @returns {Result<User[]>} */
export function saveUsers(users) {
  return writeStored(USERS_KEY, users, isUsers);
}

/** Save a supported post array, without implementing post CRUD. @returns {Result<Post[]>} */
export function savePosts(posts) {
  return writeStored(POSTS_KEY, posts, isPosts);
}

/** Create and persist a local account with browser-generated identity and timestamp.
 * @param {{displayName:string,username:string,password:string,role:string}} input Required fields.
 * @param {User[]} [users] Previously read local users; no cross-tab merge is promised.
 * @returns {Result<User>} Never overwrites an unreadable persisted users value.
 */
export function createUser(input, users) {
  if (!input || !['displayName', 'username', 'password'].every((key) => requiredText(input[key]))
    || !['user', 'admin'].includes(input.role)) {
    return failure('invalid', 'Display name, username, password and a supported role are required.');
  }
  if (usernameKey(input.username) === 'admin') return failure('protected', 'That username is reserved. Choose another username.');
  const current = readUsers();
  if (!current.ok) return current;
  const collection = users === undefined ? current.value : users;
  if (!isUsers(collection)) return failure('shape', 'The local account list has an unsupported format.');
  if (collection.some((user) => usernameKey(user.username) === usernameKey(input.username))) {
    return failure('duplicate', 'That username is already used in this browser.');
  }
  let user;
  try {
    user = {
      id: crypto.randomUUID(), displayName: input.displayName, username: input.username,
      password: input.password, role: input.role, createdAt: new Date().toISOString(),
    };
  } catch {
    return failure('unavailable', 'A local account identity could not be created. Nothing was saved.');
  }
  const saved = saveUsers([...collection, user]);
  return saved.ok ? { ok: true, value: user } : saved;
}
