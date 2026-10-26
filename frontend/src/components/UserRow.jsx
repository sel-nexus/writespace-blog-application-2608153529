/** Render only non-secret account identity fields in either responsive presentation. */
import PropTypes from 'prop-types';
import { formatPostDate } from '../utils/posts';

/** Share deletion activation and protection rules between table rows and mobile cards.
 * @param {object} props Responsive account presentation.
 * @param {{id:string,displayName:string,username:string,role:string,createdAt?:string}} props.user Non-secret identity fields.
 * @param {string} props.activeUserId Current actor ID, protected against self-delete.
 * @param {boolean} [props.isBuiltIn=false] Source-defined identity flag, never persisted.
 * @param {boolean} [props.mobile=false] Render a card instead of a table row.
 * @param {function(object,boolean):void} props.onDelete Shared activation callback.
 * @returns {JSX.Element} No password or fabricated built-in timestamp is displayed.
 */
export function UserRow({ user, activeUserId, isBuiltIn = false, mobile = false, onDelete }) {
  const disabled = isBuiltIn || user.id === 'builtin-admin' || user.id === activeUserId;
  const date = isBuiltIn ? 'Source-defined account' : formatPostDate(user.createdAt);
  const action = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Delete ${user.displayName}`}
      onClick={() => onDelete(user, isBuiltIn)}
      className="min-h-11 rounded px-3 py-2 text-error underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      Delete
    </button>
  );
  if (mobile) {
    return (
      <article className="space-y-3 rounded-2xl border border-border bg-surface p-5" aria-label={user.displayName}>
        <h3 className="break-words font-display text-xl font-bold">{user.displayName}</h3>
        <dl className="space-y-2 break-words text-foreground-muted">
          <div>
            <dt className="font-semibold">Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt className="font-semibold">Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div>
            <dt className="font-semibold">Created</dt>
            <dd>{date}</dd>
          </div>
        </dl>
        {action}
      </article>
    );
  }
  return (
    <tr className="border-t border-border">
      <th scope="row" className="break-words p-4 text-left font-semibold">{user.displayName}</th>
      <td className="break-words p-4">{user.username}</td>
      <td className="p-4">{user.role}</td>
      <td className="p-4">{date}</td>
      <td className="p-4">{action}</td>
    </tr>
  );
}
UserRow.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'admin']).isRequired,
    createdAt: PropTypes.string,
  }).isRequired,
  activeUserId: PropTypes.string.isRequired,
  isBuiltIn: PropTypes.bool,
  mobile: PropTypes.bool,
  onDelete: PropTypes.func.isRequired,
};
