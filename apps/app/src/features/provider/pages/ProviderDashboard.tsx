import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingTour } from "@/shared/components/OnboardingTour";
import { ONBOARDING_KEYS, PROVIDER_TOUR_STEPS } from "@/shared/lib/onboarding";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { usePushNotifications } from "@/shared/hooks/usePushNotifications";
import { useEffect } from "react";
import { useStore } from "@/shared/store/useStore";
import { apiClient } from "@/shared/lib/apiClient";
import toast from "react-hot-toast";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ROUTES } from "@/shared/constants/routes";
import { Skeleton } from "@/shared/components/ui/Skeleton";
import { ErrorState } from "@/shared/components/ui/ErrorState";
import { useWebSocketContext } from "@/shared/providers/WebSocketProvider";
import { useUnreadCounts } from "@/shared/hooks/useUnreadCounts";
import { UnreadBadge } from "@/shared/components/chat/UnreadBadge";
import {
  Bell, MapPin, Clock, CheckCircle,
  Star, ClipboardList, ZapOff, Users, Truck, X, Calendar, ChevronDown,
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
  unreadCount,
}: {
  trabajo: any;
  left?: React.ReactNode;
  badgeContent: React.ReactNode;   // badge (estado) arriba derecha
  actionContent?: React.ReactNode; // botón acción — si existe reemplaza al tiempo
  onClick?: () => void;
  unreadCount?: number;            // mensajes sin leer de la conversación del trabajo
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
          <div className="flex items-center">
            {badgeContent}
            <UnreadBadge count={unreadCount ?? 0} />
          </div>
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
  const { user, updateUserStatus } = useStore();
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [agendaMesActivo, setAgendaMesActivo] = useState<string>('');
  const queryClient = useQueryClient();
  // Con WS conectado los cambios llegan por push → poll lento de respaldo.
  const { isConnected: wsConnected } = useWebSocketContext();

  const userStatus = user?.status || 'OFFLINE';
  const isOnline   = userStatus === 'ONLINE';
  const isBusy     = userStatus === 'BUSY';

  // Solo los proveedores de fletes/mudanzas usan los endpoints de mudanzas.
  // Mismo criterio que el backend (esProveedorDeFletes): evita el 403 "No autorizado"
  // y requests innecesarios para el resto de los oficios (ej. plomero).
  const oficioNombre = user?.oficio?.nombre?.toLowerCase() ?? '';
  const isFlete = oficioNombre.includes('flete') || oficioNombre.includes('mudanza');

  const { data: trabajoActivo, isLoading: loadingActivo } = useQuery({
    queryKey: ['trabajo-activo'],
    queryFn: () => apiClient.get('/api/trabajos/activo'),
    enabled: isBusy,
    refetchInterval: false,
    staleTime: Infinity,
  });

  const { data: trabajosEnCola = [] } = useQuery({
    queryKey: ['trabajos-en-cola'],
    queryFn: async () => {
      try { return await apiClient.get('/api/trabajos/en-cola'); }
      catch { return []; }
    },
    enabled: isBusy,
    refetchInterval: false,
  });

  const { data: trabajosPendientes = [], isLoading: loadingPendientes, isError: pendientesError, refetch: refetchPendientes } = useQuery({
    queryKey: ['trabajos-pendientes'],
    queryFn: () => apiClient.get('/api/trabajos/pendientes'),
    enabled: isOnline || isBusy,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchInterval: wsConnected ? 120000 : 30000,
  });

  // Historial completado paginado vía "Cargar más" (#20-B).
  const {
    data: historialData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingCompletados,
    isError: completadosError,
    refetch: refetchCompletados,
  } = useInfiniteQuery({
    queryKey: ['trabajos-completados'],
    queryFn: ({ pageParam }) => apiClient.get(`/api/trabajos/completados?page=${pageParam}&size=10`),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any, allPages: any[]) => (lastPage?.hasNext ? allPages.length : undefined),
    refetchInterval: false,
  });
  const trabajosCompletados = historialData?.pages.flatMap((p: any) => p.content) ?? [];
  const totalCompletados = historialData?.pages[0]?.total ?? 0;

  const { data: mudanzasPendientes = [] } = useQuery({
    queryKey: ['mudanzas-pendientes-prov'],
    queryFn: async () => {
      try { return await apiClient.get('/api/mudanzas/proveedor/pendientes'); }
      catch { return []; }
    },
    enabled: isFlete && (isOnline || isBusy),
    refetchOnMount: 'always',
    refetchInterval: wsConnected ? 120000 : 30000,
  });

  const { data: mudanzaActiva } = useQuery({
    queryKey: ['mudanza-activa-prov'],
    queryFn: async () => {
      try {
        const data = await apiClient.get('/api/mudanzas/proveedor/activa');
        return data && data.id ? data : null;
      } catch { return null; }
    },
    enabled: isFlete,
    refetchOnMount: 'always',
  });

  const { data: mudanzasConfirmadas = [] } = useQuery({
    queryKey: ['mudanzas-confirmadas-prov'],
    queryFn: async () => {
      try { return await apiClient.get('/api/mudanzas/proveedor/confirmadas'); }
      catch { return []; }
    },
    enabled: isFlete,
    refetchOnMount: 'always',
  });

  const limiteTrabajos = isFlete ? 8 : 3;
  const colaLlena     = (trabajoActivo ? 1 : 0) + trabajosEnCola.length >= limiteTrabajos;
  const isMainLoading = loadingCompletados;

  // Badges de no leídos (#26): un único efecto junta los conversacionId de TODAS las
  // tarjetas activas y pide los conteos en paralelo — ver useUnreadCounts. Armar este
  // array con .map()/.filter() en cada render es seguro: el hook deriva una clave estable
  // del conjunto de ids y sólo vuelve a pedir cuando ese conjunto cambia de verdad.
  const conversacionIdsActivos = [
    ...trabajosPendientes.map((t: any) => t.conversacionId),
    ...trabajosEnCola.map((t: any) => t.conversacionId),
    ...(trabajoActivo ? [trabajoActivo.conversacionId] : []),
    ...mudanzasPendientes.map((m: any) => m.conversacionId),
    ...mudanzasConfirmadas.map((m: any) => m.conversacionId),
    ...(mudanzaActiva ? [mudanzaActiva.conversacionId] : []),
  ].filter((id: number | null | undefined): id is number => id != null);
  const noLeidosPorConversacion = useUnreadCounts(conversacionIdsActivos);

  useEffect(() => {
    if (isSupported && permission === 'default') setShowNotifBanner(true);
  }, [isSupported, permission]);

  useEffect(() => {
    if (isBusy && !trabajoActivo && !loadingActivo)
      queryClient.invalidateQueries({ queryKey: ['trabajo-activo'] });
  }, [isBusy, trabajoActivo, loadingActivo, queryClient]);

  // Auto-online al entrar (una vez por sesión de pestaña): el proveedor que abre la
  // app normalmente quiere estar disponible. El flag evita re-activarlo en cada
  // navegación, así respeta un OFFLINE manual posterior. No toca BUSY.
  useEffect(() => {
    if (sessionStorage.getItem('auto-online-hecho')) return;
    if (user?.status !== 'OFFLINE') return;
    sessionStorage.setItem('auto-online-hecho', '1');
    apiClient.patch('/api/users/me/status', { status: 'ONLINE' })
      .then(() => {
        updateUserStatus('ONLINE');
        queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
        toast.success('Estás en línea');
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusDot = {
    ONLINE:  'bg-green-500',
    BUSY:    'bg-amber-500',
    OFFLINE: 'bg-slate-300 dark:bg-dark-border',
  }[userStatus] ?? 'bg-slate-300';

  const statusLabel = { ONLINE: 'Disponible', BUSY: 'Ocupado', OFFLINE: 'Desconectado' }[userStatus] ?? '';

  return (
    <div className={tw.pageBg}>
      <OnboardingTour
        storageKey={ONBOARDING_KEYS.provider}
        steps={PROVIDER_TOUR_STEPS}
        ready={!loadingActivo && !loadingCompletados}
      />
      <div className={tw.containerWide}>

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
                  <span className={`text-sm font-bold ${tw.text.brand}`}>{totalCompletados}</span>
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

            {/* Disponibles */}
            <section data-onboarding="provider-available">
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
                  <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
                ) : pendientesError ? (
                  <ErrorState compact message="No pudimos cargar los trabajos disponibles." onRetry={() => refetchPendientes()} />
                ) : trabajosPendientes.length > 0 ? (
                  <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2">
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
                        unreadCount={trabajo.conversacionId != null ? noLeidosPorConversacion[trabajo.conversacionId] : 0}
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

            {/* Trabajo pendiente (cola) */}
            {trabajosEnCola.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                    Trabajos pendientes
                  </h2>
                  <Badge variant="queue">{trabajosEnCola.length} en espera</Badge>
                </div>
                <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2">
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
                      unreadCount={trabajo.conversacionId != null ? noLeidosPorConversacion[trabajo.conversacionId] : 0}
                    />
                  ))}
                </div>
              </section>
            )}

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
                  unreadCount={trabajoActivo.conversacionId != null ? noLeidosPorConversacion[trabajoActivo.conversacionId] : 0}
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

            {/* Mudanzas pendientes */}
            {mudanzasPendientes.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                    Mudanzas pendientes
                  </h2>
                  <Badge variant="info">{mudanzasPendientes.length} nueva{mudanzasPendientes.length > 1 ? 's' : ''}</Badge>
                </div>
                <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2">
                  {mudanzasPendientes.map((m: any) => (
                    <Card key={m.id} hover onClick={() => navigate(ROUTES.PROVIDER.MUDANZA_DETAIL(m.id))}>
                      <div className="flex items-center gap-2 min-[375px]:gap-3">
                        <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                          <Truck className="h-4 w-4 min-[375px]:h-5 min-[375px]:w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>
                            {m.tierEmoji} {m.tierNombre} — {m.clienteNombre}
                          </p>
                          <p className={`mt-0.5 text-xs truncate ${tw.text.secondary}`}>
                            {m.direccionOrigen.split(',')[0]} → {m.direccionDestino.split(',')[0]}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <Button
                            variant="success"
                            onClick={() => navigate(ROUTES.PROVIDER.MUDANZA_DETAIL(m.id))}
                            className="text-xs px-2.5 py-1.5"
                          >
                            Ver detalle
                          </Button>
                          {m.conversacionId != null && (
                            <UnreadBadge count={noLeidosPorConversacion[m.conversacionId] ?? 0} />
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Mudanzas confirmadas (cola) */}
            {mudanzasConfirmadas.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                    Mudanzas confirmadas
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAgenda(true)}
                      className={`flex items-center gap-1 text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                    >
                      <Calendar className="h-3 w-3" />
                      Ver agenda
                    </button>
                    <Badge variant="queue">{mudanzasConfirmadas.length} agendada{mudanzasConfirmadas.length > 1 ? 's' : ''}</Badge>
                  </div>
                </div>
                <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2">
                  {mudanzasConfirmadas.map((m: any) => (
                    <Card key={m.id} hover onClick={() => navigate(ROUTES.PROVIDER.MUDANZA_DETAIL(m.id))}>
                      <div className="flex items-center gap-2 min-[375px]:gap-3">
                        <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                          <Truck className="h-4 w-4 min-[375px]:h-5 min-[375px]:w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>
                            {m.tierEmoji} {m.tierNombre} — {m.clienteNombre}
                          </p>
                          <p className={`mt-0.5 text-xs truncate ${tw.text.secondary}`}>
                            {m.direccionOrigen.split(',')[0]} → {m.direccionDestino.split(',')[0]}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center">
                          <Badge variant="success">Confirmada</Badge>
                          {m.conversacionId != null && (
                            <UnreadBadge count={noLeidosPorConversacion[m.conversacionId] ?? 0} />
                          )}
                        </div>
                      </div>
                      {m.fechaConfirmada && (
                        <div className={`mt-2.5 flex items-center gap-1.5 pt-2.5 border-t text-xs ${tw.text.faint} ${tw.dividerLight}`}>
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{m.fechaConfirmada}{m.turno ? ` — ${m.turno === 'PRIMERO' ? '1er turno (6:30hs)' : '2do turno (~11:00hs)'}` : ''}</span>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Mudanza activa */}
            {mudanzaActiva && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                    Mudanza activa
                  </h2>
                  <Badge variant="info" showPulse>En curso</Badge>
                </div>
                <Card hover onClick={() => navigate(ROUTES.PROVIDER.MUDANZA_DETAIL(mudanzaActiva.id))}>
                  <div className="flex items-center gap-2 min-[375px]:gap-3">
                    <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                      <Truck className="h-4 w-4 min-[375px]:h-5 min-[375px]:w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>
                        {mudanzaActiva.tierEmoji} {mudanzaActiva.tierNombre} — {mudanzaActiva.clienteNombre}
                      </p>
                      <p className={`mt-0.5 text-xs truncate ${tw.text.secondary}`}>
                        {mudanzaActiva.direccionOrigen.split(',')[0]} → {mudanzaActiva.direccionDestino.split(',')[0]}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {mudanzaActiva.conversacionId != null && (
                        <UnreadBadge count={noLeidosPorConversacion[mudanzaActiva.conversacionId] ?? 0} />
                      )}
                      <Button
                        variant="primary"
                        onClick={() => navigate(ROUTES.PROVIDER.MUDANZA_DETAIL(mudanzaActiva.id))}
                        className="text-xs px-2.5 py-1.5"
                      >
                        Ver trabajo
                      </Button>
                    </div>
                  </div>
                </Card>
              </section>
            )}

            {/* Historial */}
            <section data-onboarding="provider-history">
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Historial
                </h2>
              </div>

              {loadingCompletados ? (
                <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
              ) : completadosError ? (
                <ErrorState compact message="No pudimos cargar tu historial." onRetry={() => refetchCompletados()} />
              ) : trabajosCompletados.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Sin trabajos completados"
                  desc="Tu historial aparecerá acá"
                />
              ) : (
                <div className="grid gap-2 min-[375px]:gap-3 lg:grid-cols-2">
                  {trabajosCompletados.map((trabajo: any) => (
                    <TrabajoCard
                      key={trabajo.id}
                      trabajo={trabajo}
                      onClick={() => navigate(ROUTES.PROVIDER.COMPLETED_JOB(trabajo.id))}
                      left={<Initials name={trabajo.clienteNombre} bg={tw.iconBg.green} color="text-green-600 dark:text-green-400" />}
                      badgeContent={
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="success">Completado</Badge>
                          {trabajo.calificacionEstrellas ? (
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} className={`h-3 w-3 ${s <= trabajo.calificacionEstrellas ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-dark-border'}`} />
                              ))}
                            </div>
                          ) : (
                            <Badge variant="neutral">Sin calificar</Badge>
                          )}
                        </div>
                      }
                    />
                  ))}
                  {hasNextPage && (
                    <div className="flex items-center gap-3 pt-2">
                      <span className="h-px flex-1 bg-slate-200 dark:bg-dark-border" />
                      <Button
                        variant="outline"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="shrink-0 text-xs min-[375px]:text-sm px-4 py-1.5"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {isFetchingNextPage ? 'Cargando...' : <>Cargar más <ChevronDown className="h-4 w-4" /></>}
                        </span>
                      </Button>
                      <span className="h-px flex-1 bg-slate-200 dark:bg-dark-border" />
                    </div>
                  )}
                </div>
              )}
            </section>

          </div>
        )}
      </div>

      {/* Modal agenda mudanzas */}
      {showAgenda && (
        <div className="fixed inset-0 z-50 flex items-end min-[425px]:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAgenda(false)} />
          <div className={`relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-t-2xl min-[425px]:rounded-2xl p-5
            bg-white dark:bg-dark-card`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-base font-bold ${tw.text.primary}`}>Agenda de mudanzas</h2>
              <button
                onClick={() => setShowAgenda(false)}
                className={`cursor-pointer p-1 rounded-lg transition hover:bg-slate-100 dark:hover:bg-dark-elevated ${tw.text.muted}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {(() => {
              const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
              const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

              const porMes: Record<string, any[]> = {};
              mudanzasConfirmadas
                .filter((m: any) => m.fechaConfirmada)
                .sort((a: any, b: any) => a.fechaConfirmada.localeCompare(b.fechaConfirmada))
                .forEach((m: any) => {
                  const [year, month] = m.fechaConfirmada.split('-');
                  const key = `${year}-${month}`;
                  if (!porMes[key]) porMes[key] = [];
                  porMes[key].push(m);
                });

              const meses = Object.keys(porMes).sort();

              if (meses.length === 0) {
                return (
                  <p className={`text-sm text-center py-6 ${tw.text.muted}`}>No hay mudanzas agendadas</p>
                );
              }

              const mesActual = new Date().toISOString().slice(0, 7);
              const mesSeleccionado = agendaMesActivo && meses.includes(agendaMesActivo) ? agendaMesActivo : (meses.includes(mesActual) ? mesActual : meses[0]);
              const mudanzasMes = porMes[mesSeleccionado] || [];

              return (
                <>
                  <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 -mx-1 px-1 scrollbar-hide">
                    {meses.map((key) => {
                      const [year, month] = key.split('-');
                      const label = `${MESES_CORTO[parseInt(month) - 1]} ${year.slice(2)}`;
                      const isActive = key === mesSeleccionado;
                      return (
                        <button
                          key={key}
                          onClick={() => setAgendaMesActivo(key)}
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                            isActive
                              ? 'bg-brand-600 dark:bg-dark-brand text-white'
                              : `border ${tw.dividerLight} ${tw.text.secondary} hover:bg-slate-50 dark:hover:bg-dark-elevated`
                          }`}
                        >
                          {label}
                          <span className={`ml-1 ${isActive ? 'text-white/70' : tw.text.muted}`}>({porMes[key].length})</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    {mudanzasMes.map((m: any) => {
                      const fecha = new Date(m.fechaConfirmada + 'T12:00:00');
                      const dia = DIAS[fecha.getDay()];
                      const num = fecha.getDate();
                      const turnoLabel = m.turno === 'PRIMERO' ? '6:30hs' : '~11:00hs';

                      return (
                        <div
                          key={m.id}
                          onClick={() => { setShowAgenda(false); navigate(ROUTES.PROVIDER.MUDANZA_DETAIL(m.id)); }}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition
                            hover:bg-slate-50 dark:hover:bg-dark-elevated border ${tw.dividerLight}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand text-xs font-bold`}>
                              {num}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-medium truncate ${tw.text.primary}`}>
                                {dia} — {turnoLabel}
                              </p>
                              <p className={`text-xs truncate ${tw.text.secondary}`}>
                                {m.tierEmoji} {m.tierNombre} — {m.clienteNombre}
                              </p>
                            </div>
                          </div>
                          <Badge variant={m.estado === 'ACEPTADO' ? 'success' : 'info'}>
                            {m.estado === 'ACEPTADO' ? 'Confirmada' : m.estado === 'PENDIENTE_PAGO_EXTRA' ? 'Pago extra' : 'Finalizada'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
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
