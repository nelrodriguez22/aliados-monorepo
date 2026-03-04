import { Navigate, Outlet } from 'react-router-dom';
import { useStore } from '@/shared/store/useStore';
import { ROUTES } from '@/shared/constants/routes';

type Props = {
  allowedRoles: ('CLIENT' | 'PROVIDER' | 'ADMIN')[];
};

export function ProtectedRoute({ allowedRoles }: Props) {
  const user = useStore((s) => s.user);
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  // No autenticado → login
  if (!isAuthenticated || !user) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Rol no permitido → redirigir a su dashboard
  if (!allowedRoles.includes(user.role)) {
    if (user.role === 'PROVIDER') return <Navigate to={ROUTES.PROVIDER.DASHBOARD} replace />;
    if (user.role === 'ADMIN') return <Navigate to={`/${ROUTES.ADMIN}`} replace />;
    return <Navigate to={ROUTES.CLIENT.DASHBOARD} replace />;
  }

  return <Outlet />;
}
