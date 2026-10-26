/** Accept demo credentials and navigate only after the browser accepts a session. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { login, roleHome } from '../utils/auth';
import { requiredText } from '../utils/storage';
import { FormField, primaryButton, textLink } from '../components/FormField';

/** Render required-field and persistence feedback without exposing submitted credentials. @returns {JSX.Element} */
export default function LoginPage({ onSessionChange }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const navigate = useNavigate();

  /** Validate on submit, then use the local authentication result. */
  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!requiredText(form.username)) nextErrors.username = 'Username is required.';
    if (!requiredText(form.password)) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;
    const result = login(form);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSessionChange(result.value);
    navigate(roleHome(result.value), { replace: true });
  }

  /** Update only the activated form input. */
  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  return (
    <section aria-labelledby="login-heading" className="mx-auto grid max-w-5xl gap-10 py-8 md:grid-cols-2 md:gap-16 md:py-16">
      <div className="space-y-6 md:pt-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Your local writing space</p>
        <h1 id="login-heading" className="font-display text-hero font-bold text-foreground">Welcome back.</h1>
        <p className="max-w-sm text-lg text-foreground-muted">Sign in to your account in this browser. Your session stays here, on this device.</p>
        <p className="rounded-xl bg-primary-light p-5 text-primary">
          Try the built-in demo: username{' '}
          <strong>admin</strong>
          , password{' '}
          <strong>admin</strong>
          .
        </p>
      </div>
      <form noValidate onSubmit={submit} aria-label="Sign in" className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-editorial sm:p-8">
        <FormField id="username" label="Username" value={form.username} onChange={change} autoComplete="username" error={errors.username} />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={form.password}
          onChange={change}
          autoComplete="current-password"
          error={errors.password}
        />
        {error && (
          <p role="alert" className="rounded-xl bg-error-light p-4 text-error">{error}</p>
        )}
        <button type="submit" className={`${primaryButton} w-full`}>Sign in</button>
        <p className="text-center text-foreground-muted">
          New here?{' '}
          <Link to="/register" className={textLink}>Create an account</Link>
        </p>
      </form>
    </section>
  );
}
LoginPage.propTypes = { onSessionChange: PropTypes.func.isRequired };
