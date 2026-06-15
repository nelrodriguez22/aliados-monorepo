import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getToken } from '@/shared/lib/getToken';
import { tw } from '@/shared/styles/design-system';
import {
  Users, Wrench, Clock, CheckCircle, XCircle,
  FileText, Star, Loader2, Bug, ChevronDown, ExternalLink,
} from 'lucide-react';

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

const AliadosDashboard = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al cargar estadísticas');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: bugReports = [] } = useQuery({
    queryKey: ['admin-bug-reports'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/bug-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    refetchInterval: 60000,
  });

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

  return (
    <div className={`${tw.pageBg} min-h-screen`}>
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Panel de administración</h1>
          <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>Estadísticas en tiempo real de Aliados</p>
        </div>

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

        <div className="grid gap-4 lg:grid-cols-2">

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

        {/* Bug reports */}
        <div className={`mt-4 rounded-2xl border bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dark-border">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-red-500" />
              <h2 className={`text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>Bug reports</h2>
            </div>
            {bugReports.length > 0 && (
              <span className="rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                {bugReports.length}
              </span>
            )}
          </div>
          {bugReports.length === 0 ? (
            <p className={`px-6 py-8 text-center text-sm ${tw.text.muted}`}>Sin reportes</p>
          ) : (
            <div>
              {bugReports.map((r: any) => <BugRow key={r.id} report={r} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AliadosDashboard;
