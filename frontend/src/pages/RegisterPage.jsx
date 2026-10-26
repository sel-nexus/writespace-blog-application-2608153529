/** Create user-only demo accounts and disclose a saved-account/failed-session partial outcome. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { register, roleHome } from '../utils/auth';
import { requiredText } from '../utils/storage';
import { FormField, primaryButton, textLink } from '../components/FormField';

const fields = [
  { id: 'displayName', label: 'Display name', autoComplete: 'nickname' },
  { id: 'username', label: 'Username', autoComplete: 'username' },
  { id: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { id: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
];

/** Validate the required form and keep failures on a safe guest view. @returns {JSX.Element} */
export default function RegisterPage({ onSessionChange }) {
  const [form, setForm] = useState({ displayName: '', username: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);
  const navigate = useNavigate();

  /** Validate field associations before calling registration. */
  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    fields.forEach(({ id, label }) => {
      if (!requiredText(form[id])) nextErrors[id] = `${label} is required.`;
    });
    if (requiredText(form.confirmPassword) && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;
    const result = register(form);
    if (!result.ok) {
      if (['duplicate', 'protected'].includes(result.error.code)) setErrors({ username: result.error.message });
      else setError(result.error.message);
      setAccountCreated(Boolean(result.accountCreated));
      return;
    }
    onSessionChange(result.value);
    navigate(roleHome(result.value), { replace: true });
  }

  /** Preserve entered values rather than normalizing demo credentials. */
  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  return (
    <section aria-labelledby="register-heading" className="mx-auto grid max-w-5xl gap-10 py-8 md:grid-cols-2 md:gap-16 md:py-12">
      <div className="space-y-6 md:pt-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Make room for your words</p>
        <h1 id="register-heading" className="font-display text-hero font-bold text-foreground">Create your account.</h1>
        <p className="max-w-sm text-lg text-foreground-muted">A reader account for this browser profile only. Use a made-up name and a demo password.</p>
        <p className="text-foreground-muted">
          Already have a local account?{' '}
          <Link to="/login" className={textLink}>Go to sign in</Link>
        </p>
      </div>
      <form
        noValidate
        onSubmit={submit}
        aria-label="Create account"
        className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-editorial sm:p-8"
      >
        {fields.map((field) => (
          <FormField key={field.id} {...field} value={form[field.id]} onChange={change} error={errors[field.id]} />
        ))}
        {error && (
          <p role="alert" className="rounded-xl bg-error-light p-4 text-error">{error}</p>
        )}
        {accountCreated ? (
          <Link to="/login" className={`${primaryButton} block text-center`}>Go to sign in</Link>
        ) : (
          <button type="submit" className={`${primaryButton} w-full`}>Create account</button>
        )}
      </form>
    </section>
  );
}
RegisterPage.propTypes = { onSessionChange: PropTypes.func.isRequired };
