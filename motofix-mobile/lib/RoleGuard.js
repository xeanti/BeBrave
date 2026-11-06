import { useAuth } from './AuthContext';
import { normalizeMobileRole } from './authSession';

// RootNav owns restoration and access errors. A failed profile request must
// never redirect to login, and editable user metadata is not a source of roles.
export default function RoleGuard({ allowedRoles, children }) {
  const { role, loading, error } = useAuth();
  const allowed = allowedRoles.map(normalizeMobileRole).includes(role);
  return !loading && !error && allowed ? children : null;
}
