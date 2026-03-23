import { useEffect } from 'react';
import { useFirebaseAuth } from '@/shared/hooks/useFirebaseAuth';
import { useProfile } from '@/shared/hooks/useProfile';
import { useStore } from '@/shared/store/useStore';

const Spinner = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-dark-bg">
    <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-600 dark:border-dark-brand border-t-transparent" />
  </div>
);

/**
 * AuthProvider — Orquestador simple de 2 capas
 *
 * Flujo determinístico:
 * 1. Firebase resolviendo → Splash (spinner)
 * 2. Firebase sin usuario → render children (login/registro)
 * 3. Firebase con usuario, perfil cargando → Spinner
 * 4. Firebase con usuario, perfil listo → render children
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isLoading: firebaseLoading } = useFirebaseAuth();
  const profileQuery = useProfile(firebaseUser);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const logout = useStore((s) => s.logout);

  useEffect(() => {
    if (!firebaseLoading && !firebaseUser && isAuthenticated) {
      logout();
    }
  }, [firebaseLoading, firebaseUser, isAuthenticated, logout]);

  if (firebaseLoading)        return <Spinner />;
  if (!firebaseUser)          return <>{children}</>;

  // Si el email no está verificado, no bloqueamos — dejamos pasar
  if (!firebaseUser.emailVerified) return <>{children}</>;

  if (!profileQuery.data)     return <Spinner />;

  return <>{children}</>;
}
