import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';
import { type FeatureFlag, validateFlagValue } from './featureFlags';
import { Tooltip } from '@/shared/components/ui/Tooltip';
import { Info } from 'lucide-react';

// Descripción detallada por flag (la `description` del backend es muy corta).
// Se muestra en un tooltip al pasar el mouse por el ícono ℹ️ del renglón.
const FLAG_DETAILS: Record<string, string> = {
  limite_trabajos_default:
    'Máximo de trabajos simultáneos (en curso + en cola) que puede tener un proveedor. Al llegar al tope deja de recibir nuevas ofertas hasta que libere uno.',
  limite_trabajos_flete:
    'Igual que el límite default pero para proveedores de fletes/mudanzas, que manejan otra cantidad de trabajos a la vez.',
  mudanza_comision_porcentaje:
    'Porcentaje que la plataforma cobra de comisión sobre el precio de una mudanza (ej. 10 = 10%).',
  mudanza_ratio_tiempo:
    'Acelerador de tiempos de mudanza para testing: comprime los tiempos reales por este factor. ⚠️ Debe estar en 1 (o desactivado) en producción real.',
  score_peso_calificacion:
    'Peso de la calificación (estrellas) en el score del proveedor, de 0 a 1. Junto con aceptación y velocidad suma ~1. Default 0.40. Subilo para que la calidad pese más al asignar trabajos.',
  score_peso_aceptacion:
    'Peso de la tasa de aceptación (de los trabajos que tomó, cuántos no canceló) en el score, de 0 a 1. Default 0.35.',
  score_peso_velocidad:
    'Peso de la velocidad de respuesta (qué tan rápido responde las ofertas) en el score, de 0 a 1. Default 0.25.',
  score_tiempo_max_respuesta_min:
    'Minutos de referencia para normalizar la velocidad: responder en 0 min = 100 puntos; tardar este valor o más = 0. Default 30.',
  score_peso_respuesta_ofertas:
    'Peso de la tasa de respuesta a ofertas (de las ofertas que recibió, a cuántas respondió vs cuántas ignoró) en el score, de 0 a 1. Default 0.20. Subilo para penalizar más a los que dejan pasar ofertas.',
  trabajo_oferta_grupo_tamano:
    'A cuántos proveedores (los mejores por score) se le ofrece el trabajo a la vez. Default 10. Bajalo (ej. 1 o 2) para que el mejor rankeado reciba primero y los demás solo si no responde.',
  trabajo_oferta_grupo_intervalo_min:
    'Minutos que se espera la respuesta de un grupo antes de pasar al siguiente grupo de proveedores. Default 5. Si nadie responde y no quedan más proveedores, el trabajo se cancela.',
};

export function FeatureFlagsPanel() {
  const queryClient = useQueryClient();
  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['admin-feature-flags'],
    queryFn: () => apiClient.get('/api/admin/feature-flags'),
  });

  const save = useMutation({
    mutationFn: ({ key, enabled, value }: { key: string; enabled: boolean; value: string | null }) =>
      apiClient.put(`/api/admin/feature-flags/${key}`, { enabled, value }),
    onSuccess: () => {
      toast.success('Flag actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
    },
    onError: () => toast.error('No se pudo actualizar el flag'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Cargando flags…</p>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Feature flags</h2>
      <div className="flex flex-col gap-3">
        {flags.map((f) => (
          <FlagRow key={f.key} flag={f} onSave={(enabled, value) => save.mutate({ key: f.key, enabled, value })} />
        ))}
      </div>
    </section>
  );
}

function FlagRow({ flag, onSave }: { flag: FeatureFlag; onSave: (enabled: boolean, value: string | null) => void }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [value, setValue] = useState(flag.value ?? '');
  const isBool = flag.valueType === 'BOOLEAN';

  useEffect(() => {
    setEnabled(flag.enabled);
    setValue(flag.value ?? '');
  }, [flag.enabled, flag.value]);

  const handleSave = () => {
    if (!isBool) {
      const err = validateFlagValue(flag.valueType, value);
      if (err) {
        toast.error(err);
        return;
      }
    }
    onSave(enabled, isBool ? null : value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 dark:border-dark-border">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-slate-800 dark:text-slate-100">{flag.key}</p>
          {FLAG_DETAILS[flag.key] && (
            <Tooltip text={FLAG_DETAILS[flag.key]} position="top" multiline>
              <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-slate-400" />
            </Tooltip>
          )}
        </div>
        {flag.description && <p className="text-xs text-slate-500">{flag.description}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {enabled ? 'on' : 'off'}
      </label>
      {!isBool && (
        <input
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={flag.valueType}
        />
      )}
      <button
        onClick={handleSave}
        className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700"
      >
        Guardar
      </button>
    </div>
  );
}
