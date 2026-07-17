import { useQuery } from '@tanstack/react-query';
import { User, Wrench, Cog } from 'lucide-react';
import { apiClient } from '@/shared/lib/apiClient';
import { formatDateTime } from '@/shared/lib/dayjs';
import type { TipoServicio } from '@/shared/lib/servicioId';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { ESTADO_CHIP } from './estadoChips';

// Contrato de GET /api/admin/{trabajos|mudanzas}/{id}/eventos (PR #45).
interface EventoAdmin {
  id: number;
  tipo: 'CAMBIO_ESTADO' | 'CAMBIO_ESTADO_PAGO';
  valorAnterior: string | null; // null = nacimiento del eje (∅)
  valorNuevo: string;
  actorTipo: 'CLIENTE' | 'PROVEEDOR' | 'SISTEMA' | 'ADMIN';
  actorNombre: string | null; // null cuando SISTEMA
  detalle: string | null;
  createdAt: string;
}

const ICONO_ACTOR = {
  CLIENTE: User,
  PROVEEDOR: Wrench,
  SISTEMA: Cog,
  ADMIN: Cog,
} as const;

function labelActor(e: EventoAdmin): string {
  return e.actorNombre ? `${e.actorNombre} (${e.actorTipo.toLowerCase()})` : 'Sistema';
}

function Chip({ valor }: { valor: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_CHIP[valor] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
    >
      {valor.replaceAll('_', ' ')}
    </span>
  );
}

/**
 * Timeline del audit log de un servicio, para la fila expandida de la pestaña
 * Servicios. Se monta solo al expandir → el fetch es lazy sin código extra, y
 * el cache de react-query evita re-pedir al re-expandir el mismo servicio.
 * Orden: el backend devuelve id ASC (cronológico); se pinta tal cual, el más
 * nuevo abajo — orden natural de lectura de un caso.
 */
export function EventosTimeline({ tipo, id }: { tipo: TipoServicio; id: number }) {
  const base = tipo === 'TRABAJO' ? 'trabajos' : 'mudanzas';
  const { data, isFetching, isError, refetch } = useQuery<EventoAdmin[]>({
    queryKey: ['admin-eventos', tipo, id],
    queryFn: () => apiClient.get(`/api/admin/${base}/${id}/eventos`),
    // Sin retry de react-query a propósito: apiClient ya reintenta GETs (2 veces
    // con backoff ante 502/503/504); duplicarlo acá multiplicaría requests y
    // demoraría el ErrorState ante errores no transitorios (403/404).
    retry: false,
  });

  if (isError) {
    return <ErrorState compact message="No se pudo cargar el historial." onRetry={() => refetch()} />;
  }
  if (isFetching && !data) {
    return <p className="text-xs text-slate-500">Cargando historial…</p>;
  }
  if (!data || data.length === 0) {
    // Los servicios anteriores a la migración V12 no tienen eventos: es un
    // vacío esperado, no un error.
    return <p className="text-xs text-slate-500">Sin historial — servicio anterior al registro de eventos.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {data.map((e) => {
        const Icono = ICONO_ACTOR[e.actorTipo] ?? Cog;
        return (
          <li key={e.id} className="flex items-start gap-2">
            <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {e.tipo === 'CAMBIO_ESTADO_PAGO' && (
                  <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    PAGO
                  </span>
                )}
                {e.valorAnterior !== null && (
                  <>
                    <Chip valor={e.valorAnterior} />
                    <span className="text-[10px] text-slate-400">→</span>
                  </>
                )}
                <Chip valor={e.valorNuevo} />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">{labelActor(e)}</span>
                <span className="text-[10px] text-slate-400">{formatDateTime(e.createdAt)}</span>
              </div>
              {e.detalle && (
                <p className="mt-0.5 break-words text-[11px] italic text-slate-500 dark:text-slate-400">{e.detalle}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
