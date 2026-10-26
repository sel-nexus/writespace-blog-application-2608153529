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

/** Read posts with diagnostics so mutations never repair unreadable records. @returns {Result<Post[]>} */
export function readPosts() {
  return readStored(POSTS_KEY, isPosts, []);
}

/** Read safe posts; failures leave persisted bytes untouched. @returns {Post[]} */
export function getPosts() {
  const result = readPosts();
  return result.ok ? result.value : [];
}

/** Save a supported user array. @param {User[]} users Records. @returns {Result<User[]>} */
export function saveUsers(users) {
  return writeStored(USERS_KEY, users, isUsers);
}

/** Save a supported post array. @param {Post[]} posts Records. @returns {Result<Post[]>} */
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

/** Validate post actors without a reverse dependency on auth, which imports this module.
 * @param {*} session Untrusted caller identity, using the same full Session contract as auth.
 * @returns {boolean} Only complete supported user/admin identities are accepted.
 */
function isSession(session) {
  return exactRecord(session, ['userId', 'username', 'displayName', 'role'])
    && ['user', 'admin'].includes(session.role);
}

/** Recheck the admin/owner invariant at the persistence boundary without importing permissions.
 * @param {import('./auth').Session} session Validated local identity.
 * @param {Post} post Validated stored target.
 * @returns {boolean} Matches the UI's canManagePost rule; neither is server authorization.
 */
function canManagePost(session, post) {
  return isSession(session) && isPost(post)
    && (session.role === 'admin' || post.authorId === session.userId);
}

/** Read the authoritative persisted list, validating any caller snapshot but never trusting stale ownership.
 * @param {Post[]} [posts] Optional supported snapshot; no cross-tab lock or merge is promised.
 * @returns {Result<Post[]>} Unreadable persisted records are never overwritten.
 */
function mutationPosts(posts) {
  const current = readPosts();
  if (!current.ok) return current;
  if (posts !== undefined && !isPosts(posts)) return failure('shape', 'The local post list has an unsupported format.');
  return current;
}

/** Create and persist a post using only session-derived authorship.
 * @param {{title:string,content:string}} input Required plain text; entered whitespace is retained.
 * @param {import('./auth').Session} session Current local identity.
 * @param {Post[]} [posts] Supported snapshot.
 * @returns {Result<Post>} No success is returned before persistence completes.
 */
export function createPost(input, session, posts) {
  if (!input || !requiredText(input.title) || !requiredText(input.content)) {
    return failure('invalid', 'Title and content are required.');
  }
  if (!isSession(session)) return failure('invalid', 'A valid local session is required. Nothing was saved.');
  const current = mutationPosts(posts);
  if (!current.ok) return current;
  let post;
  try {
    post = {
      id: crypto.randomUUID(), title: input.title, content: input.content,
      createdAt: new Date().toISOString(), authorId: session.userId, authorName: session.displayName,
    };
  } catch {
    return failure('unavailable', 'A local post identity could not be created. Nothing was saved.');
  }
  if (current.value.some((record) => record.id === post.id)) {
    return failure('duplicate', 'A local post identity already exists. Nothing was saved.');
  }
  const saved = savePosts([...current.value, post]);
  return saved.ok ? { ok: true, value: post } : saved;
}

/** Persist only title/content on a permitted existing post.
 * @param {{postId:string,title:string,content:string}} input Target and editable text.
 * @param {import('./auth').Session} session Current local identity.
 * @param {Post[]} [posts] Supported snapshot.
 * @returns {Result<Post>} Missing, forbidden, invalid and failed-write outcomes never mutate records.
 */
export function updatePost(input, session, posts) {
  if (!input || !requiredText(input.postId) || !requiredText(input.title) || !requiredText(input.content)) {
    return failure('invalid', 'Post ID, title and content are required.');
  }
  if (!isSession(session)) return failure('invalid', 'A valid local session is required. Nothing was saved.');
  const current = mutationPosts(posts);
  if (!current.ok) return current;
  const post = current.value.find((record) => record.id === input.postId);
  if (!post) return failure('notFound', 'Post not found.');
  if (!canManagePost(session, post)) return failure('forbidden', 'This post cannot be edited by this account.');
  const updated = { ...post, title: input.title, content: input.content };
  const saved = savePosts(current.value.map((record) => record.id === input.postId ? updated : record));
  return saved.ok ? { ok: true, value: updated } : saved;
}

/** Delete a permitted target only after explicit confirmation.
 * @param {{postId:string,confirmed:boolean}} input Target and activated confirmation outcome.
 * @param {import('./auth').Session} session Current local identity.
 * @param {Post[]} [posts] Supported snapshot.
 * @returns {Result<{deleted:true,postId:string}|{deleted:false,reason:'cancelled'}>} Cancel is non-mutating success.
 */
export function deletePost(input, session, posts) {
  if (!input || !requiredText(input.postId) || typeof input.confirmed !== 'boolean') {
    return failure('invalid', 'Post ID and confirmation are required.');
  }
  if (!isSession(session)) return failure('invalid', 'A valid local session is required. Nothing was saved.');
  const current = mutationPosts(posts);
  if (!current.ok) return current;
  const post = current.value.find((record) => record.id === input.postId);
  if (!post) return failure('notFound', 'Post not found.');
  if (!canManagePost(session, post)) return failure('forbidden', 'This post cannot be deleted by this account.');
  if (!input.confirmed) return { ok: true, value: { deleted: false, reason: 'cancelled' } };
  const saved = savePosts(current.value.filter((record) => record.id !== input.postId));
  return saved.ok ? { ok: true, value: { deleted: true, postId: input.postId } } : saved;
}
