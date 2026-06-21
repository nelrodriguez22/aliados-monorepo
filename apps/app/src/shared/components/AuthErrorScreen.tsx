import { signOut } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import { ROUTES } from '@/shared/constants/routes';
import icono from '@/assets/icono.png';

// Pantalla de fallo de conexión durante el bootstrap de auth: da salida cuando el
// backend no responde (la sesión queda persistida pero sin perfil). Se renderiza
// FUERA del Router, por eso "Cerrar sesión" redirige con window.location.
export function AuthErrorScreen({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  const logout = useStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignoramos: igual limpiamos el store y redirigimos
    }
    logout();
    window.location.assign(ROUTES.LOGIN);
  };

  return (
    <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-dark-bg">
      <img src={icono} alt="Aliados" className="h-14 w-auto" />
      <h1 className="text-2xl font-bold text-slate-900 dark:text-dark-text">
        No pudimos conectar con el servidor
      </h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-dark-text-secondary">
        Revisá tu conexión e intentá de nuevo. Si el problema sigue, cerrá sesión y
        volvé a entrar.
      </p>
      <div className="mt-2 flex flex-col items-center gap-2 min-[375px]:flex-row">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
        >
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </button>
        <button
          onClick={handleLogout}
          className="cursor-pointer rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-dark-border dark:text-dark-text-secondary dark:hover:bg-dark-elevated"
        >
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}
