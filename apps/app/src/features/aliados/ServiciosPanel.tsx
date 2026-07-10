import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { apiClient } from '@/shared/lib/apiClient';
import { formatDateTime } from '@/shared/lib/dayjs';
import { formatServicioId, type TipoServicio } from '@/shared/lib/servicioId';
import { ErrorState } from '@/shared/components/ui/ErrorState';

interface ServicioAdminItem {
  tipo: TipoServicio;
  id: number;
  oficio: string;
  estado: string;
  clienteNombre: string | null;
  proveedorNombre: string | null;
  direccion: string;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  precio: number | null;
  motivoCancelacion: string | null;
}

interface ServiciosResponse {
  items: ServicioAdminItem[];
  total: number;
}

type TipoFiltro = '' | 'TRABAJO' | 'MUDANZA';

const TIPOS: { key: TipoFiltro; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'TRABAJO', label: 'Trabajos' },
  { key: 'MUDANZA', label: 'Mudanzas' },
];

const ESTADOS_TRABAJO = ['PENDIENTE', 'PROPUESTO', 'EN_CURSO', 'EN_COLA', 'COMPLETADO', 'CANCELADO'];
const ESTADOS_MUDANZA = ['PENDIENTE', 'RESERVADO', 'CONTRAPROPUESTO', 'ACEPTADO', 'EN_CURSO', 'FINALIZADO', 'PENDIENTE_PAGO_EXTRA', 'COMPLETADO', 'CANCELADO'];
const ESTADOS_COMUNES = ['PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'CANCELADO'];

const ESTADO_CHIP: Record<string, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  PROPUESTO: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-dark-brand',
  RESERVADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  CONTRAPROPUESTO: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  ACEPTADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  EN_CURSO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  EN_COLA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  FINALIZADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  PENDIENTE_PAGO_EXTRA: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  COMPLETADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  CANCELADO: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
};

const PAGE_SIZE = 10;

function estadosDisponibles(tipo: TipoFiltro): string[] {
  if (tipo === 'TRABAJO') return ESTADOS_TRABAJO;
  if (tipo === 'MUDANZA') return ESTADOS_MUDANZA;
  return ESTADOS_COMUNES;
}

export function ServiciosPanel() {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<TipoFiltro>('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(0);
  const [applied, setApplied] = useState<{ q: string; tipo: TipoFiltro; estado: string } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data, isFetching, isError, refetch } = useQuery<ServiciosResponse>({
    queryKey: ['admin-servicios', applied, page],
    queryFn: () =>
      apiClient.get(
        `/api/admin/servicios?q=${encodeURIComponent(applied!.q)}&tipo=${applied!.tipo}` +
        `&estado=${applied!.estado}&page=${page}&size=${PAGE_SIZE}`,
      ),
    enabled: applied !== null,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Servicios</h2>

      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setExpandido(null);
          setApplied({ q, tipo, estado });
        }}
      >
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Buscar servicio por número"
            className="w-full rounded border border-slate-300 py-1 pl-8 pr-2 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="#T-123, #M-45 o 123"
          />
        </div>
        <select
          aria-label="Filtrar por tipo de servicio"
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoFiltro);
            setEstado(''); // los estados válidos cambian con el tipo
          }}
        >
          {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select
          aria-label="Filtrar por estado"
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Estado: todos</option>
          {estadosDisponibles(tipo).map((e) => <option key={e} value={e}>{e.replaceAll('_', ' ')}</option>)}
        </select>
        <button type="submit" className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700">
          Buscar
        </button>
      </form>

      {applied === null ? (
        <p className="text-sm text-slate-500">
          Buscá por número (#T-123, #M-45 o solo el número) o filtrá por tipo y estado. Dejá vacío y «Buscar» para ver todos.
        </p>
      ) : isError ? (
        <ErrorState compact message="No se pudo cargar la lista de servicios." onRetry={() => refetch()} />
      ) : isFetching ? (
        <p className="text-sm text-slate-500">Buscando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Sin resultados{applied.q.trim() ? ` para «${applied.q.trim()}»` : ''}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            {items.map((s) => {
              const key = `${s.tipo}-${s.id}`;
              const abierto = expandido === key;
              return (
                <div key={key} className="border-b border-slate-100 py-2 last:border-b-0 dark:border-dark-border">
                  <button
                    type="button"
                    onClick={() => setExpandido(abierto ? null : key)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
                      {formatServicioId(s.tipo, s.id)}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {s.oficio}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_CHIP[s.estado] ?? 'bg-slate-100 text-slate-600'}`}>
                      {s.estado.replaceAll('_', ' ')}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-500 sm:block">
                      {s.clienteNombre ?? '(sin nombre)'}{s.proveedorNombre ? ` → ${s.proveedorNombre}` : ''}
                    </span>
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                      {formatDateTime(s.createdAt)}
                    </span>
                    {abierto ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  </button>
                  {abierto && (
                    <dl className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-slate-50 p-3 text-xs dark:bg-dark-bg sm:grid-cols-2">
                      <div><dt className="inline font-medium text-slate-500">Cliente: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.clienteNombre ?? '—'}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Proveedor: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.proveedorNombre ?? '—'}</dd></div>
                      <div className="sm:col-span-2"><dt className="inline font-medium text-slate-500">Dirección: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.direccion}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Creado: </dt><dd className="inline text-slate-700 dark:text-slate-300">{formatDateTime(s.createdAt)}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Aceptado: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.acceptedAt ? formatDateTime(s.acceptedAt) : '—'}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Completado: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.completedAt ? formatDateTime(s.completedAt) : '—'}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Precio: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.precio != null ? `$${Number(s.precio).toLocaleString('es-AR')}` : '—'}</dd></div>
                      {s.motivoCancelacion && (
                        <div className="sm:col-span-2"><dt className="inline font-medium text-red-500">Motivo cancelación: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.motivoCancelacion}</dd></div>
                      )}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">{total} resultados · página {page + 1} de {totalPages}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-dark-border dark:text-slate-300"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-dark-border dark:text-slate-300"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
