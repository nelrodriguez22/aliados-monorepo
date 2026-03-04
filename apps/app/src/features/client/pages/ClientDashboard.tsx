import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { useEffect, useState, useRef, type JSX } from "react";
import { usePushNotifications } from "@/shared/hooks/usePushNotifications";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery } from "@tanstack/react-query";
import { Search, Bell, CheckCircle, Clock, ClipboardList } from "lucide-react";
import { useStore } from "@/shared/store/useStore";
import { getToken } from "@/shared/lib/getToken";
import { Skeleton } from "@/shared/components/ui/Skeleton";

// ── SVG icons por oficio ──
const OFICIO_ICONS: Record<number, JSX.Element> = {
  1: ( // Electricista
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z"/>
    </svg>
  ),
  2: ( // Plomero
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  3: ( // Cerrajero
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  4: ( // Gasista
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c0 6-6 8-6 13a6 6 0 0012 0c0-5-6-7-6-13z"/>
      <path d="M9 17.5c0 1.5 1.5 2.5 3 2.5s3-1 3-2.5"/>
    </svg>
  ),
};

const OFICIOS = [
  { id: 1, nombre: 'Electricista' },
  { id: 2, nombre: 'Plomero' },
  { id: 3, nombre: 'Cerrajero' },
  { id: 4, nombre: 'Gasista' },
];

const ICON_BG_CLASSES = [
  "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
  "bg-brand-50 text-brand-600 dark:bg-dark-brand/10 dark:text-dark-brand",
  "bg-slate-100 text-slate-600 dark:bg-dark-elevated dark:text-dark-text-secondary",
  "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
];

// ── Skeletons ──
function SkeletonServicios() {
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <div className="flex flex-col items-center gap-3 text-center">
            <Skeleton className="h-16 w-16 rounded-2xl!" />
            <Skeleton className="h-4 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function SkeletonTrabajos() {
  return (
    <div className="space-y-4">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-full!" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-28 rounded-full!" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function SkeletonHistorial() {
  return (
    <div className="space-y-4">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-full!" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <Skeleton className="h-6 w-24 rounded-full!" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Componente principal ──
export function ClientDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const historialRef = useRef<HTMLDivElement>(null);
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [showHistory, setShowHistory] = useState(() => searchParams.get('view') === 'all');

  const { data: todosTrabajos = [], isLoading: loadingTrabajos } = useQuery({
    queryKey: ['trabajos-cliente'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/cliente`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar trabajos');
      return res.json();
    },
    staleTime: 30000,
    refetchOnMount: true,
  });

  const trabajosActivos = todosTrabajos.filter((t: any) =>
    ['PENDIENTE', 'EN_CURSO', 'PROPUESTO', 'EN_COLA'].includes(t.estado)
  );
  const trabajosCompletados = todosTrabajos.filter((t: any) => t.estado === 'COMPLETADO');

  const removeAccents = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filteredOficios = searchQuery.trim().length > 0
    ? OFICIOS.filter((o) =>
        removeAccents(o.nombre.toLowerCase()).includes(removeAccents(searchQuery.toLowerCase()))
      )
    : OFICIOS;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleServiceClick = (oficioId: number) =>
    navigate(`${ROUTES.CLIENT.SERVICE_REQUEST}?oficioId=${oficioId}`);

  const handleSuggestionClick = (oficio: typeof OFICIOS[0]) => {
    setSearchQuery(oficio.nombre);
    setShowSuggestions(false);
    handleServiceClick(oficio.id);
  };

  useEffect(() => {
    if (isSupported && permission === 'default') setShowNotificationBanner(true);
  }, [isSupported, permission]);

  useEffect(() => {
    if (searchParams.get('view') === 'all') {
      setShowHistory(true);
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

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>

        {/* Banner notificaciones */}
        {showNotificationBanner && (
          <div className={`rounded-xl border px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap
            bg-brand-50 border-brand-100 dark:bg-dark-brand/8 dark:border-dark-brand/20`}>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-600 dark:text-dark-brand shrink-0" />
              <p className={`text-sm ${tw.text.secondary}`}>
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
                Ahora no
              </button>
            </div>
          </div>
        )}

        {/* Bienvenida */}
        <div className="mb-8">
          <h1 className={`mb-1 text-3xl font-bold ${tw.text.primary}`}>
            Hola, {user?.name || 'Usuario'}
          </h1>
          <p className={tw.text.secondary}>¿Qué servicio necesitás hoy?</p>
        </div>

        {/* Buscador */}
        <Card className="mb-8">
          <div className="relative" ref={searchRef}>
            <div className="flex gap-3">
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
              <Button onClick={() => navigate(ROUTES.CLIENT.SERVICE_REQUEST)}>
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
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${ICON_BG_CLASSES[oficio.id - 1]}`}>
                      {OFICIO_ICONS[oficio.id]}
                    </span>
                    <span className={`font-medium text-sm ${tw.text.primary}`}>{oficio.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {loadingTrabajos ? (
          <>
            <div className="mb-12"><Skeleton className="h-5 w-40 mb-4" /><SkeletonServicios /></div>
            <div className="mb-12"><Skeleton className="h-5 w-36 mb-4" /><SkeletonTrabajos /></div>
            <div><Skeleton className="h-5 w-44 mb-4" /><SkeletonHistorial /></div>
          </>
        ) : (
          <>
            {/* Servicios populares */}
            <div className="mb-12">
              <h2 className={`mb-4 text-lg font-semibold ${tw.text.primary}`}>
                Servicios populares
              </h2>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {OFICIOS.map((oficio, index) => (
                  <Card key={oficio.id} hover onClick={() => handleServiceClick(oficio.id)}>
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${ICON_BG_CLASSES[index]}`}>
                        {OFICIO_ICONS[oficio.id]}
                      </div>
                      <span className={`font-medium text-sm ${tw.text.primary}`}>
                        {oficio.nombre}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Trabajos activos */}
            <div className="mb-12">
              <h2 className={`mb-4 text-lg font-semibold ${tw.text.primary}`}>
                Trabajos activos
              </h2>

              {trabajosActivos.length > 0 ? (
                <div className="space-y-3">
                  {trabajosActivos.map((trabajo: any) => {
                    const estadoBadge = getEstadoBadge(trabajo.estado);
                    return (
                      <Card key={trabajo.id} hover onClick={() =>
                        navigate(trabajo.estado === 'PROPUESTO'
                          ? ROUTES.CLIENT.PROPOSAL(trabajo.id)
                          : ROUTES.CLIENT.TRACKING(trabajo.id))
                      }>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                              {OFICIO_ICONS[trabajo.oficio.id] ?? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
                                </svg>
                              )}
                            </div>
                            <div>
                              <div className="mb-1 flex items-center gap-2 flex-wrap">
                                <h3 className={`font-semibold text-sm ${tw.text.primary}`}>
                                  {trabajo.proveedorNombre || 'Buscando proveedor...'}
                                </h3>
                                <Badge variant={estadoBadge.variant} showPulse={estadoBadge.pulse}>
                                  {estadoBadge.label}
                                </Badge>
                              </div>
                              <p className={`text-xs ${tw.text.secondary}`}>{trabajo.oficio.nombre}</p>
                            </div>
                          </div>
                          {trabajo.tiempoEstimadoMinutos && (
                            <div className="shrink-0 flex items-center gap-1.5">
                              <Clock className={`h-3.5 w-3.5 ${tw.text.faint}`} />
                              <span className={`text-sm font-medium ${tw.text.secondary}`}>
                                {trabajo.tiempoEstimadoMinutos} min
                              </span>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
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

            {/* Historial */}
            <div ref={historialRef}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${tw.text.primary}`}>
                  Historial de trabajos
                </h2>
                {trabajosCompletados.length > 3 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`text-xs font-medium cursor-pointer ${tw.text.brand}`}
                  >
                    {showHistory ? 'Ver menos' : `Ver todos (${trabajosCompletados.length})`}
                  </button>
                )}
              </div>

              {trabajosCompletados.length > 0 ? (
                <div className="space-y-3">
                  {(showHistory ? trabajosCompletados : trabajosCompletados.slice(0, 3)).map((trabajo: any) => (
                    <Card key={trabajo.id} hover onClick={() => navigate(ROUTES.CLIENT.COMPLETED(trabajo.id))}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                            <CheckCircle className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className={`mb-0.5 font-semibold text-sm ${tw.text.primary}`}>
                              {trabajo.proveedorNombre}
                            </h3>
                            <div className={`flex items-center gap-2 text-xs ${tw.text.secondary}`}>
                              <span>{trabajo.oficio.nombre}</span>
                              <span>·</span>
                              <span>{new Date(trabajo.completedAt).toLocaleDateString('es-AR')}</span>
                            </div>
                            {trabajo.calificacionEstrellas && (
                              <div className="mt-1 flex items-center gap-0.5">
                                {[1,2,3,4,5].map((s) => (
                                  <span key={s} className={`text-xs ${s <= trabajo.calificacionEstrellas ? 'text-amber-400' : 'text-slate-200 dark:text-dark-border'}`}>★</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {trabajo.calificado ? (
                          <Badge variant="success">Completado</Badge>
                        ) : (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
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
