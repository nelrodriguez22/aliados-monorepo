import { Outlet, Navigate } from "react-router-dom";
import { useStore } from "@/shared/store/useStore";
import { ROUTES } from "@/shared/constants/routes";

export function AuthLayout() {
  const { isAuthenticated, user } = useStore();

  if (isAuthenticated && user) {
    if (user.role === 'PROVIDER') return <Navigate to={ROUTES.PROVIDER.DASHBOARD} replace />;
    if (user.role === 'ADMIN')    return <Navigate to={`/${ROUTES.ADMIN}`} replace />;
    return <Navigate to={ROUTES.CLIENT.DASHBOARD} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-dark-bg text-slate-900 dark:text-dark-text">

      <div className="mt-4 px-6 pt-5">
        <a
          href={import.meta.env.VITE_LANDING_URL ?? '/'}
          className="inline-flex items-center rounded-xl border border-slate-200 dark:border-dark-border
            bg-white dark:bg-dark-surface px-4 py-2 text-sm font-medium
            text-slate-600 dark:text-dark-text-secondary
            transition hover:bg-slate-50 dark:hover:bg-dark-elevated cursor-pointer"
        >
          ← Volver al inicio
        </a>
      </div>

      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>

    </div>
  );
}
