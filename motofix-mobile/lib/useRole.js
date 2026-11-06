import { useAuth } from './AuthContext';

export function useRole() {
  const { role, loading } = useAuth();
  return { role, loading };
}
