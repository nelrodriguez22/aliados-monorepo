import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "@/shared/store/useStore";
import logoConTexto from "@/assets/logocontexto.png";
import { useInstallPWA } from "@/shared/hooks/useInstallPwa";
import { ROUTES } from "@/shared/constants/routes";
import { NotificationsDropdown } from "@/features/components/header/NotificationsDropdown";
import { UserMenu } from "@/features/components/header/UserMenu";
import { ProviderStatusToggle } from "@/features/components/header/ProviderStatusToggle";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { ChatWindow, FaqModal, BugReportWindow } from "@/shared/components/FloatingActions";
import { Download, MoreVertical, CircleHelp, Bug, Bot } from "lucide-react";

export function Header() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { isInstallable, install } = useInstallPWA();
  const user            = useStore((state) => state.user);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [faqOpen,  setFaqOpen]  = useState(false);
  const [bugOpen,  setBugOpen]  = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
            <span className="relative">
              <img src={logoConTexto} alt="Aliados" className="h-10 w-auto" width={160} height={40} />
              {/* Superíndice "beta" sobre el wordmark; no compite con el pill Pro (que va al costado). */}
              <span className="absolute -top-0.5 right-0 text-[9px] font-bold uppercase leading-none tracking-wide text-brand-500 dark:text-dark-brand">
                beta
              </span>
            </span>
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

            {/* Menú rápido mobile — solo en cliente/proveedor */}
            {(isClient || isProvider) && (
              <div className="relative sm:hidden" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  aria-label="Más opciones"
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-colors
                    text-slate-500 dark:text-dark-text-secondary
                    hover:bg-slate-100 dark:hover:bg-dark-elevated hover:text-brand-600 dark:hover:text-dark-brand
                    ${menuOpen ? 'bg-slate-100 dark:bg-dark-elevated text-brand-600 dark:text-dark-brand' : ''}`}
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-dark-border dark:bg-dark-surface z-50">
                    {[
                      { icon: CircleHelp, label: "Preguntas frecuentes", action: () => { setFaqOpen(true);  setMenuOpen(false); } },
                      { icon: Bug,        label: "Reportar un bug",       action: () => { setBugOpen(true);  setMenuOpen(false); } },
                      { icon: Bot,        label: "Asistente",             action: () => { setChatOpen(true); setMenuOpen(false); } },
                    ].map(({ icon: Icon, label, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-dark-text transition-colors hover:bg-slate-50 dark:hover:bg-dark-elevated border-b border-slate-100 dark:border-dark-border last:border-0 cursor-pointer"
                      >
                        <Icon className="h-4 w-4 text-slate-400 dark:text-dark-text-secondary shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

      {faqOpen  && <FaqModal        onClose={() => setFaqOpen(false)}  />}
      {bugOpen  && <BugReportWindow onClose={() => setBugOpen(false)}  />}
      {chatOpen && <ChatWindow      onClose={() => setChatOpen(false)} />}
    </>
  );
}
