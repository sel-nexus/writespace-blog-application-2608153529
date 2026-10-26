/** Compose the browser-local discovery, accounts, posts and administration routes. */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getSession, roleHome } from './utils/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicNavbar } from './components/PublicNavbar';
import { Navbar } from './components/Navbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import ReadBlog from './pages/ReadBlog';
import WriteBlog from './pages/WriteBlog';
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';

/** Restore session state and update it only after accepted persistence operations. @returns {JSX.Element} */
export default function App() {
  const [session, setSession] = useState(getSession);
  const { pathname } = useLocation();
  const entry = session ? roleHome(session) : '/login';
  useEffect(() => {
    const titles = {
      '/': 'Discover', '/login': 'Sign in', '/register': 'Create account',
      '/blogs': 'Reader home', '/admin': 'Administrator home', '/users': 'Manage Users',
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
          Demo administrator credentials are hard-coded. Never use real passwords, credentials or sensitive data.
          Client-side role guards are bypassable; accounts are not shared or backed up.
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
                <Home session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="/blog/:id" element={
            <ProtectedRoute session={session}>
              {session && (
                <ReadBlog key={pathname} session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="/write" element={
            <ProtectedRoute session={session}>
              {session && (
                <WriteBlog key={pathname} session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="/edit/:id" element={
            <ProtectedRoute session={session}>
              {session && (
                <WriteBlog key={pathname} session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute session={session} adminOnly>
              {session && (
                <AdminDashboard session={session} />
              )}
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute session={session} adminOnly>
              {session && (
                <UserManagement session={session} />
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
