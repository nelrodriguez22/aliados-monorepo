import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { usePushNotifications } from "@/shared/hooks/usePushNotifications";
import { useEffect } from "react";
import { useStore } from "@/shared/store/useStore";
import { getToken } from "@/shared/lib/getToken";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ROUTES } from "@/shared/constants/routes";
import { Skeleton } from "@/shared/components/ui/Skeleton";
import {
  Bell, MapPin, Clock, CheckCircle,
  Star, ClipboardList, ZapOff, Users,
} from "lucide-react";

// ── Skeletons ──
function SkeletonCard() {
  return (
    <Card>
      <div className="flex items-center gap-2 min-[375px]:gap-3">
        <Skeleton className="h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 rounded-xl!" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="shrink-0 space-y-1.5 flex flex-col items-end">
          <Skeleton className="h-6 w-20 rounded-full!" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </Card>
  );
}

// ── Avatar iniciales ──
function Initials({ name, bg, color }: {
  name: string; bg: string; color: string;
}) {
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl font-semibold text-xs min-[375px]:text-sm ${bg} ${color}`}>
      {initials}
    </div>
  );
}

// ── Trabajo card ──
// 3 columnas: icono | nombre+oficio | badge+tiempo (derecha)
// Dirección en fila propia debajo, separada visualmente
function TrabajoCard({
  trabajo,
  left,
  badgeContent,
  actionContent,
  onClick,
}: {
  trabajo: any;
  left?: React.ReactNode;
  badgeContent: React.ReactNode;   // badge (estado) arriba derecha
  actionContent?: React.ReactNode; // botón acción — si existe reemplaza al tiempo
  onClick?: () => void;
}) {
  return (
    <Card hover={!!onClick} onClick={onClick}>
      {/* Fila principal: icono | nombre+oficio | badge+tiempo */}
      <div className="flex items-center gap-2 min-[375px]:gap-3">
        {left}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>
            {trabajo.clienteNombre}
          </p>
          <p className={`mt-0.5 text-xs truncate ${tw.text.secondary}`}>
            {trabajo.oficio.nombre}
          </p>
        </div>
        {/* Derecha: badge arriba, tiempo abajo */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {badgeContent}
          {!actionContent && trabajo.tiempoEstimadoMinutos && (
            <span className={`flex items-center gap-1 text-xs ${tw.text.secondary}`}>
              <Clock className={`h-3 w-3 ${tw.text.faint}`} />
              {trabajo.tiempoEstimadoMinutos} min
            </span>
          )}
          {actionContent}
        </div>
      </div>

      {/* Dirección — fila propia debajo, separada */}
      {trabajo.direccion && (
        <div className={`mt-2.5 flex items-center gap-1.5 pt-2.5 border-t text-xs ${tw.text.faint} ${tw.dividerLight}`}>
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{trabajo.direccion}</span>
          {actionContent && trabajo.tiempoEstimadoMinutos && (
            <>
              <span className="shrink-0">·</span>
              <Clock className="h-3 w-3 shrink-0" />
              <span className="shrink-0">{trabajo.tiempoEstimadoMinutos} min</span>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export function ProviderDashboard() {
  const navigate = useNavigate();
  const { user } = useStore();
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();

  const userStatus = user?.status || 'OFFLINE';
  const isOnline   = userStatus === 'ONLINE';
  const isBusy     = userStatus === 'BUSY';

  const { data: trabajoActivo, isLoading: loadingActivo } = useQuery({
    queryKey: ['trabajo-activo'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/activo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: isBusy,
    refetchInterval: false,
    staleTime: Infinity,
  });

  const { data: trabajosEnCola = [] } = useQuery({
    queryKey: ['trabajos-en-cola'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/en-cola`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isBusy,
    refetchInterval: false,
  });

  const { data: trabajosPendientes = [], isLoading: loadingPendientes } = useQuery({
    queryKey: ['trabajos-pendientes'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/pendientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: isOnline || isBusy,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const { data: trabajosCompletados = [], isLoading: loadingCompletados } = useQuery({
    queryKey: ['trabajos-completados'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/completados`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    refetchInterval: false,
  });

  const colaLlena     = (trabajoActivo ? 1 : 0) + trabajosEnCola.length >= 3;
  const isMainLoading = loadingCompletados;

  useEffect(() => {
    if (isSupported && permission === 'default') setShowNotifBanner(true);
  }, [isSupported, permission]);

  useEffect(() => {
    if (isBusy && !trabajoActivo && !loadingActivo)
      queryClient.invalidateQueries({ queryKey: ['trabajo-activo'] });
  }, [isBusy, trabajoActivo, loadingActivo, queryClient]);

  const statusDot = {
    ONLINE:  'bg-green-500',
    BUSY:    'bg-amber-500',
    OFFLINE: 'bg-slate-300 dark:bg-dark-border',
  }[userStatus] ?? 'bg-slate-300';

  const statusLabel = { ONLINE: 'Disponible', BUSY: 'Ocupado', OFFLINE: 'Desconectado' }[userStatus] ?? '';

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>

        {/* Notif banner */}
        {showNotifBanner && (
          <div className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 flex-wrap
            bg-brand-50 dark:bg-dark-brand/10 border-brand-200 dark:border-dark-brand/30`}>
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Bell className="h-4 w-4 text-brand-600 dark:text-dark-brand shrink-0 mt-0.5" />
              <p className={`text-xs min-[375px]:text-sm font-medium ${tw.text.primary}`}>
                Activá las notificaciones para recibir trabajos en tiempo real
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={async () => { await requestPermission(); setShowNotifBanner(false); }}
                className="cursor-pointer rounded-lg bg-brand-600 dark:bg-dark-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500"
              >
                Activar
              </button>
              <button
                onClick={() => setShowNotifBanner(false)}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition
                  border-slate-200 dark:border-dark-border ${tw.text.secondary} hover:bg-slate-50 dark:hover:bg-dark-elevated`}
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Welcome card */}
        <Card className="mb-6">
          <div className="flex items-center gap-2 min-[375px]:gap-3">
            {/* Avatar */}
            <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand font-bold text-xs min-[375px]:text-sm`}>
              {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>

            {/* Nombre + oficio + status + stats en columna */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className={`text-sm min-[375px]:text-base font-bold truncate ${tw.text.primary}`}>
                  {user?.name}
                </h1>
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
              </div>
              <p className={`text-xs truncate ${tw.text.secondary}`}>
                {user?.oficio?.nombre && `${user.oficio.nombre} · `}{statusLabel}
              </p>
              {/* Stats debajo del nombre — siempre en 2da línea */}
              <div className={`mt-2 flex items-center gap-3 pt-2 border-t ${tw.dividerLight}`}>
                <button
                  onClick={() => navigate(ROUTES.PROVIDER.REVIEWS)}
                  className="flex items-center gap-1 cursor-pointer hover:opacity-70 transition"
                >
                  <span className={`text-sm font-bold ${tw.text.primary}`}>
                    {user?.promedioCalificacion ? user.promedioCalificacion.toFixed(1) : '—'}
                  </span>
                  <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                  <span className={`text-xs ${tw.text.muted}`}>
                    · {user?.cantidadCalificaciones || 0}
                    <span className="min-[375px]:hidden"> res.</span>
                    <span className="hidden min-[375px]:inline"> reseñas</span>
                  </span>
                </button>
                <div className={`h-4 w-px border-l ${tw.dividerLight}`} />
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-bold ${tw.text.brand}`}>{trabajosCompletados.length}</span>
                  <span className={`text-xs ${tw.text.muted}`}>completados</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {isMainLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="space-y-8">

            {/* Trabajo activo */}
            {trabajoActivo && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                    Trabajo activo
                  </h2>
                  <Badge variant="info" showPulse>En curso</Badge>
                </div>
                <TrabajoCard
                  trabajo={trabajoActivo}
                  onClick={() => navigate(ROUTES.PROVIDER.ACTIVE_JOB(trabajoActivo.id))}
                  left={<Initials name={trabajoActivo.clienteNombre} bg={tw.iconBg.brand} color="text-brand-600 dark:text-dark-brand" />}
                  badgeContent={""}
                  actionContent={
                    <Button
                      variant="primary"
                      onClick={() => { navigate(ROUTES.PROVIDER.ACTIVE_JOB(trabajoActivo.id)); }}
                      className="text-xs px-2.5 py-1.5"
                    >
                      Ver trabajo
                    </Button>
                  }
                />
              </section>
            )}

            {/* Cola */}
            {trabajosEnCola.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                    Cola de trabajos
                  </h2>
                  <Badge variant="queue">{trabajosEnCola.length} en espera</Badge>
                </div>
                <div className="space-y-2 min-[375px]:space-y-3">
                  {trabajosEnCola.map((trabajo: any, index: number) => (
                    <TrabajoCard
                      key={trabajo.id}
                      trabajo={trabajo}
                      left={
                        <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.amber} text-amber-600 dark:text-amber-400 text-xs font-bold`}>
                          #{index + 1}
                        </div>
                      }
                      badgeContent={""}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Disponibles */}
            <section>
              <div className="mb-3">
                <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Trabajos disponibles
                </h2>
              </div>

              {colaLlena ? (
                <EmptyState
                  icon={Users}
                  title="Tu agenda está completa"
                  desc="Completá los trabajos actuales para recibir nuevas solicitudes"
                />
              ) : (isOnline || isBusy) ? (
                loadingPendientes ? (
                  <div className="space-y-2 min-[375px]:space-y-3"><SkeletonCard /><SkeletonCard /></div>
                ) : trabajosPendientes.length > 0 ? (
                  <div className="space-y-2 min-[375px]:space-y-3">
                    {trabajosPendientes.map((trabajo: any) => (
                      <TrabajoCard
                        key={trabajo.id}
                        trabajo={trabajo}
                        onClick={() => navigate(ROUTES.PROVIDER.JOB(trabajo.id))}
                        left={<Initials name={trabajo.clienteNombre} bg={tw.iconBg.slate} color={tw.text.secondary} />}
                        badgeContent={
                          <Button
                            variant="success"
                            onClick={() => { navigate(ROUTES.PROVIDER.JOB(trabajo.id)); }}
                            className="text-xs px-2.5 py-1.5"
                          >
                            Ver detalle
                          </Button>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={CheckCircle}
                    title="No hay trabajos disponibles"
                    desc="Recibirás una notificación cuando haya uno nuevo"
                  />
                )
              ) : (
                <EmptyState
                  icon={ZapOff}
                  title="Estás desconectado"
                  desc="Activá el toggle para recibir trabajos"
                />
              )}
            </section>

            {/* Historial */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Historial
                </h2>
                {trabajosCompletados.length > 3 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                  >
                    {showHistory ? 'Ver menos' : `Ver todos (${trabajosCompletados.length})`}
                  </button>
                )}
              </div>

              {trabajosCompletados.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Sin trabajos completados"
                  desc="Tu historial aparecerá acá"
                />
              ) : (
                <div className="space-y-2 min-[375px]:space-y-3">
                  {(showHistory ? trabajosCompletados : trabajosCompletados.slice(0, 3)).map((trabajo: any) => (
                    <TrabajoCard
                      key={trabajo.id}
                      trabajo={trabajo}
                      onClick={() => navigate(ROUTES.PROVIDER.COMPLETED_JOB(trabajo.id))}
                      left={<Initials name={trabajo.clienteNombre} bg={tw.iconBg.green} color="text-green-600 dark:text-green-400" />}
                      badgeContent={
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="success">Completado</Badge>
                          {trabajo.calificacionEstrellas && (
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} className={`h-3 w-3 ${s <= trabajo.calificacionEstrellas ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-dark-border'}`} />
                              ))}
                            </div>
                          )}
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed py-8 text-center
      border-slate-200 dark:border-dark-border`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tw.iconBg.slate}`}>
        <Icon className={`h-5 w-5 ${tw.text.faint}`} />
      </div>
      <p className={`text-sm font-medium ${tw.text.secondary}`}>{title}</p>
      <p className={`text-xs ${tw.text.muted}`}>{desc}</p>
    </div>
  );
}
