/** Create and delete eligible browser-local demo accounts with honest persistence feedback. */
import { useState } from 'react';
import { BUILTIN_ADMIN, getSession } from '../utils/auth';
import { createUser, deleteUser, readUsers, requiredText } from '../utils/storage';
import { canManageUsers } from '../utils/permissions';
import { FormField, primaryButton } from '../components/FormField';
import { UserRow } from '../components/UserRow';
import { sessionType } from '../components/ProtectedRoute';

const emptyForm = { displayName: '', username: '', password: '', role: 'user' };
const fields = [['displayName', 'Display name'], ['username', 'Username'], ['password', 'Password']];

/** Manage the stored collection separately from the source-defined built-in identity.
 * @param {{session:import('../utils/auth').Session}} props Current navigation identity.
 * @returns {JSX.Element} Required form, responsive accounts and explicit demo/source disclosures.
 */
export default function UserManagement({ session }) {
  const [collection, setCollection] = useState(readUsers);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const users = collection.ok ? collection.value.filter((user) => user.id !== BUILTIN_ADMIN.userId) : [];
  const builtin = {
    id: BUILTIN_ADMIN.userId, displayName: BUILTIN_ADMIN.displayName,
    username: BUILTIN_ADMIN.username, role: BUILTIN_ADMIN.role,
  };

  /** Check live role before validation or persistence; passwords never enter feedback.
   * @param {import('react').FormEvent<HTMLFormElement>} event Activated form submission.
   * @returns {void} Display field errors or accepted-save feedback.
   */
  function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setErrors({});
    if (!canManageUsers(getSession())) {
      setError('Only an administrator can manage local accounts.');
      return;
    }
    const nextErrors = {};
    fields.forEach(([key, label]) => {
      if (!requiredText(form[key])) nextErrors[key] = `${label} is required.`;
    });
    if (!['user', 'admin'].includes(form.role)) nextErrors.role = 'Choose user or admin.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const result = createUser(form);
    if (!result.ok) {
      if (['duplicate', 'protected'].includes(result.error.code)) setErrors({ username: result.error.message });
      else setError(result.error.message);
      return;
    }
    setCollection(readUsers());
    setForm({ ...emptyForm });
    setSuccess('Account saved in this browser.');
  }

  /** Use one callback for both layouts and recheck role after the native confirmation.
   * @param {{id:string}} user Activated account target.
   * @param {boolean} isBuiltIn Source-only protection flag passed by UserRow.
   * @returns {void} Retain state on failure/cancel; refresh only after accepted deletion.
   */
  function requestDelete(user, isBuiltIn) {
    setError('');
    setSuccess('');
    const actor = getSession();
    if (!canManageUsers(actor)) {
      setError('Only an administrator can manage local accounts.');
      return;
    }
    if (isBuiltIn || user.id === BUILTIN_ADMIN.userId || user.id === actor.userId) {
      setError('This protected account cannot be deleted.');
      return;
    }
    const confirmed = window.confirm('Delete this local account?');
    const result = deleteUser({ targetUserId: user.id, confirmed, isBuiltIn }, getSession());
    if (!result.ok) setError(result.error.message);
    else if (result.value.deleted) {
      setCollection(readUsers());
      setSuccess('Account deleted in this browser.');
    }
  }

  return (
    <section className="space-y-8 py-12" aria-labelledby="users-heading">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-secondary">Local administration</p>
        <h1 id="users-heading" className="font-display text-hero font-bold">Manage Users</h1>
        <p className="max-w-3xl text-foreground-muted">
          Passwords are plaintext and demo administrator credentials are hard-coded. Data stays in this browser and is not shared.
          Client-side role guards are not real authorization. Never use real passwords, credentials or sensitive data.
        </p>
      </header>
      <form onSubmit={submit} noValidate aria-label="Create local account" className="space-y-5 rounded-2xl bg-surface p-6">
        <h2 className="font-display text-2xl font-bold">Create account</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <FormField
              key={key}
              id={`account-${key}`}
              label={label}
              value={form[key]}
              type={key === 'password' ? 'password' : 'text'}
              autoComplete={key === 'password' ? 'new-password' : 'off'}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              error={errors[key]}
            />
          ))}
          <div className="space-y-2">
            <label htmlFor="account-role" className="block font-semibold">Role</label>
            <select
              id="account-role"
              name="role"
              required
              aria-required="true"
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'account-role-error' : undefined}
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 py-3 focus:ring-2 focus:ring-ring"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            {errors.role && (
              <p id="account-role-error" role="alert" className="text-sm text-error">{errors.role}</p>
            )}
          </div>
        </div>
        <button type="submit" className={primaryButton}>Create account</button>
      </form>
      {error && (
        <p role="alert" className="text-error">{error}</p>
      )}
      {success && (
        <p role="status" className="text-success">{success}</p>
      )}
      <section className="space-y-4" aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="font-display text-3xl font-bold">Local accounts</h2>
        <p className="text-sm text-foreground-muted">
          The built-in administrator is source-defined, not a stored account. Built-in and active accounts have disabled delete actions.
          The source does not specify the built-in delete tooltip copy; it remains a product clarification, not invented wording.
        </p>
        {!collection.ok && (
          <p role="status">{collection.error.message} Stored accounts cannot be shown.</p>
        )}
        {users.length === 0 && (
          <p className="text-foreground-muted">No stored local accounts yet.</p>
        )}
        <div data-testid="users-desktop" className="hidden overflow-x-auto rounded-2xl border border-border bg-surface sm:block">
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">Local accounts</caption>
            <thead>
              <tr>
                {['Display name', 'Username', 'Role', 'Created', 'Actions'].map((label) => (
                  <th key={label} scope="col" className="p-4">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <UserRow user={builtin} activeUserId={session.userId} isBuiltIn onDelete={requestDelete} />
              {users.map((user) => (
                <UserRow key={user.id} user={user} activeUserId={session.userId} onDelete={requestDelete} />
              ))}
            </tbody>
          </table>
        </div>
        <div data-testid="users-mobile" className="space-y-4 sm:hidden">
          <UserRow user={builtin} activeUserId={session.userId} isBuiltIn mobile onDelete={requestDelete} />
          {users.map((user) => (
            <UserRow key={user.id} user={user} activeUserId={session.userId} mobile onDelete={requestDelete} />
          ))}
        </div>
      </section>
    </section>
  );
}
UserManagement.propTypes = { session: sessionType.isRequired };
