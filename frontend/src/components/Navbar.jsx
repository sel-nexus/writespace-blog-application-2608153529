/** Present role-aware links and honest, activation-only local sign-out. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, roleHome } from '../utils/auth';
import { Avatar } from './Avatar';
import { sessionType } from './ProtectedRoute';
import { navClass, navControl } from './PublicNavbar';

/** Keep the signed-in view intact if removing the session fails. @returns {JSX.Element} */
export function Navbar({ session, onSessionChange }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  /** Remove the session only after the user activates sign-out. */
  function logout() {
    const result = clearSession();
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSessionChange(null);
    setOpen(false);
    navigate('/', { replace: true });
  }

  return (
    <header className="border-b border-border bg-surface">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          to={roleHome(session)}
          aria-label="WriteSpace."
          className={`${navControl} font-display text-2xl font-bold text-primary`}
          onClick={() => setOpen(false)}
        >
          WriteSpace
          <span aria-hidden="true" className="text-secondary">.</span>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="account-menu"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          onClick={() => setOpen(!open)}
          className={`${navControl} border border-border sm:hidden`}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        <div id="account-menu" className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center`}>
          <NavLink to="/blogs" className={navClass} onClick={() => setOpen(false)}>
            Reader home
          </NavLink>
          {session.role === 'admin' && (
            <NavLink to="/admin" className={navClass} onClick={() => setOpen(false)}>
              Admin home
            </NavLink>
          )}
          <div className="flex items-center gap-3 px-4 py-2">
            <Avatar displayName={session.displayName} />
            <span className="max-w-48 break-words">{session.displayName}</span>
          </div>
          <button type="button" onClick={logout} className={`${navControl} text-primary hover:bg-primary-light`}>
            Sign out
          </button>
        </div>
      </nav>
      {error && (
        <p role="alert" className="mx-auto max-w-6xl px-8 pb-4 text-error">
          {error}
        </p>
      )}
    </header>
  );
}
Navbar.propTypes = { session: sessionType.isRequired, onSessionChange: PropTypes.func.isRequired };
