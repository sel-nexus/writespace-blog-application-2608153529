/** Review this browser's defined counts and five newest posts without implicit mutations. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BUILTIN_ADMIN, getSession } from '../utils/auth';
import { deletePost, readPosts, readUsers } from '../utils/storage';
import { canManageUsers } from '../utils/permissions';
import { formatPostDate, sortPosts } from '../utils/posts';
import { StatCard } from '../components/StatCard';
import { sessionType } from '../components/ProtectedRoute';
import { primaryButton, textLink } from '../components/FormField';

/** Render a safe local summary; recheck current administrator status on delete activation.
 * @param {{session:import('../utils/auth').Session}} props Current navigation identity.
 * @returns {JSX.Element} Dashboard with explicit source gaps outside the metric grid.
 */
export default function AdminDashboard({ session }) {
  const [postsResult] = useState(readPosts);
  const [usersResult] = useState(readUsers);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const posts = postsResult.ok ? postsResult.value : [];
  const users = usersResult.ok ? usersResult.value.filter((user) => user.id !== BUILTIN_ADMIN.userId) : [];

  /** Confirm only for a current administrator; cancellation stays on the dashboard.
   * @param {string} postId Activated persisted post target.
   * @returns {void} Report safe errors or navigate only after accepted deletion.
   */
  function requestDelete(postId) {
    setError('');
    if (!canManageUsers(getSession())) {
      setError('Only an administrator can moderate from this dashboard.');
      return;
    }
    const confirmed = window.confirm('Delete this local post?');
    const actor = getSession();
    if (!canManageUsers(actor)) {
      setError('Only an administrator can moderate from this dashboard.');
      return;
    }
    const result = deletePost({ postId, confirmed }, actor);
    if (!result.ok) setError(result.error.message);
    else if (result.value.deleted) navigate('/blogs');
  }

  return (
    <section className="space-y-8 py-12" aria-labelledby="admin-heading">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Local administration</p>
        <h1 id="admin-heading" className="font-display text-hero font-bold">Administrator home</h1>
        <h2 className="font-display text-2xl font-bold">Welcome, {session.displayName}.</h2>
      </header>
      <div data-testid="admin-metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Posts" value={posts.length} />
        <StatCard label="Total Users" value={users.length + 1} />
        <StatCard label="Admins" value={users.filter((user) => user.role === 'admin').length + 1} />
        <StatCard reserved />
      </div>
      <div className="space-y-2 text-sm text-foreground-muted">
        <p>Account counts include the source-defined built-in administrator once, in addition to stored accounts.</p>
        <p>The fourth metric is unresolved: the source duplicates Total Users. Its position remains blank pending clarification.</p>
        {!postsResult.ok && (
          <p role="status">{postsResult.error.message} Post counts and recent posts are unavailable.</p>
        )}
        {!usersResult.ok && (
          <p role="status">{usersResult.error.message} Stored account counts are unavailable; only the built-in account is counted.</p>
        )}
      </div>
      <nav aria-label="Quick actions" className="flex flex-wrap gap-5">
        <Link to="/write" className={primaryButton}>Write New Post</Link>
        <Link to="/users" className={textLink}>Manage Users</Link>
      </nav>
      <section className="space-y-4" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="font-display text-3xl font-bold">Newest local posts</h2>
        {posts.length === 0 && (
          <p className="text-foreground-muted">No local posts to review yet.</p>
        )}
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {sortPosts(posts).slice(0, 5).map((post) => {
            const date = formatPostDate(post.createdAt);
            return (
              <article key={post.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0 space-y-2 break-words">
                  <h3 className="font-display text-xl font-bold">{post.title}</h3>
                  <p className="text-foreground-muted">{post.authorName}</p>
                  <time dateTime={date === 'Date unavailable' ? undefined : post.createdAt}>{date}</time>
                </div>
                <div className="flex items-center gap-4">
                  <Link to={`/edit/${encodeURIComponent(post.id)}`} className={textLink} aria-label={`Edit ${post.title}`}>
                    Edit
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${post.title}`}
                    onClick={() => requestDelete(post.id)}
                    className="min-h-11 rounded px-3 py-2 text-error underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="text-error">{error}</p>
        )}
      </section>
    </section>
  );
}
AdminDashboard.propTypes = { session: sessionType.isRequired };
