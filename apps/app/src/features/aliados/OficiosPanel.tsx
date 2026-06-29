import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

interface OficioAdmin {
  id: number;
  nombre: string;
  icono: string;
  activo: boolean;
  exclusivo: boolean;
}

export function OficiosPanel() {
  const queryClient = useQueryClient();
  const { data: oficios = [], isLoading } = useQuery<OficioAdmin[]>({
    queryKey: ['admin-oficios'],
    queryFn: () => apiClient.get('/api/admin/oficios'),
    staleTime: 1000 * 60 * 10, // 10 min: lista chica que cambia muy rara vez → evita refetch en cada apertura del tab.
  });

  const toggle = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiClient.patch(`/api/admin/oficios/${id}`, { activo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-oficios'] }),
    onError: () => toast.error('No se pudo actualizar el oficio'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Cargando oficios…</p>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Oficios</h2>
      <div className="flex flex-col gap-2">
        {oficios.map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-dark-border"
          >
            <span className="text-lg">{o.icono}</span>
            <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">{o.nombre}</span>
            {o.exclusivo && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-dark-bg dark:text-slate-400">
                exclusivo
              </span>
            )}
            <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={o.activo}
                disabled={toggle.isPending}
                onChange={(e) => toggle.mutate({ id: o.id, activo: e.target.checked })}
              />
              {o.activo ? 'activo' : 'inactivo'}
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
