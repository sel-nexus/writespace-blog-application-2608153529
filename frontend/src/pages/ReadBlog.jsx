/** Read escaped plain text and delete only after activated confirmation and successful persistence. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSession } from '../utils/auth';
import { deletePost, readPosts } from '../utils/storage';
import { canManagePost } from '../utils/permissions';
import { formatPostDate } from '../utils/posts';
import { Avatar } from '../components/Avatar';
import { sessionType } from '../components/ProtectedRoute';
import { textLink } from '../components/FormField';

/** Disclose read failures, distinguish missing posts, or show complete local text. @returns {JSX.Element} */
export default function ReadBlog({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const posts = readPosts();
  const post = posts.ok ? posts.value.find((record) => record.id === id) : null;
  const [error, setError] = useState('');

  /** Re-read permissions before confirming; cancellation never writes or navigates. */
  function requestDelete() {
    const actor = getSession();
    const posts = readPosts();
    if (!posts.ok) {
      setError(posts.error.message);
      return;
    }
    const current = posts.value.find((record) => record.id === id);
    if (!current || !canManagePost(actor, current)) {
      setError(current ? 'This post cannot be deleted by this account.' : 'Post not found');
      return;
    }
    const confirmed = window.confirm('Delete this local post?');
    const result = deletePost({ postId: id, confirmed }, getSession());
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if (result.value.deleted) navigate('/blogs');
  }

  if (!post) {
    return (
      <section className="space-y-6 py-12">
        <h1 className="font-display text-4xl font-bold">{posts.ok ? 'Post not found' : 'Local data unavailable'}</h1>
        {!posts.ok && (
          <p role="alert" className="text-error">{posts.error.message}</p>
        )}
        <Link to="/blogs" className={textLink}>Back to blogs</Link>
      </section>
    );
  }
  const date = formatPostDate(post.createdAt);
  return (
    <article className="mx-auto max-w-3xl space-y-8 py-12" aria-labelledby="post-heading">
      <Link to="/blogs" className={textLink}>Back to blogs</Link>
      <header className="space-y-5">
        <h1 id="post-heading" className="break-words font-display text-hero font-bold">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-foreground-muted">
          <Avatar displayName={post.authorName} />
          <span className="min-w-0 break-words">{post.authorName}</span>
          <time dateTime={date === 'Date unavailable' ? undefined : post.createdAt}>{date}</time>
        </div>
      </header>
      <div data-testid="post-content" className="whitespace-pre-wrap break-words text-lg leading-relaxed">
        {post.content}
      </div>
      {canManagePost(session, post) && (
        <div className="flex flex-wrap items-center gap-6 border-t border-border pt-6">
          <Link to={`/edit/${encodeURIComponent(post.id)}`} className={textLink}>Edit</Link>
          <button
            type="button"
            onClick={requestDelete}
            className="min-h-11 rounded px-4 py-2 text-error underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Delete
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-error">{error}</p>
      )}
    </article>
  );
}
ReadBlog.propTypes = { session: sessionType.isRequired };
