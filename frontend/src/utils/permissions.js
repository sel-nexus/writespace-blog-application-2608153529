/** Express bypassable client-side role and ownership rules, not real authorization. */
import { isSession } from './auth';
import { isPost } from './storage';

/** Permit a valid administrator or the post's matching author. @returns {boolean} */
export function canManagePost(session, post) {
  return isSession(session) && isPost(post)
    && (session.role === 'admin' || post.authorId === session.userId);
}

/** Permit only a complete administrator session to manage local users. @returns {boolean} */
export function canManageUsers(session) {
  return isSession(session) && session.role === 'admin';
}
