import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "@/shared/store/useStore";
import logoConTexto from "@/assets/logocontexto.png";
import { useInstallPWA } from "@/shared/hooks/useInstallPwa";
import { ROUTES } from "@/shared/constants/routes";
import { NotificationsDropdown } from "@/features/components/header/NotificationsDropdown";
import { UserMenu } from "@/features/components/header/UserMenu";
import { ProviderStatusToggle } from "@/features/components/header/ProviderStatusToggle";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { Download } from "lucide-react";

export function Header() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { isInstallable, install } = useInstallPWA();
  const user            = useStore((state) => state.user);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  const isClient   = location.pathname.startsWith(`/${ROUTES.CLIENT.ROOT}`);
  const isProvider = location.pathname.startsWith(`/${ROUTES.PROVIDER.ROOT}`);
  const isAdmin    = location.pathname.startsWith(`/${ROUTES.ADMIN}`);
  const isPublic   = !isClient && !isProvider && !isAdmin;

  const handleLogoClick = () => {
    if (isClient)   navigate(ROUTES.CLIENT.DASHBOARD);
    else if (isProvider) navigate(ROUTES.PROVIDER.DASHBOARD);
    else navigate(ROUTES.HOME);
  };

  const handleDashboardRedirect = () => {
    if (!user) return;
    if (user.role === 'PROVIDER')   navigate(ROUTES.PROVIDER.DASHBOARD);
    else if (user.role === 'ADMIN') navigate(`/${ROUTES.ADMIN}`);
    else navigate(ROUTES.CLIENT.DASHBOARD);
  };

  return (
    <>
      {/* Spacer para compensar el header fixed */}
      <div className="h-16" />

      <header className="
        fixed top-0 left-0 right-0 z-50
        flex h-16 items-center
        border-b border-slate-200/70 dark:border-dark-border
        bg-white/60 dark:bg-dark-bg/60
        backdrop-blur-xl
        transition-colors duration-200
      ">
          <div className="flex w-full items-center justify-between px-3 sm:px-6 max-w-7xl mx-auto">

          {/* Logo */}
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={handleLogoClick}
          >
            <img src={logoConTexto} alt="Aliados" className="h-10 w-auto" />
            {isProvider && (
              <span className="rounded-full bg-brand-100 dark:bg-dark-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-600 dark:text-dark-brand">
                Pro
              </span>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1.5 min-[425px]:gap-3">

            <span className="hidden min-[425px]:inline-flex">
              <ThemeToggle />
            </span>

            {isInstallable && (
              <button
                onClick={install}
                className="
                  hidden sm:flex items-center gap-1.5
                  cursor-pointer rounded-full border border-slate-200 dark:border-dark-border
                  px-4 py-1.5 text-xs font-medium
                  text-slate-600 dark:text-dark-text-secondary
                  transition hover:border-brand-400 hover:text-brand-600
                  dark:hover:border-dark-brand dark:hover:text-dark-brand
                "
              >
                <Download className="h-3.5 w-3.5" />
                Instalar
              </button>
            )}

            {/* Público */}
            {isPublic && (
              isAuthenticated && user ? (
                <button
                  onClick={handleDashboardRedirect}
                  className="cursor-pointer rounded-full bg-brand-600 dark:bg-dark-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
                >
                  Ir al dashboard
                </button>
              ) : (
                <button
                  onClick={() => navigate(ROUTES.LOGIN)}
                  className="cursor-pointer rounded-full bg-brand-600 dark:bg-dark-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
                >
                  Iniciar sesión
                </button>
              )
            )}

            {/* Cliente */}
            {isClient && (
              <>
                <NotificationsDropdown isClient />
                <UserMenu variant="client" />
              </>
            )}

            {/* Admin */}
            {isAdmin && <UserMenu variant="admin" />}

            {/* Provider */}
            {isProvider && (
              <>
                <ProviderStatusToggle />
                <NotificationsDropdown isClient={false} />
                <UserMenu variant="provider" />
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
