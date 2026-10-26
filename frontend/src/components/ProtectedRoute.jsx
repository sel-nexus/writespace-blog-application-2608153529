/** Gate client routes using complete session shapes; these guards are not security controls. */
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { isSession } from '../utils/auth';

/** Render children or the documented guest/role redirect. @returns {JSX.Element} */
export function ProtectedRoute({ children, adminOnly = false, session }) {
  if (!isSession(session)) return (
    <Navigate to="/login" replace />
  );
  if (adminOnly && session.role !== 'admin') return (
    <Navigate to="/blogs" replace />
  );
  return children;
}

export const sessionType = PropTypes.shape({
  userId: PropTypes.string.isRequired,
  username: PropTypes.string.isRequired,
  displayName: PropTypes.string.isRequired,
  role: PropTypes.oneOf(['user', 'admin']).isRequired,
});
ProtectedRoute.propTypes = {
  children: PropTypes.node,
  adminOnly: PropTypes.bool,
  session: sessionType,
};
