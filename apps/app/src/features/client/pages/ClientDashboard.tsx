import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { useEffect, useState, useRef, type JSX } from "react";
import { usePushNotifications } from "@/shared/hooks/usePushNotifications";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Search, Bell, CheckCircle, Clock, ClipboardList, Truck } from "lucide-react";
import { useStore } from "@/shared/store/useStore";
import { apiClient } from "@/shared/lib/apiClient";
import { Skeleton } from "@/shared/components/ui/Skeleton";
import { ErrorState } from "@/shared/components/ui/ErrorState";
import { useWebSocketContext } from "@/shared/providers/WebSocketProvider";
import { useOficios } from "@/shared/hooks/useOficios";
import { OnboardingTour } from "@/shared/components/OnboardingTour";
import { ONBOARDING_KEYS, CLIENT_TOUR_STEPS } from "@/shared/lib/onboarding";

// ── SVG icons por oficio ──
const OFICIO_ICONS: Record<number | string, JSX.Element> = {
  1: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z"/>
    </svg>
  ),
  2: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  3: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  4: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c0 6-6 8-6 13a6 6 0 0012 0c0-5-6-7-6-13z"/>
      <path d="M9 17.5c0 1.5 1.5 2.5 3 2.5s3-1 3-2.5"/>
    </svg>
  ),
  mudanza: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2"/>
      <path d="M16 8h4l3 5v4h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
};

const OFICIOS = [
  { id: 1, nombre: 'Electricista' },
  { id: 2, nombre: 'Plomero' },
  { id: 3, nombre: 'Cerrajero' },
  { id: 4, nombre: 'Gasista' },
  { id: 'mudanza', nombre: 'Mudanzas' },
];

const ICON_BG_CLASSES = [
  "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
  "bg-brand-50 text-brand-600 dark:bg-dark-brand/10 dark:text-dark-brand",
  "bg-slate-100 text-slate-600 dark:bg-dark-elevated dark:text-dark-text-secondary",
  "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
  "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
];

// ── Skeletons ──
function SkeletonServicios() {
  return (
    <div className="grid gap-2 min-[375px]:gap-3 grid-cols-2 sm:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <div className="flex flex-col items-center gap-2 text-center py-1">
            <Skeleton className="h-12 w-12 min-[375px]:h-14 min-[375px]:w-14 rounded-2xl!" />
            <Skeleton className="h-4 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function SkeletonTrabajos() {
  return (
    <div className="space-y-2 min-[375px]:space-y-3">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <div className="flex items-center gap-2 min-[375px]:gap-3">
            <Skeleton className="h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 rounded-xl!" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="shrink-0 space-y-1.5 flex flex-col items-end">
              <Skeleton className="h-6 w-24 rounded-full!" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SkeletonHistorial() {
  return (
    <div className="space-y-2 min-[375px]:space-y-3">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <div className="flex items-center gap-2 min-[375px]:gap-3">
            <Skeleton className="h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 rounded-xl!" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="shrink-0 space-y-1.5 flex flex-col items-end">
              <Skeleton className="h-6 w-20 rounded-full!" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Componente principal ──
export function ClientDashboard() {
  const navigate = useNavigate();
  // Con WS conectado los cambios llegan por push → poll lento de respaldo.
  const { isConnected: wsConnected } = useWebSocketContext();
  const [searchParams] = useSearchParams();
  const { user } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const historialRef = useRef<HTMLDivElement>(null);
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);

  // Oficios desde la API para el buscador
  const { data: oficiosApi = [] } = useOficios();

  // Combinar oficios de la API + Mudanzas para el buscador
  const oficiosBuscador = [
    ...oficiosApi.filter((o: any) => o.nombre !== 'Mudanzas'),
    { id: 'mudanza', nombre: 'Mudanzas' },
  ];

  const { data: todosTrabajos = [], isLoading: loadingTrabajos, isError: trabajosError, refetch: refetchTrabajos } = useQuery({
    queryKey: ['trabajos-cliente'],
    queryFn: () => apiClient.get('/api/trabajos/cliente'),
    staleTime: 30000,
    refetchOnMount: true,
    refetchInterval: wsConnected ? 120000 : 30000,
  });

  const { data: mudanzasCliente = [] } = useQuery({
    queryKey: ['mudanzas-cliente'],
    queryFn: () => apiClient.get('/api/mudanzas/cliente'),
    staleTime: 30000,
    refetchOnMount: true,
    refetchInterval: wsConnected ? 120000 : 30000,
  });

  const mudanzasActivas = mudanzasCliente.filter((m: any) =>
    ['PENDIENTE', 'RESERVADO', 'CONTRAPROPUESTO', 'ACEPTADO', 'EN_CURSO', 'FINALIZADO', 'PENDIENTE_PAGO_EXTRA'].includes(m.estado)
  );

  const trabajosActivos = todosTrabajos.filter((t: any) =>
    ['PENDIENTE', 'EN_CURSO', 'PROPUESTO', 'EN_COLA'].includes(t.estado)
  );

  // Historial completado: paginado vía "Cargar más" (#20-B). /cliente ya solo trae activos.
  const {
    data: historialData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingHistorial,
    isError: historialError,
    refetch: refetchHistorial,
  } = useInfiniteQuery({
    queryKey: ['trabajos-historial'],
    queryFn: ({ pageParam }) => apiClient.get(`/api/trabajos/cliente/historial?page=${pageParam}&size=10`),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any, allPages: any[]) => (lastPage?.hasNext ? allPages.length : undefined),
    staleTime: 30000,
    refetchOnMount: true,
  });
  const trabajosCompletados = historialData?.pages.flatMap((p: any) => p.content) ?? [];
  const sinCalificar = historialData?.pages[0]?.sinCalificar ?? 0;

  const removeAccents = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filteredOficios = searchQuery.trim().length > 0
    ? oficiosBuscador.filter((o: any) =>
        removeAccents(o.nombre.toLowerCase()).includes(removeAccents(searchQuery.toLowerCase()))
      )
    : oficiosBuscador;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleServiceClick = (oficioId: number | string) => {
    if (oficioId === 'mudanza') {
      navigate(ROUTES.CLIENT.MUDANZA_NEW);
      return;
    }
    navigate(`${ROUTES.CLIENT.SERVICE_REQUEST}?oficioId=${oficioId}`);
  };

  const handleSuggestionClick = (oficio: any) => {
    setSearchQuery(oficio.nombre);
    setShowSuggestions(false);
    handleServiceClick(oficio.id);
  };

  useEffect(() => {
    if (isSupported && permission === 'default') setShowNotificationBanner(true);
  }, [isSupported, permission]);

  useEffect(() => {
    if (searchParams.get('view') === 'all') {
      setTimeout(() => historialRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, [searchParams]);

  const getEstadoBadge = (estado: string) => {
    if (estado === 'PENDIENTE') return { variant: 'warning' as const,  label: 'Buscando proveedor',  pulse: true };
    if (estado === 'PROPUESTO') return { variant: 'info' as const,     label: 'Propuesta recibida',  pulse: true };
    if (estado === 'EN_CURSO')  return { variant: 'info' as const,     label: 'En camino',           pulse: true };
    if (estado === 'EN_COLA')   return { variant: 'queue' as const,    label: 'En cola',             pulse: true };
    return { variant: 'neutral' as const, label: estado, pulse: false };
  };

  const getMudanzaEstadoBadge = (estado: string) => {
    const map: Record<string, { variant: any; label: string; pulse: boolean }> = {
      PENDIENTE:            { variant: 'neutral',  label: 'Pendiente',           pulse: false },
      RESERVADO:            { variant: 'info',     label: 'Esperando proveedor', pulse: true },
      CONTRAPROPUESTO:      { variant: 'warning',  label: 'Cambio sugerido',     pulse: true },
      ACEPTADO:             { variant: 'success',  label: 'Confirmada',          pulse: false },
      EN_CURSO:             { variant: 'info',     label: 'En curso',            pulse: true },
      FINALIZADO:           { variant: 'success',  label: 'Finalizada',          pulse: false },
      PENDIENTE_PAGO_EXTRA: { variant: 'warning',  label: 'Pago extra',          pulse: true },
    };
    return map[estado] || { variant: 'neutral', label: estado, pulse: false };
  };

  return (
    <div className={tw.pageBg}>
      <OnboardingTour
        storageKey={ONBOARDING_KEYS.client}
        steps={CLIENT_TOUR_STEPS}
        ready={!loadingTrabajos && !loadingHistorial}
      />
      <div className={tw.container}>

        {/* Banner notificaciones */}
        {showNotificationBanner && (
          <div className={`rounded-xl border px-3 py-2.5 mb-5 flex items-start justify-between gap-3 flex-wrap
            bg-brand-50 border-brand-100 dark:bg-dark-brand/8 dark:border-dark-brand/20`}>
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Bell className="h-4 w-4 text-brand-600 dark:text-dark-brand shrink-0 mt-0.5" />
              <p className={`text-xs min-[375px]:text-sm ${tw.text.secondary}`}>
                Activá las notificaciones para saber cuándo tu profesional está en camino
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={async () => { await requestPermission(); setShowNotificationBanner(false); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer
                  bg-brand-600 text-white hover:bg-brand-500 dark:bg-dark-brand dark:hover:bg-dark-brand-hover`}
              >
                Activar
              </button>
              <button
                onClick={() => setShowNotificationBanner(false)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer
                  ${tw.text.secondary} border-slate-200 hover:bg-slate-50 dark:border-dark-border dark:hover:bg-dark-elevated`}
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Bienvenida */}
        <div className="mb-6">
          <h1 className={`mb-1 text-2xl min-[375px]:text-3xl font-bold ${tw.text.primary}`}>
            Hola, {user?.name || 'Usuario'}
          </h1>
          {/* <p className={`text-sm ${tw.text.secondary}`}>¿Qué servicio necesitás hoy?</p> */}
        </div>

        {/* Buscador */}
        <div data-onboarding="client-search">
        <Card className="mb-6">
          <div className="relative" ref={searchRef}>
            <div className="flex flex-col gap-2 min-[375px]:flex-row">
              <div className="relative flex-1">
                <Search className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 ${tw.text.faint}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="¿Qué servicio necesitás?"
                  className={tw.input + " pl-10"}
                />
              </div>
              <Button
                onClick={() => navigate(ROUTES.CLIENT.SERVICE_REQUEST)}
                className="w-full min-[375px]:w-auto"
              >
                Buscar
              </Button>
            </div>

            {showSuggestions && filteredOficios.length > 0 && (
              <div className={`absolute left-0 right-0 top-full mt-2 z-10 max-h-64 overflow-y-auto ${tw.dropdown}`}>
                {filteredOficios.map((oficio) => (
                  <button
                    key={oficio.id}
                    onClick={() => handleSuggestionClick(oficio)}
                    className={tw.dropdownItem}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${ICON_BG_CLASSES[(oficio.id as number) - 1]}`}>
                      {OFICIO_ICONS[oficio.id]}
                    </span>
                    <span className={`font-medium text-sm ${tw.text.primary}`}>{oficio.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
        </div>

        {loadingTrabajos ? (
          <>
            <div className="mb-8"><Skeleton className="h-5 w-40 mb-3" /><SkeletonServicios /></div>
            <div className="mb-8"><Skeleton className="h-5 w-36 mb-3" /><SkeletonTrabajos /></div>
            <div><Skeleton className="h-5 w-44 mb-3" /><SkeletonHistorial /></div>
          </>
        ) : (
          <>
            {/* Servicios populares */}
            <div className="mb-8">
              <h2 className={`mb-3 text-base min-[375px]:text-lg font-semibold ${tw.text.primary}`}>
                Servicios populares
              </h2>
              <div className="grid gap-2 min-[375px]:gap-3 grid-cols-2 min-[425px]:grid-cols-3 sm:grid-cols-5">
                {OFICIOS.map((oficio, index) => (
                  <Card key={oficio.id} hover onClick={() => handleServiceClick(oficio.id)}>
                    <div className="flex flex-col items-center gap-2 min-[375px]:gap-3 text-center py-1">
                      <div className={`flex h-12 w-12 min-[375px]:h-14 min-[375px]:w-14 items-center justify-center rounded-2xl ${ICON_BG_CLASSES[index]}`}>
                        {OFICIO_ICONS[oficio.id]}
                      </div>
                      <span className={`font-medium text-xs min-[375px]:text-sm ${tw.text.primary}`}>
                        {oficio.nombre}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Trabajos activos */}
            <div className="mb-8" data-onboarding="client-active">
              <h2 className={`mb-3 text-base min-[375px]:text-lg font-semibold ${tw.text.primary}`}>
                Trabajos activos
              </h2>

              {trabajosError ? (
                <Card><ErrorState compact message="No pudimos cargar tus trabajos activos." onRetry={() => refetchTrabajos()} /></Card>
              ) : trabajosActivos.length > 0 ? (
                <div className="space-y-2 min-[375px]:space-y-3">
                  {trabajosActivos.map((trabajo: any) => {
                    const estadoBadge = getEstadoBadge(trabajo.estado);
                    return (
                      <Card key={trabajo.id} hover onClick={() =>
                        navigate(trabajo.estado === 'PROPUESTO'
                          ? ROUTES.CLIENT.PROPOSAL(trabajo.id)
                          : ROUTES.CLIENT.TRACKING(trabajo.id))
                      }>
                        <div className="flex items-center gap-2 min-[375px]:gap-3">
                          {/* Icono */}
                          <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                            {OFICIO_ICONS[trabajo.oficio.id] ?? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
                              </svg>
                            )}
                          </div>
                          {/* Nombre + oficio */}
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${tw.text.primary}`}>
                              {trabajo.proveedorNombre || 'Buscando proveedor...'}
                            </p>
                            <p className={`mt-0.5 text-xs ${tw.text.secondary}`}>{trabajo.oficio.nombre}</p>
                          </div>
                          {/* Badge + tiempo */}
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <Badge variant={estadoBadge.variant} showPulse={estadoBadge.pulse}>
                              {estadoBadge.label}
                            </Badge>
                            {trabajo.tiempoEstimadoMinutos && (
                              <span className={`flex items-center gap-1 text-xs ${tw.text.secondary}`}>
                                <Clock className={`h-3 w-3 ${tw.text.faint}`} />
                                {trabajo.tiempoEstimadoMinutos} min
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
                      <Search className={`h-5 w-5 ${tw.text.faint}`} />
                    </div>
                    <div>
                      <h3 className={`mb-1 text-sm font-semibold ${tw.text.primary}`}>
                        No tenés trabajos activos
                      </h3>
                      <p className={`text-xs ${tw.text.secondary}`}>
                        Solicitá un servicio para comenzar
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Mudanzas activas */}
            {mudanzasActivas.length > 0 && (
              <div className="mb-8">
                <h2 className={`mb-3 text-base min-[375px]:text-lg font-semibold ${tw.text.primary}`}>
                  Mudanzas activas
                </h2>
                <div className="space-y-2 min-[375px]:space-y-3">
                  {mudanzasActivas.map((m: any) => {
                    const badge = getMudanzaEstadoBadge(m.estado);
                    return (
                      <Card key={m.id} hover onClick={() => navigate(ROUTES.CLIENT.MUDANZA_DETAIL(m.id))}>
                        <div className="flex items-center gap-2 min-[375px]:gap-3">
                          <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                            <Truck className="h-4 w-4 min-[375px]:h-5 min-[375px]:w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${tw.text.primary}`}>
                              {m.tierEmoji} Mudanza {m.tierNombre}
                            </p>
                            <p className={`mt-0.5 text-xs truncate ${tw.text.secondary}`}>
                              {m.direccionOrigen.split(',')[0]} → {m.direccionDestino.split(',')[0]}
                            </p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <Badge variant={badge.variant} showPulse={badge.pulse}>
                              {badge.label}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historial */}
            <div ref={historialRef} data-onboarding="client-history">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h2 className={`text-base min-[375px]:text-lg font-semibold ${tw.text.primary}`}>
                    Historial de trabajos
                  </h2>
                  {sinCalificar > 0 && (
                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Tenés {sinCalificar} {sinCalificar === 1 ? 'trabajo' : 'trabajos'} sin calificar — ¡tu opinión ayuda a la comunidad!
                    </p>
                  )}
                </div>
              </div>

              {loadingHistorial ? (
                <SkeletonHistorial />
              ) : historialError ? (
                <Card><ErrorState compact message="No pudimos cargar tu historial." onRetry={() => refetchHistorial()} /></Card>
              ) : trabajosCompletados.length > 0 ? (
                <div className="space-y-2 min-[375px]:space-y-3">
                  {trabajosCompletados.map((trabajo: any) => (
                    <Card key={trabajo.id} hover onClick={() => navigate(ROUTES.CLIENT.COMPLETED(trabajo.id))}>
                      <div className="flex items-center gap-2 min-[375px]:gap-3">
                        {/* Icono */}
                        <div className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                          <CheckCircle className="h-4 w-4 min-[375px]:h-5 min-[375px]:w-5" />
                        </div>
                        {/* Nombre + oficio + estrellas */}
                        <div className="flex-1 min-w-0">
                          <h3 className={`mb-0.5 font-semibold text-sm truncate ${tw.text.primary}`}>
                            {trabajo.proveedorNombre}
                          </h3>
                          <p className={`text-xs truncate ${tw.text.secondary}`}>{trabajo.oficio.nombre}</p>
                          {trabajo.calificacionEstrellas && (
                            <div className="mt-1 flex items-center gap-0.5">
                              {[1,2,3,4,5].map((s) => (
                                <span key={s} className={`text-xs ${s <= trabajo.calificacionEstrellas ? 'text-amber-400' : 'text-slate-200 dark:text-dark-border'}`}>★</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Badge + fecha */}
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {trabajo.calificado
                            ? <Badge variant="success">Completado</Badge>
                            : <Badge variant="neutral">Sin calificar</Badge>
                          }
                          <span className={`text-xs ${tw.text.secondary}`}>
                            {new Date(trabajo.completedAt).toLocaleDateString('es-AR')}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {hasNextPage && (
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className={`mx-auto mt-1 block text-xs font-medium cursor-pointer disabled:opacity-50 ${tw.text.brand}`}
                    >
                      {isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
                    </button>
                  )}
                </div>
              ) : (
                <Card>
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
                      <ClipboardList className={`h-5 w-5 ${tw.text.faint}`} />
                    </div>
                    <div>
                      <h3 className={`mb-1 text-sm font-semibold ${tw.text.primary}`}>
                        Aún no tenés trabajos completados
                      </h3>
                      <p className={`text-xs ${tw.text.secondary}`}>
                        Tus servicios finalizados aparecerán aquí
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
