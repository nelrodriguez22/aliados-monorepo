import { useNavigate as useNavigate3, useLocation } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw as tw3 } from "@/shared/styles/design-system";
import { Bell as BellIcon, CheckCheck, Loader2 } from "lucide-react";
import { ROUTES as ROUTES3 } from "@/shared/constants/routes";
import { useQuery as useQuery3, useMutation, useQueryClient as useQueryClient3 } from "@tanstack/react-query";
import { getToken as getToken3 } from "@/shared/lib/getToken";
import { formatDateTime as formatDateTime3 } from "@/shared/lib/dayjs";
import { useState as useState3 } from "react";

interface Notificacion {
  id: number; tipo: string; titulo: string; mensaje: string;
  trabajoId: number | null; actionUrl: string | null;
  leida: boolean; createdAt: string;
}

const TIPO_CONFIG: Record<string, { bg: string; color: string }> = {
  NUEVO_TRABAJO:                 { bg: tw3.iconBg.brand,  color: 'text-brand-600 dark:text-dark-brand' },
  PROVEEDOR_ASIGNADO:            { bg: tw3.iconBg.green,  color: 'text-green-600 dark:text-green-400' },
  TRABAJO_COMPLETADO:            { bg: tw3.iconBg.amber,  color: 'text-amber-600 dark:text-amber-400' },
  CALIFICACION_RECIBIDA:         { bg: tw3.iconBg.amber,  color: 'text-amber-600 dark:text-amber-400' },
  TRABAJO_COMPLETADO_PROVEEDOR:  { bg: tw3.iconBg.green,  color: 'text-green-600 dark:text-green-400' },
};

export function Notifications() {
  const navigate    = useNavigate3();
  const location    = useLocation();
  const queryClient = useQueryClient3();
  const [filter, setFilter] = useState3<"all" | "unread">("all");

  const isClient    = location.pathname.startsWith(`/${ROUTES3.CLIENT.ROOT}`);
  const dashboardUrl = isClient ? ROUTES3.CLIENT.DASHBOARD : ROUTES3.PROVIDER.DASHBOARD;

  const { data: notificaciones = [], isLoading } = useQuery3<Notificacion[]>({
    queryKey: ['notificaciones'],
    queryFn: async () => {
      const token = await getToken3();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/notificaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const marcarLeidaMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken3();
      await fetch(`${import.meta.env.VITE_API_URL}/api/notificaciones/${id}/leer`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones-unread'] });
    },
  });

  const marcarTodasMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken3();
      await fetch(`${import.meta.env.VITE_API_URL}/api/notificaciones/leer-todas`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones-unread'] });
    },
  });

  const filtered     = filter === "unread" ? notificaciones.filter((n) => !n.leida) : notificaciones;
  const unreadCount  = notificaciones.filter((n) => !n.leida).length;

  // Agrupar por fecha
  const grouped = filtered.reduce((acc, n) => {
    const d    = new Date(n.createdAt);
    const today = new Date();
    const yest  = new Date(); yest.setDate(yest.getDate() - 1);
    const label = d.toDateString() === today.toDateString() ? 'Hoy'
                : d.toDateString() === yest.toDateString()  ? 'Ayer'
                : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    (acc[label] ||= []).push(n);
    return acc;
  }, {} as Record<string, Notificacion[]>);

  const handleClick = (n: Notificacion) => {
    if (!n.leida) marcarLeidaMutation.mutate(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  };

  if (isLoading) {
    return (
      <div className={`flex h-screen items-center justify-center ${tw3.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }

  return (
    <div className={tw3.pageBg}>
      <div className={tw3.container}>
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${tw3.text.primary}`}>Notificaciones</h1>
              {unreadCount > 0 && (
                <p className={`mt-0.5 text-sm ${tw3.text.secondary}`}>
                  {unreadCount} sin leer
                </p>
              )}
            </div>
            <Button variant="outline" onClick={() => navigate(dashboardUrl)}>← Volver</Button>
          </div>

          {/* Filtros */}
          <div className={`mb-4 flex items-center justify-between rounded-2xl border p-1.5
            border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface`}>
            <div className="flex items-center gap-1">
              {[
                { value: 'all',    label: `Todas (${notificaciones.length})` },
                { value: 'unread', label: `Sin leer (${unreadCount})` },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value as any)}
                  className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-medium transition
                    ${filter === value
                      ? 'bg-brand-600 dark:bg-dark-brand text-white'
                      : `${tw3.text.secondary} hover:bg-slate-50 dark:hover:bg-dark-elevated`
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => marcarTodasMutation.mutate()}
                disabled={marcarTodasMutation.isPending}
                className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition
                  ${tw3.text.secondary} hover:bg-slate-50 dark:hover:bg-dark-elevated disabled:opacity-50`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Lista */}
          {filtered.length === 0 ? (
            <div className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed py-12 text-center
              border-slate-200 dark:border-dark-border`}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tw3.iconBg.slate}`}>
                <BellIcon className={`h-5 w-5 ${tw3.text.faint}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${tw3.text.secondary}`}>
                  {filter === "unread" ? "No tenés notificaciones sin leer" : "Sin notificaciones"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <div className={`mb-3 flex items-center gap-3`}>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${tw3.text.muted}`}>{date}</span>
                    <div className={`h-px flex-1 ${tw3.dividerLight} border-t`} />
                  </div>

                  <div className="space-y-2">
                    {items.map((n) => {
                      const cfg = TIPO_CONFIG[n.tipo] ?? { bg: tw3.iconBg.slate, color: tw3.text.faint };
                      return (
                        <Card
                          key={n.id}
                          hover
                          onClick={() => handleClick(n)}
                          className={`cursor-pointer transition
                            ${!n.leida ? `border-l-2 border-l-brand-500 dark:border-l-dark-brand ${tw3.iconBg.brand} dark:bg-dark-brand/5` : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg} ${cfg.color}`}>
                              <BellIcon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className={`text-sm font-semibold truncate ${tw3.text.primary}`}>{n.titulo}</p>
                                {!n.leida && <Badge variant="info">Nuevo</Badge>}
                              </div>
                              <p className={`text-xs ${tw3.text.secondary}`}>{n.mensaje}</p>
                              <p className={`mt-1 text-[10px] ${tw3.text.faint}`}>{formatDateTime3(n.createdAt)}</p>
                            </div>
                            {!n.leida && (
                              <button
                                onClick={(e) => { e.stopPropagation(); marcarLeidaMutation.mutate(n.id); }}
                                className={`shrink-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition
                                  ${tw3.text.faint} hover:bg-slate-100 dark:hover:bg-dark-elevated hover:text-brand-600 dark:hover:text-dark-brand`}
                              >
                                <CheckCheck className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
