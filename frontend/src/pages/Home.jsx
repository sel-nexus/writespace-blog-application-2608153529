/** Browse all browser-local posts, using the shared stable ordering and preview cards. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { readPosts } from '../utils/storage';
import { sortPosts } from '../utils/posts';
import { BlogCard } from '../components/BlogCard';
import { sessionType } from '../components/ProtectedRoute';
import { primaryButton } from '../components/FormField';

/** Render the collection without writing or navigating on mount. @returns {JSX.Element} */
export default function Home({ session }) {
  const [loaded] = useState(readPosts);
  const posts = sortPosts(loaded.ok ? loaded.value : []);
  return (
    <section className="space-y-8 py-12" aria-labelledby="collection-heading">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Stories in this browser</p>
        <h1 id="collection-heading" className="font-display text-hero font-bold">Reader home</h1>
        <h2 className="break-words font-display text-2xl font-bold">Welcome, {session.displayName}.</h2>
        <p className="text-foreground-muted">Read local stories or make room for your own words.</p>
      </header>
      {!loaded.ok && (
        <p role="status" className="rounded-xl border border-border bg-surface p-4 text-foreground-muted">
          {loaded.error.message}
        </p>
      )}
      {posts.length ? (
        <div data-testid="all-posts" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <BlogCard key={post.id} post={post} index={index} session={session} />
          ))}
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-8">
          <p className="text-lg text-foreground-muted">No local posts to read yet.</p>
          <Link to="/write" className={`${primaryButton} inline-flex`}>Write</Link>
        </div>
      )}
    </section>
  );
}
Home.propTypes = { session: sessionType.isRequired };
