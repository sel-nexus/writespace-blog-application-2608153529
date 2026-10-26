/** Show a plain-text local post preview without implementing post management. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { isSession } from '../utils/auth';
import { formatPostDate } from '../utils/posts';
import { Avatar } from './Avatar';
import { sessionType } from './ProtectedRoute';
import { textLink } from './FormField';

const accents = ['border-t-primary', 'border-t-secondary', 'border-t-warning', 'border-t-success'];

/** Render escaped title/content/author and activated guest or signed-in navigation.
 * @param {object} props Supported post, zero-based position and optional local session.
 * @returns {JSX.Element} A preview with exactly the first 120 content characters.
 */
export function BlogCard({ post, index = 0, session = null }) {
  const date = formatPostDate(post.createdAt);
  const destination = isSession(session) ? `/blog/${encodeURIComponent(post.id)}` : '/login';
  return (
    <article className={`flex min-w-0 flex-col rounded-2xl border border-t-4 bg-surface p-6 shadow-editorial ${accents[index % 4]}`}>
      <p className="text-sm text-foreground-muted">
        <time dateTime={date === 'Date unavailable' ? undefined : post.createdAt}>{date}</time>
      </p>
      <h3 className="mt-4 break-words font-display text-2xl font-bold">
        <Link to={destination} className={textLink}>{post.title}</Link>
      </h3>
      <p className="my-5 whitespace-pre-wrap break-words leading-relaxed text-foreground-muted">
        {post.content.slice(0, 120)}
      </p>
      <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
        <Avatar displayName={post.authorName} />
        <span className="min-w-0 break-words text-sm">{post.authorName}</span>
      </div>
    </article>
  );
}
BlogCard.propTypes = {
  post: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    createdAt: PropTypes.string.isRequired,
    authorId: PropTypes.string.isRequired,
    authorName: PropTypes.string.isRequired,
  }).isRequired,
  index: PropTypes.number,
  session: sessionType,
};
