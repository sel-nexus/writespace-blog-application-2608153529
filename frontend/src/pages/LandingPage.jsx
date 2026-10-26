/** Public discovery of WriteSpace and the current browser's local post collection. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isSession, roleHome } from '../utils/auth';
import { isPosts, readStored } from '../utils/storage';
import { sortPosts } from '../utils/posts';
import { BlogCard } from '../components/BlogCard';
import { primaryButton, textLink } from '../components/FormField';
import { sessionType } from '../components/ProtectedRoute';

const features = [
  { title: 'Read local stories', description: 'Preview the latest posts in this browser, then sign in to read their full plain-text stories.' },
  { title: 'Make room for your words', description: 'A local account is your entry to writing and managing your own posts in this demo.' },
  { title: 'Keep the scope personal', description: 'Accounts and posts stay in this browser profile. Nothing is published to a shared collection or sent to a server.' },
];

/** Render discovery for guests and valid sessions without automatic navigation.
 * @param {object} props Optional browser-local session supplied by App.
 * @returns {JSX.Element} Hero, real feature cards and at most three local previews.
 */
export default function LandingPage({ session = null }) {
  const [collection] = useState(() => readStored('writespace_posts', isPosts, []));
  const latest = sortPosts(collection.ok ? collection.value : []).slice(0, 3);
  const signedIn = isSession(session);
  return (
    <div className="space-y-16 py-10 sm:py-16">
      <section aria-labelledby="landing-heading" className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-secondary">A space for the written word</p>
          <h1 id="landing-heading" className="font-display text-hero font-bold">Your words. Your space.</h1>
          <p className="max-w-xl text-xl leading-relaxed text-foreground-muted">
            Discover WriteSpace, a quiet place to read and write plain-text stories in your own browser.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {signedIn ? (
              <Link to={roleHome(session)} className={primaryButton}>
                {session.role === 'admin' ? 'Go to Admin Home' : 'Go to Reader Home'}
              </Link>
            ) : (
              <>
                <Link to="/register" className={primaryButton}>Get Started Free</Link>
                <Link to="/login" className={`${textLink} inline-flex min-h-11 items-center px-3`}>Start Reading</Link>
              </>
            )}
          </div>
        </div>
        <figure className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-editorial">
          <img
            src="/writing.jpg"
            alt="A typewriter ready for a page of writing"
            width="900"
            height="1100"
            fetchpriority="high"
            className="h-80 w-full object-cover sm:h-96 lg:h-[30rem]"
          />
          <figcaption className="bg-surface px-6 py-4 text-sm text-foreground-muted">Begin with a blank page.</figcaption>
        </figure>
      </section>
      <section aria-labelledby="features-heading" className="space-y-6">
        <h2 id="features-heading" className="font-display text-3xl font-bold">Simple by design. Local by nature.</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <article className="flex flex-col justify-center rounded-2xl bg-surface-raised p-8 md:col-span-2 lg:row-span-2 lg:p-10">
            <h3 className="font-display text-2xl font-bold sm:text-3xl">{features[0].title}</h3>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground-muted">{features[0].description}</p>
          </article>
          {features.slice(1).map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-bold">{feature.title}</h3>
              <p className="mt-3 leading-relaxed text-foreground-muted">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="latest-heading" className="space-y-6">
        <div className="space-y-2">
          <h2 id="latest-heading" className="font-display text-3xl font-bold">Latest local stories</h2>
          <p className="text-foreground-muted">Up to three recent posts from this profile, not a shared feed.</p>
        </div>
        {!collection.ok && (
          <p role="status" className="rounded-xl border border-border bg-warning-light p-4 text-warning">
            {collection.error.message} No local previews can be shown.
          </p>
        )}
        {latest.length ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="latest-posts">
            {latest.map((post, index) => (
              <BlogCard key={post.id} post={post} index={index} session={session} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-8">
            <p className="font-display text-xl font-bold">No local posts to preview yet.</p>
            <p className="mt-2 text-foreground-muted">Only posts saved in this browser appear here. No sample stories have been added.</p>
          </div>
        )}
      </section>
      <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-6">
        <Link to="/" className={textLink}>Discover WriteSpace</Link>
        {signedIn ? (
          <Link to={roleHome(session)} className={textLink}>
            {session.role === 'admin' ? 'Admin home' : 'Reader home'}
          </Link>
        ) : (
          <>
            <Link to="/login" className={textLink}>Sign in</Link>
            <Link to="/register" className={textLink}>Create account</Link>
          </>
        )}
      </nav>
    </div>
  );
}
LandingPage.propTypes = { session: sessionType };
