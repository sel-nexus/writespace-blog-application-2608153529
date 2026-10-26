/** Present activated guest navigation with a responsive disclosure menu. */
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

export const navControl = 'min-h-11 rounded-full px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Style active navigation links using semantic colors. @returns {string} */
export function navClass({ isActive }) {
  return `${navControl} ${isActive ? 'bg-primary-light text-primary' : 'text-foreground hover:bg-surface-raised'}`;
}

/** Render guest links; toggling never navigates until a link is activated. @returns {JSX.Element} */
export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <header className="border-b border-border bg-surface">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          to="/"
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
          aria-controls="public-menu"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          onClick={() => setOpen(!open)}
          className={`${navControl} border border-border sm:hidden`}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        <div id="public-menu" className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row`}>
          <NavLink to="/login" className={navClass} onClick={() => setOpen(false)}>
            Sign in
          </NavLink>
          <NavLink to="/register" className={navClass} onClick={() => setOpen(false)}>
            Create account
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
