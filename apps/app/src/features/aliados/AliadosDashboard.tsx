import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/apiClient';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { tw } from '@/shared/styles/design-system';
import {
  Users, Wrench, Clock, CheckCircle, XCircle,
  FileText, Star, Loader2, Bug, ChevronDown, ExternalLink,
  Wifi, AlertTriangle, TrendingUp, PowerOff, Truck,
} from 'lucide-react';
import { FeatureFlagsPanel } from './FeatureFlagsPanel';
import { MaintenancePanel } from './MaintenancePanel';
import { BroadcastPanel } from './BroadcastPanel';

const STAT_CONFIG = [
  { key: 'clientes',    label: 'Clientes',        icon: Users,        bg: tw.iconBg.brand,  color: 'text-brand-600 dark:text-dark-brand' },
  { key: 'proveedores', label: 'Proveedores',      icon: Wrench,       bg: tw.iconBg.green,  color: 'text-green-600 dark:text-green-400' },
  { key: 'totales',     label: 'Trabajos totales', icon: FileText,     bg: tw.iconBg.slate,  color: tw.text.secondary },
  { key: 'completados', label: 'Completados',      icon: CheckCircle,  bg: tw.iconBg.green,  color: 'text-green-600 dark:text-green-400' },
  { key: 'enCurso',     label: 'En curso',         icon: Clock,        bg: tw.iconBg.amber,  color: 'text-amber-600 dark:text-amber-400' },
  { key: 'cancelados',  label: 'Cancelados',       icon: XCircle,      bg: 'bg-red-50 dark:bg-red-900/15', color: 'text-red-500 dark:text-red-400' },
] as const;

const CAT_STYLE: Record<string, { label: string; cls: string }> = {
  UI:            { label: 'UI / Visual',    cls: 'bg-brand-50 text-brand-700 dark:bg-dark-brand/15 dark:text-dark-brand' },
  FUNCIONALIDAD: { label: 'Funcionalidad',  cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  ERROR_TECNICO: { label: 'Error técnico',  cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  OTRO:          { label: 'Otro',           cls: 'bg-slate-100 text-slate-600 dark:bg-dark-elevated dark:text-dark-text-secondary' },
};

const MUDANZA_ESTADO_STYLE: Record<string, { label: string; cls: string }> = {
  PENDIENTE:          { label: 'Pendiente',          cls: 'text-amber-600 dark:text-amber-400' },
  RESERVADO:          { label: 'Reservado',           cls: 'text-brand-600 dark:text-dark-brand' },
  CONTRAPROPUESTO:    { label: 'Contrapropuesto',     cls: 'text-orange-600 dark:text-orange-400' },
  ACEPTADO:           { label: 'Aceptado',            cls: 'text-sky-600 dark:text-sky-400' },
  EN_CURSO:           { label: 'En curso',            cls: 'text-green-600 dark:text-green-400' },
  FINALIZADO:         { label: 'Finalizado',          cls: 'text-green-700 dark:text-green-300' },
  PENDIENTE_PAGO_EXTRA: { label: 'Pago extra',        cls: 'text-purple-600 dark:text-purple-400' },
  COMPLETADO:         { label: 'Completado',          cls: 'text-green-600 dark:text-green-400' },
  CANCELADO:          { label: 'Cancelado',           cls: 'text-red-500 dark:text-red-400' },
};

function BugRow({ report }: { report: any }) {
  const [open, setOpen] = useState(false);
  const cat = CAT_STYLE[report.categoria] ?? CAT_STYLE.OTRO;
  const fecha = new Date(report.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`border-b last:border-0 ${tw.dividerLight}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-dark-elevated cursor-pointer"
      >
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cat.cls}`}>{cat.label}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${tw.text.primary}`}>{report.titulo}</p>
          <p className={`text-xs mt-0.5 ${tw.text.muted}`}>{report.usuarioNombre} · {fecha}</p>
        </div>
        <ChevronDown size={15} className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`px-4 pb-4 space-y-2 text-sm ${tw.text.secondary}`}>
          <p className="leading-relaxed">{report.descripcion}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className={tw.text.muted}>{report.usuarioEmail}</span>
            {/^https?:\/\//i.test(report.url ?? '') && (
              <a href={report.url} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-1 ${tw.text.brand} hover:underline`}>
                <ExternalLink size={11} /> Ver página
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} className={i <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-dark-elevated'} />
      ))}
    </span>
  );
}

function SectionCard({ title, icon: Icon, iconColor, badge, children }: {
  title: string; icon: React.ElementType; iconColor: string; badge?: number; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dark-border">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>{title}</h2>
        </div>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const apiFetch = (path: string) => apiClient.get(path);

const AliadosDashboard = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'stats' | 'config'>('stats');

  const { data: stats, isLoading, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => apiFetch('/api/admin/stats'),
    refetchInterval: 60000,
  });

  const { data: bugReports = [], isError: bugError, refetch: refetchBugs } = useQuery({
    queryKey: ['admin-bug-reports'],
    queryFn: () => apiFetch('/api/bug-reports'),
    refetchInterval: 60000,
  });

  const { data: proveedoresActivos = [], isError: provError, refetch: refetchProv } = useQuery({
    queryKey: ['admin-providers-active'],
    queryFn: () => apiFetch('/api/admin/providers/active'),
    refetchInterval: 30000,
  });

  const { data: ratingsData, isError: ratingsError, refetch: refetchRatings } = useQuery({
    queryKey: ['admin-ratings'],
    queryFn: () => apiFetch('/api/admin/ratings/recent'),
    refetchInterval: 120000,
  });

  const { data: alertasData } = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: () => apiFetch('/api/admin/alerts'),
    refetchInterval: 30000,
  });

  const forceOffline = useMutation({
    mutationFn: (id: number) => apiClient.patch(`/api/admin/providers/${id}/offline`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-providers-active'] }),
  });

  if (statsError) {
    return (
      <ErrorState
        title="No pudimos cargar el panel"
        message="Ocurrió un error al obtener las estadísticas. Reintentá en un momento."
        onRetry={() => refetchStats()}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }
  if (!stats) return null;

  const statValues: Record<string, { value: number; sub?: string }> = {
    clientes:    { value: stats.totalClientes },
    proveedores: { value: stats.totalProveedores, sub: `${stats.proveedoresOnline} online · ${stats.proveedoresBusy} ocupados` },
    totales:     { value: stats.totalTrabajos },
    completados: { value: stats.trabajosCompletados },
    enCurso:     { value: stats.trabajosEnCurso + stats.trabajosEnCola, sub: `${stats.trabajosEnCurso} activos · ${stats.trabajosEnCola} en cola` },
    cancelados:  { value: stats.trabajosCancelados },
  };

  const estadoRows = [
    { label: 'Pendientes',   sub: 'Esperando proveedor',          value: stats.trabajosPendientes,  bg: tw.iconBg.amber,   text: 'text-amber-700 dark:text-amber-400'   },
    { label: 'Propuestos',   sub: 'Esperando respuesta',          value: stats.trabajosPropuestos,  bg: tw.iconBg.brand,   text: 'text-brand-700 dark:text-dark-brand'  },
    { label: 'En curso',     sub: 'Proveedor trabajando',         value: stats.trabajosEnCurso,     bg: tw.iconBg.green,   text: 'text-green-700 dark:text-green-400'   },
  ];

  const funnel = stats.funnel ?? {};
  const mudanzas: Record<string, number> = stats.mudanzas ?? {};
  const trabajosVarados: any[] = alertasData?.trabajosVarados ?? [];
  const calificacionesRecientes: any[] = ratingsData?.recientes ?? [];
  const proveedoresBajos: any[] = ratingsData?.proveedoresBajaCalificacion ?? [];

  return (
    <div className={`${tw.pageBg} min-h-screen`}>
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Panel de administración</h1>
          <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>Estadísticas en tiempo real de Aliados</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {([['stats', 'Estadísticas'], ['config', 'Configuración']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-brand-600 text-white'
                  : `bg-slate-100 ${tw.text.secondary} hover:bg-slate-200 dark:bg-dark-bg dark:hover:bg-dark-elevated`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'stats' && (
          <>

        {/* Alertas — trabajos varados */}
        {trabajosVarados.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {trabajosVarados.length} {trabajosVarados.length === 1 ? 'trabajo lleva' : 'trabajos llevan'} más de 30 min sin proveedor
                </p>
                <div className="mt-2 space-y-1">
                  {trabajosVarados.map((t: any) => (
                    <p key={t.id} className="text-xs text-amber-600 dark:text-amber-500">
                      #{t.id} · {t.oficio} · {t.direccion} · {t.minutosEsperando} min esperando
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
          {STAT_CONFIG.map(({ key, label, icon: Icon, bg, color }) => {
            const { value, sub } = statValues[key];
            return (
              <div key={key} className={`rounded-2xl border p-4 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
                <div className="mb-3 flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg} ${color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className={`text-xs font-medium ${tw.text.muted}`}>{label}</span>
                </div>
                <p className={`text-2xl font-bold ${tw.text.primary}`}>{value}</p>
                {sub && <p className={`mt-1 text-[10px] leading-relaxed ${tw.text.faint}`}>{sub}</p>}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 mb-4">

          {/* Trabajos por oficio */}
          <div className={`rounded-2xl border p-6 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
            <h2 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
              Trabajos por oficio
            </h2>
            <div className="space-y-3">
              {stats.trabajosPorOficio?.length > 0 ? (
                stats.trabajosPorOficio.map((item: any) => {
                  const pct = ((item.cantidad / (stats.totalTrabajos || 1)) * 100).toFixed(1);
                  return (
                    <div key={item.oficio} className="flex items-center gap-3">
                      <span className={`w-28 truncate text-sm ${tw.text.secondary}`}>{item.oficio}</span>
                      <div className={`flex-1 h-2 rounded-full overflow-hidden ${tw.iconBg.slate}`}>
                        <div
                          className="h-full rounded-full bg-brand-500 dark:bg-dark-brand transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`w-6 text-right text-sm font-semibold ${tw.text.primary}`}>{item.cantidad}</span>
                      <span className={`w-12 text-right text-xs ${tw.text.faint}`}>{pct}%</span>
                    </div>
                  );
                })
              ) : (
                <p className={`text-center py-6 text-sm ${tw.text.muted}`}>Sin datos</p>
              )}
            </div>
          </div>

          {/* Estado actual */}
          <div className={`rounded-2xl border p-6 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
            <h2 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
              Estado actual
            </h2>
            <div className="space-y-2">
              {estadoRows.map(({ label, sub, value, bg, text }) => (
                <div key={label} className={`flex items-center justify-between rounded-xl p-4 ${bg}`}>
                  <div>
                    <p className={`text-sm font-semibold ${text}`}>{label}</p>
                    <p className={`text-xs mt-0.5 ${tw.text.muted}`}>{sub}</p>
                  </div>
                  <p className={`text-2xl font-bold ${text}`}>{value}</p>
                </div>
              ))}

              {/* Calificación promedio */}
              <div className={`flex items-center justify-between rounded-xl p-4 ${tw.iconBg.slate}`}>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                  <div>
                    <p className={`text-sm font-semibold ${tw.text.primary}`}>Calificación promedio</p>
                    <p className={`text-xs mt-0.5 ${tw.text.muted}`}>{stats.totalCalificaciones} calificaciones</p>
                  </div>
                </div>
                <p className={`text-2xl font-bold ${tw.text.primary}`}>
                  {Number(stats.promedioCalificacionGlobal).toFixed(1)}
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Segunda fila: Mudanzas + Funnel */}
        <div className="grid gap-4 lg:grid-cols-2 mb-4">

          {/* Mudanzas por estado */}
          <div className={`rounded-2xl border p-6 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
            <div className="flex items-center gap-2 mb-4">
              <Truck className="h-4 w-4 text-sky-500" />
              <h2 className={`text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>Mudanzas</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(mudanzas).map(([estado, count]) => {
                const style = MUDANZA_ESTADO_STYLE[estado];
                if (!style) return null;
                return (
                  <div key={estado} className={`rounded-xl p-3 ${tw.iconBg.slate}`}>
                    <p className={`text-xs font-medium ${tw.text.muted}`}>{style.label}</p>
                    <p className={`mt-1 text-xl font-bold ${style.cls}`}>{count}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Funnel de conversión */}
          <div className={`rounded-2xl border p-6 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <h2 className={`text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>Funnel de conversión</h2>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Solicitudes recibidas', value: funnel.pendiente, pct: 100, color: 'bg-brand-500 dark:bg-dark-brand' },
                { label: 'Propuesta enviada',     value: funnel.propuesto, pct: funnel.tasaPropuesto, color: 'bg-amber-400' },
                { label: 'Completados',           value: funnel.completado, pct: funnel.tasaCompletado, color: 'bg-green-500' },
              ].map(({ label, value, pct, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${tw.text.secondary}`}>{label}</span>
                    <span className={`text-xs font-semibold ${tw.text.primary}`}>{value} <span className={tw.text.muted}>({pct}%)</span></span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${tw.iconBg.slate}`}>
                    <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
              <p className={`text-xs mt-2 ${tw.text.muted}`}>
                Tasa de éxito (completado vs completado+cancelado): <span className={`font-semibold ${tw.text.primary}`}>{funnel.tasaExito}%</span>
              </p>
            </div>
          </div>

        </div>

        {/* Proveedores en tiempo real */}
        <div className="mb-4">
          <SectionCard title="Proveedores en tiempo real" icon={Wifi} iconColor="text-green-500">
            {provError ? (
              <ErrorState compact message="No se pudo cargar la lista de proveedores." onRetry={() => refetchProv()} />
            ) : proveedoresActivos.length === 0 ? (
              <p className={`px-6 py-8 text-center text-sm ${tw.text.muted}`}>Sin proveedores activos</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-dark-border/50">
                {proveedoresActivos.map((p: any) => (
                  <div key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="relative shrink-0">
                      {p.fotoPerfil ? (
                        <img src={p.fotoPerfil} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold ${tw.iconBg.slate} ${tw.text.secondary}`}>
                          {p.nombre?.[0]}
                        </div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-dark-surface ${p.status === 'BUSY' ? 'bg-amber-400' : 'bg-green-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{p.nombre}</p>
                      <p className={`text-xs ${tw.text.muted}`}>
                        {p.oficio} · {p.status === 'BUSY' ? 'Ocupado' : 'Disponible'}
                      </p>
                      {p.trabajoActual && (
                        <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>
                          Trabajo #{p.trabajoActual.id} — {p.trabajoActual.clienteNombre} · {p.trabajoActual.direccion}
                        </p>
                      )}
                    </div>
                    {p.status === 'BUSY' && (
                      <button
                        type="button"
                        disabled={forceOffline.isPending}
                        onClick={() => forceOffline.mutate(p.id)}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dark-border px-2.5 py-1.5 text-xs text-slate-500 dark:text-dark-text-secondary hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <PowerOff size={11} />
                        Offline
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Calificaciones recientes + proveedores bajos */}
        <div className="grid gap-4 lg:grid-cols-2 mb-4">

          <SectionCard title="Calificaciones recientes" icon={Star} iconColor="text-amber-400">
            {ratingsError ? (
              <ErrorState compact message="No se pudieron cargar las calificaciones." onRetry={() => refetchRatings()} />
            ) : calificacionesRecientes.length === 0 ? (
              <p className={`px-6 py-8 text-center text-sm ${tw.text.muted}`}>Sin calificaciones</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-dark-border/50">
                {calificacionesRecientes.map((c: any) => (
                  <div key={c.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{c.proveedorNombre}</p>
                      <Stars value={c.estrellas} />
                    </div>
                    <p className={`text-xs ${tw.text.muted}`}>por {c.clienteNombre}</p>
                    {c.comentario && (
                      <p className={`mt-1 text-xs leading-relaxed ${tw.text.secondary}`}>"{c.comentario}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Proveedores con baja calificación" icon={AlertTriangle} iconColor="text-red-500" badge={proveedoresBajos.length}>
            {ratingsError ? (
              <ErrorState compact message="No se pudieron cargar los datos." onRetry={() => refetchRatings()} />
            ) : proveedoresBajos.length === 0 ? (
              <p className={`px-6 py-8 text-center text-sm ${tw.text.muted}`}>Sin proveedores bajo umbral</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-dark-border/50">
                {proveedoresBajos.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    {p.fotoPerfil ? (
                      <img src={p.fotoPerfil} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${tw.iconBg.slate} ${tw.text.secondary} shrink-0`}>
                        {p.nombre?.[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{p.nombre}</p>
                      <Stars value={Math.round(p.promedio)} />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-red-500 dark:text-red-400">{Number(p.promedio).toFixed(1)}</p>
                      <p className={`text-xs ${tw.text.muted}`}>{p.total} cal.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

        </div>

        {/* Bug reports */}
        <SectionCard title="Bug reports" icon={Bug} iconColor="text-red-500" badge={bugReports.length}>
          {bugError ? (
            <ErrorState compact message="No se pudieron cargar los reportes." onRetry={() => refetchBugs()} />
          ) : bugReports.length === 0 ? (
            <p className={`px-6 py-8 text-center text-sm ${tw.text.muted}`}>Sin reportes</p>
          ) : (
            <div>
              {bugReports.map((r: any) => <BugRow key={r.id} report={r} />)}
            </div>
          )}
        </SectionCard>

          </>
        )}

        {tab === 'config' && (
          <div className="flex flex-col gap-4">
            <FeatureFlagsPanel />
            <MaintenancePanel />
            <BroadcastPanel />
          </div>
        )}

      </div>
    </div>
  );
};

export default AliadosDashboard;
