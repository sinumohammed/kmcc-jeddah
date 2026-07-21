import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import type { Role } from '../types';

export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { token, member } = useAuthStore();

  if (!token || !member) {
    return <Navigate to="/login" replace />;
  }
  if (allow && !allow.includes(member.role)) {
    return <Navigate to={member.role === 'ADMIN' ? '/dashboard' : '/profile'} replace />;
  }
  return <Outlet />;
}
