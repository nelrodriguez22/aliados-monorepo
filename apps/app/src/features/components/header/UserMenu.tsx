import { useRef as useRef2, useState as useState2, useEffect as useEffect2 } from "react";
import { useNavigate as useNavigate2 } from "react-router-dom";
import { User, Briefcase, CreditCard, Settings, LogOut, Star } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { useStore as useStore2, useStore as useStore3 } from "@/shared/store/useStore";
import { ROUTES as ROUTES2 } from "@/shared/constants/routes";
import { tw as tw2 } from "@/shared/styles/design-system";
import toast from "react-hot-toast";
import { useQuery as useQuery2, useQueryClient as useQueryClient2 } from "@tanstack/react-query";
import { getToken as getToken2 } from "@/shared/lib/getToken";
import { Sun, Moon } from "lucide-react";

interface UserMenuProps { variant: 'client' | 'provider' | 'admin'; }

export function UserMenu({ variant }: UserMenuProps) {
  const navigate    = useNavigate2();
  const ref         = useRef2<HTMLDivElement>(null);
  const [show, setShow] = useState2(false);
  const user        = useStore2((s) => s.user);
  const logout      = useStore2((s) => s.logout);
  const isAuthenticated = useStore2((s) => s.isAuthenticated);
  const queryClient = useQueryClient2();
  const theme = useStore3((s) => s.theme);
  const setTheme = useStore3((s) => s.setTheme);
  const isDark = theme === 'dark';

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const { data: calificacionData } = useQuery2({
    queryKey: ['calificacion-promedio'],
    queryFn: async () => {
      const token = await getToken2();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/calificaciones/proveedor/promedio`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { promedio: 0, total: 0 };
      return res.json();
    },
    enabled: isAuthenticated && variant === 'provider',
    staleTime: 60000,
  });

  useEffect2(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const handleLogout = async () => {
    setShow(false);
    await signOut(auth);
    logout();
    [
      'auth-profile','trabajos-cliente','trabajos-pendientes','trabajo-activo',
      'trabajos-en-cola','trabajos-completados','calificacion-promedio','notificaciones-unread',
    ].forEach((k) => queryClient.removeQueries({ queryKey: [k] }));
    toast.success('Sesión cerrada');
    navigate(ROUTES2.LOGIN);
  };

  const go = (path: string) => {
    setShow(false);
    if (path.includes('?')) {
      const [pathname, search] = path.split('?');
      navigate({ pathname, search: `?${search}` });
    } else {
      navigate(path);
    }
  };

  // ── MenuItem ──
  const Item = ({ onClick, icon: Icon, label, meta }: {
    onClick: () => void; icon: React.ElementType; label: string; meta?: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-sm transition
        cursor-pointer ${tw2.text.secondary}
        hover:bg-slate-50 dark:hover:bg-dark-elevated hover:${tw2.text.primary}`}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      {meta}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShow(!show)}
        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition
          ${tw2.iconBg.brand} hover:opacity-80`}
      >
        <span className={`text-sm font-semibold text-brand-600 dark:text-dark-brand`}>{initials}</span>
      </button>

      {show && (
        <div className={`absolute right-0 top-11 z-20 w-60 ${tw2.dropdown}`}>

          {/* User info */}
          <div className={`px-4 py-3 border-b ${tw2.dividerLight}`}>
            <p className={`text-sm font-semibold truncate ${tw2.text.primary}`}>{user?.name}</p>
            <p className={`text-xs truncate ${tw2.text.muted}`}>{user?.email}</p>
          </div>

          {/* Items */}
          <div className="py-1">
          {/* Theme toggle — solo visible cuando el del header está oculto */}
            <div className="min-[425px]:hidden">
              <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-sm transition
                  cursor-pointer ${tw2.text.secondary}
                  hover:bg-slate-50 dark:hover:bg-dark-elevated`}
              >
                <div className="flex items-center gap-3">
                  {isDark ? <Moon className="h-4 w-4 shrink-0" /> : <Sun className="h-4 w-4 shrink-0" />}
                  <span>{isDark ? 'Modo oscuro' : 'Modo claro'}</span>
                </div>
                <div className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300
                  ${isDark ? 'bg-brand-500 dark:bg-dark-brand' : 'bg-slate-200'}`}>
                  <span className={`absolute top-0.75 left-0.75 flex h-4.5 w-4.5 items-center justify-center
                    rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-transform duration-300
                    ${isDark ? 'translate-x-5 text-slate-400' : 'translate-x-0 text-amber-500'}`}>
                    {isDark ? <Moon size={9} fill="currentColor" stroke="none" /> : <Sun size={10} />}
                  </span>
                </div>
              </button>
            </div>
            {variant === 'client' && (
              <>
                <Item onClick={() => go(ROUTES2.CLIENT.PROFILE)}                         icon={User}       label="Mi perfil" />
                <Item onClick={() => go(`${ROUTES2.CLIENT.DASHBOARD}?view=all`)}         icon={Briefcase}  label="Historial de trabajos" />
                <Item onClick={() => go(ROUTES2.CLIENT.PAYMENT_METHODS)}                 icon={CreditCard} label="Métodos de pago" />
                <Item onClick={() => go(ROUTES2.CLIENT.SETTINGS)}                        icon={Settings}   label="Configuración" />
              </>
            )}
            {variant === 'provider' && (
              <>
                <Item onClick={() => go(ROUTES2.PROVIDER.PROFILE)} icon={User} label="Mi perfil" />
                <Item
                  onClick={() => go(ROUTES2.PROVIDER.REVIEWS)}
                  icon={Star}
                  label="Mis reseñas"
                  meta={calificacionData?.total > 0 ? (
                    <span className={`text-[11px] ${tw2.text.faint}`}>
                      {Number(calificacionData.promedio).toFixed(1)} · {calificacionData.total}
                    </span>
                  ) : undefined}
                />
                <Item onClick={() => go(ROUTES2.PROVIDER.SETTINGS)} icon={Settings} label="Configuración" />
              </>
            )}
          </div>

          {/* Logout */}
          <div className={`border-t pt-1 pb-1 ${tw2.dividerLight}`}>
            <button
              onClick={handleLogout}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-red-500 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
