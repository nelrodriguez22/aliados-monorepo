import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

interface DeployedVersion {
  version: number;
  sha: string;
  builtAt: string;
}

/**
 * Panel del version-gate (Capa 3). Lee la versión que sirve el deploy en vivo
 * (/version.json, sin pasar por SW/cache) y permite forzar a esa versión sin
 * adivinar si el deploy está online: el número sale del deploy real.
 */
export function VersionGatePanel() {
  const queryClient = useQueryClient();

  // Versión que está sirviendo el deploy AHORA (cache-busted, no-store → red real).
  const { data: deployed } = useQuery<DeployedVersion>({
    queryKey: ['deployed-version'],
    queryFn: async () => {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('no version.json');
      return res.json();
    },
    staleTime: 0,
    retry: false,
  });

  // Mínimo forzado actual (Remote Config, vía backend).
  const { data: gate, isLoading } = useQuery<{ minVersion: number }>({
    queryKey: ['admin-version-gate'],
    queryFn: () => apiClient.get('/api/admin/version-gate'),
  });

  const save = useMutation({
    mutationFn: (minVersion: number) => apiClient.put('/api/admin/version-gate', { minVersion }),
    onSuccess: () => {
      toast.success('Version-gate actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-version-gate'] });
    },
    onError: () => toast.error('No se pudo actualizar el version-gate'),
  });

  const minVersion = gate?.minVersion ?? 0;
  const deployedVersion = deployed?.version ?? 0;
  const forzadoActivo = minVersion > 0;

  const forzar = () => {
    if (deployedVersion <= 0) {
      toast.error('No se pudo leer la versión deployada');
      return;
    }
    if (!window.confirm(
      `Esto fuerza a TODOS los clientes con versión menor a ${deployedVersion} a actualizar (recarga obligatoria). Usalo solo tras un deploy rompedor. ¿Confirmás?`
    )) return;
    save.mutate(deployedVersion);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${forzadoActivo ? 'bg-red-500' : 'bg-green-500'}`} />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Actualización forzada {forzadoActivo ? '· Activa' : '· Off'}
        </h2>
      </div>

      <div className="mb-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
        <p>
          Versión deployada (en vivo):{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {deployed ? `${deployedVersion} (${deployed.sha})` : '—'}
          </span>
        </p>
        <p>
          Mínimo forzado actual:{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {isLoading ? '…' : forzadoActivo ? minVersion : 'sin forzado'}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={forzar}
          disabled={save.isPending || deployedVersion <= 0}
          className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Forzar a la versión deployada ({deployedVersion || '—'})
        </button>
        {forzadoActivo && (
          <button
            onClick={() => save.mutate(0)}
            disabled={save.isPending}
            className="rounded bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-dark-bg dark:text-slate-200 disabled:opacity-50"
          >
            Desactivar forzado
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Usalo solo tras un deploy con cambios rompedores. Los deploys normales se
        actualizan solos con el banner "Nueva versión disponible".
      </p>
    </section>
  );
}
