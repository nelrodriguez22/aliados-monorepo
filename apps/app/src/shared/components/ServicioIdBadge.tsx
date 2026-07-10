import { formatServicioId, type TipoServicio } from '@/shared/lib/servicioId';

interface Props {
  tipo: TipoServicio;
  id: number | undefined | null;
  className?: string;
}

// Número identificador del servicio, discreto: no compite con el título.
export function ServicioIdBadge({ tipo, id, className = '' }: Props) {
  if (id == null) return null;
  return (
    <span className={`font-mono text-xs text-slate-400 dark:text-slate-500 ${className}`}>
      {formatServicioId(tipo, id)}
    </span>
  );
}
