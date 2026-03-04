import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { useStore } from "@/shared/store/useStore";
import { formatDateTime } from "@/shared/lib/dayjs";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";

interface NotifDropdownProps { isClient: boolean; }

export function NotificationsDropdown({ isClient }: NotifDropdownProps) {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const ref         = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  const { data: unreadData } = useQuery({
    queryKey: ['notificaciones-unread'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/notificaciones/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  const { data: notificaciones = [] } = useQuery({
    queryKey: ['notificaciones-preview'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/notificaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return (await res.json()).slice(0, 5);
    },
    enabled: isAuthenticated && show,
  });

  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const marcarLeidas = async () => {
    try {
      const token = await getToken();
      await fetch(`${import.meta.env.VITE_API_URL}/api/notificaciones/leer-todas`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.setQueryData(['notificaciones-unread'], { count: 0 });
      queryClient.invalidateQueries({ queryKey: ['notificaciones-preview'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    } catch {}
  };

  const handleToggle = () => {
    const opening = !show;
    setShow(opening);
    if (opening && unreadCount > 0) marcarLeidas();
  };

  const handleClick = (notificacion?: any) => {
    setShow(false);
    if (notificacion?.actionUrl) navigate(notificacion.actionUrl);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={handleToggle}
        className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition
          ${tw.text.secondary} hover:bg-slate-100 dark:hover:bg-dark-elevated`}
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center
            rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {show && (
        <div className={`absolute right-0 top-11 z-20 w-80 ${tw.dropdown}`}>

          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${tw.dividerLight}`}>
            <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Notificaciones</h3>
            {unreadCount > 0 && (
              <span className="text-xs font-medium text-brand-600 dark:text-dark-brand">
                {unreadCount} sin leer
              </span>
            )}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell className={`h-7 w-7 ${tw.text.faint}`} />
                <p className={`text-xs ${tw.text.muted}`}>Sin notificaciones</p>
              </div>
            ) : notificaciones.map((n: any) => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`cursor-pointer border-b px-4 py-3 transition last:border-0 ${tw.dividerLight}
                  hover:bg-slate-50 dark:hover:bg-dark-elevated
                  ${!n.leida ? 'bg-brand-50/60 dark:bg-dark-brand/5' : ''}`}
              >
                <div className="flex items-start gap-2.5">
                  {!n.leida && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  )}
                  <div className={!n.leida ? '' : 'pl-4'}>
                    <p className={`text-xs font-semibold leading-snug ${tw.text.primary}`}>{n.titulo}</p>
                    <p className={`mt-0.5 text-xs leading-snug ${tw.text.secondary}`}>{n.mensaje}</p>
                    <p className={`mt-1 text-[10px] ${tw.text.faint}`}>{formatDateTime(n.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className={`border-t px-4 py-2.5 ${tw.dividerLight}`}>
            <button
              onClick={() => handleClick({ actionUrl: isClient ? ROUTES.CLIENT.NOTIFICATIONS : ROUTES.PROVIDER.NOTIFICATIONS })}
              className={`w-full text-center text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
            >
              Ver todas las notificaciones
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
