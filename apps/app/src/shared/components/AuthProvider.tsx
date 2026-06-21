import { useEffect, useState } from 'react';
import { useFirebaseAuth } from '@/shared/hooks/useFirebaseAuth';
import { useProfile } from '@/shared/hooks/useProfile';
import { useStore } from '@/shared/store/useStore';
import { ProfileError } from '@/shared/lib/fetchProfile';
import { AuthErrorScreen } from '@/shared/components/AuthErrorScreen';

// Spinner con texto demorado: si la espera supera ~3s, tranquiliza al usuario.
const Spinner = () => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-dark-bg">
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-600 dark:border-dark-brand border-t-transparent" />
      {slow && (
        <p className="px-6 text-center text-sm text-slate-500 dark:text-dark-text-secondary">
          Esto está tardando más de lo normal, por favor aguardá…
        </p>
      )}
    </div>
  );
};

/**
 * AuthProvider — Orquestador de 2 capas (Firebase + perfil backend)
 *
 * 1. Firebase resolviendo → Spinner
 * 2. Firebase sin usuario / sin email verificado / usuario nuevo → children
 * 3. Perfil falló por backend caído (timeout/server) → AuthErrorScreen (con salida)
 * 4. Perfil cargando → Spinner
 * 5. Perfil listo → children
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isLoading: firebaseLoading } = useFirebaseAuth();
  const { data: profile, isNewUser, isError, error, refetch, isFetching } =
    useProfile(firebaseUser);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const logout = useStore((s) => s.logout);

  useEffect(() => {
    if (!firebaseLoading && !firebaseUser && isAuthenticated) {
      logout();
    }
  }, [firebaseLoading, firebaseUser, isAuthenticated, logout]);

  // Error recuperable (backend caído/colgado): timeout o server.
  // NO unauthorized (ya desloguea) ni not-registered (va a onboarding).
  const isRecoverableError =
    isError &&
    error instanceof ProfileError &&
    (error.kind === 'timeout' || error.kind === 'server');

  if (firebaseLoading)             return <Spinner />;
  if (!firebaseUser)               return <>{children}</>;
  if (!firebaseUser.emailVerified) return <>{children}</>;
  if (isNewUser)                   return <>{children}</>;
  if (isRecoverableError)
    return <AuthErrorScreen onRetry={() => refetch()} retrying={isFetching} />;
  if (!profile)                    return <Spinner />;

  return <>{children}</>;
}
