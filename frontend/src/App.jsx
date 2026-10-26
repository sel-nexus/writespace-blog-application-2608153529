/** Compose public discovery, account routes and interim role homes with local session state. */
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getSession, roleHome } from './utils/auth';
import { ProtectedRoute, sessionType } from './components/ProtectedRoute';
import { PublicNavbar } from './components/PublicNavbar';
import { Navbar } from './components/Navbar';
import { Avatar } from './components/Avatar';
import { textLink } from './components/FormField';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';

/** Show the persisted identity without inventing later blog or administration pages. @returns {JSX.Element} */
function RoleHome({ session }) {
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-12" aria-labelledby="home-heading">
      <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Browser-local session</p>
      <h1 id="home-heading" className="font-display text-hero font-bold">
        {session.role === 'admin' ? 'Administrator home' : 'Reader home'}
      </h1>
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-6 shadow-editorial">
        <Avatar displayName={session.displayName} />
        <div className="min-w-0 space-y-1 break-words">
          <h2 className="font-display text-2xl font-bold">Welcome, {session.displayName}.</h2>
          <p className="text-foreground-muted">Signed in as {session.username} · Role: {session.role}</p>
        </div>
      </div>
      <p className="text-lg text-foreground-muted">
        Your account and session are ready in this browser. This account slice does not yet include reading, writing or account administration.
      </p>
      {session.role === 'admin' && (
        <Link to="/blogs" className={textLink}>Visit reader home</Link>
      )}
    </section>
  );
}
RoleHome.propTypes = { session: sessionType.isRequired };

/** Restore session state and update it only after accepted persistence operations. @returns {JSX.Element} */
export default function App() {
  const [session, setSession] = useState(getSession);
  const { pathname } = useLocation();
  const entry = session ? roleHome(session) : '/login';
  useEffect(() => {
    const titles = {
      '/': 'Discover', '/login': 'Sign in', '/register': 'Create account',
      '/blogs': 'Reader home', '/admin': 'Administrator home',
    };
    document.title = `${titles[pathname] || 'Local writing demo'} | WriteSpace`;
  }, [pathname]);
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <a href="#main" className="sr-only rounded bg-surface p-3 focus:not-sr-only focus:absolute focus:z-10 focus:ring-2 focus:ring-ring">
        Skip to content
      </a>
      {session ? (
        <Navbar session={session} onSessionChange={setSession} />
      ) : (
        <PublicNavbar />
      )}
      <aside aria-label="Demo limitations" className="border-b border-border bg-warning-light">
        <p className="mx-auto max-w-6xl px-5 py-4 text-sm leading-relaxed text-warning sm:px-8">
          <strong>Non-secure local demo.</strong> Passwords are stored in plaintext in this browser profile.
          Never use real passwords or sensitive data. Client-side role guards are bypassable; accounts are not shared or backed up.
        </p>
      </aside>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
        <Routes>
          <Route path="/" element={
            <LandingPage session={session} />
          } />
          <Route path="/login" element={session ? (
            <Navigate to={entry} replace />
          ) : (
            <LoginPage onSessionChange={setSession} />
          )} />
          <Route path="/register" element={session ? (
            <Navigate to={entry} replace />
          ) : (
            <RegisterPage onSessionChange={setSession} />
          )} />
          <Route path="/blogs" element={
            <ProtectedRoute session={session}>
              {session && (
                <RoleHome session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute session={session} adminOnly>
              {session && (
                <RoleHome session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="*" element={
            <Navigate to={entry} replace />
          } />
        </Routes>
      </main>
      <footer className="mx-auto max-w-6xl border-t border-border px-5 py-6 text-sm text-foreground-muted sm:px-8">
        WriteSpace · Data stays in this profile. Clearing browser storage removes it. No recovery or cross-tab merge is guaranteed.
      </footer>
    </div>
  );
}
