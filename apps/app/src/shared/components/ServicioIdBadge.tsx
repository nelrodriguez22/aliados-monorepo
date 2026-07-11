import { useState } from 'react';
import { Check, Copy, HelpCircle } from 'lucide-react';
import { Tooltip } from '@/shared/components/ui/Tooltip';
import { formatServicioId, type TipoServicio } from '@/shared/lib/servicioId';

interface Props {
  tipo: TipoServicio;
  id: number | undefined | null;
  className?: string;
}

const AYUDA =
  'Este es el ID único de la operación. Guardalo como referencia para hacer reclamos o consultas a soporte.';

// Número identificador del servicio, discreto: no compite con el título.
export function ServicioIdBadge({ tipo, id, className = '' }: Props) {
  const [copiado, setCopiado] = useState(false);
  if (id == null) return null;
  const codigo = formatServicioId(tipo, id);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Portapapeles no disponible (contexto inseguro): el número sigue visible para copiar a mano.
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{codigo}</span>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${codigo}`}
        className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
      >
        {copiado ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
      <Tooltip text={AYUDA} multiline position="bottom">
        <HelpCircle className="h-3 w-3 text-slate-400 dark:text-slate-500" />
      </Tooltip>
    </span>
  );
}
