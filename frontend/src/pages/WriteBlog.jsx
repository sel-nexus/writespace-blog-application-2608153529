/** Create or edit plain-text local posts without accepting editable authorship or changing metadata. */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getSession } from '../utils/auth';
import { createPost, readPosts, requiredText, updatePost } from '../utils/storage';
import { canManagePost } from '../utils/permissions';
import { sessionType } from '../components/ProtectedRoute';
import { FormField, primaryButton, textLink } from '../components/FormField';

/** Prefill permitted edits and retain entered values after validation or storage failure. @returns {JSX.Element} */
export default function WriteBlog({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const posts = id ? readPosts() : null;
  const post = posts?.ok ? posts.value.find((record) => record.id === id) : null;
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  /** Validate emptiness only, then recheck the live session and target in the mutation helper. */
  function save(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!requiredText(title)) nextErrors.title = 'Title is required.';
    if (!requiredText(content)) nextErrors.content = 'Content is required.';
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;
    const actor = getSession();
    const result = id ? updatePost({ postId: id, title, content }, actor) : createPost({ title, content }, actor);
    if (!result.ok) {
      if (id && result.error.code === 'forbidden') {
        navigate('/blogs', { replace: true });
        return;
      }
      setError(result.error.message);
      return;
    }
    navigate(`/blog/${encodeURIComponent(result.value.id)}`);
  }

  if (id && !post) {
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
  if (id && !canManagePost(session, post)) return <Navigate to="/blogs" replace />;
  return (
    <section className="mx-auto max-w-3xl space-y-8 py-12" aria-labelledby="write-heading">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Your local writing desk</p>
        <h1 id="write-heading" className="font-display text-hero font-bold">{id ? 'Edit post' : 'Write a post'}</h1>
        <p className="text-foreground-muted">Plain text only. Keep sensitive information out of this demo.</p>
      </header>
      <form noValidate aria-label={id ? 'Edit post' : 'Write a post'} onSubmit={save} className="space-y-6">
        <FormField
          id="title"
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={errors.title}
        />
        <div className="space-y-2">
          <label htmlFor="content" className="block font-semibold">Content</label>
          <textarea
            id="content"
            name="content"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.content)}
            aria-describedby={errors.content ? 'content-error' : undefined}
            rows={12}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 leading-relaxed outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.content && (
            <p id="content-error" role="alert" className="text-sm text-error">{errors.content}</p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-error">{error}</p>
        )}
        <div className="flex flex-wrap items-center gap-6">
          <button type="submit" className={primaryButton}>{id ? 'Save changes' : 'Save post'}</button>
          <Link to={id ? `/blog/${encodeURIComponent(id)}` : '/blogs'} className={textLink}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}
WriteBlog.propTypes = { session: sessionType.isRequired };
