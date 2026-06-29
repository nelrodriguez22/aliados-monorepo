import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

interface UsuarioAdmin {
  id: number;
  nombre: string | null;
  email: string;
  role: string;
  activo: boolean;
  telefono: string | null;
  localidad: string | null;
  status: string | null;
  promedioCalificacion: number | null;
}

type RoleFiltro = '' | 'CLIENT' | 'PROVIDER';
const ROLES: { key: RoleFiltro; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'CLIENT', label: 'Clientes' },
  { key: 'PROVIDER', label: 'Proveedores' },
];

export function UsuariosPanel() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleFiltro>('');
  const [applied, setApplied] = useState<{ q: string; role: RoleFiltro }>({ q: '', role: '' });
  // On-demand: no traemos usuarios al montar (no escala con la base). Solo tras buscar.
  const [searched, setSearched] = useState(false);

  const { data: usuarios = [], isFetching } = useQuery<UsuarioAdmin[]>({
    queryKey: ['admin-usuarios', applied.q, applied.role],
    queryFn: () =>
      apiClient.get(`/api/admin/usuarios?q=${encodeURIComponent(applied.q)}&role=${applied.role}`),
    enabled: searched,
  });

  const toggle = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiClient.patch(`/api/admin/usuarios/${id}`, { activo }),
    onSuccess: () => {
      toast.success('Usuario actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-usuarios'] });
    },
    onError: () => toast.error('No se pudo actualizar el usuario'),
  });

  const handleToggle = (u: UsuarioAdmin) => {
    if (u.activo && !window.confirm(`¿Suspender a ${u.nombre || u.email}? No podrá usar la app.`)) return;
    toggle.mutate({ id: u.id, activo: !u.activo });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Usuarios</h2>
      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ q, role });
          setSearched(true);
        }}
      >
        <input
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o email" />
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={role} onChange={(e) => setRole(e.target.value as RoleFiltro)}>
          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <button type="submit" className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700">
          Buscar
        </button>
      </form>
      {!searched ? (
        <p className="text-sm text-slate-500">Buscá por nombre, email o rol (dejá vacío y "Buscar" para ver todos).</p>
      ) : isFetching ? (
        <p className="text-sm text-slate-500">Buscando…</p>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-slate-500">Sin resultados</p>
      ) : (
        <div className="flex flex-col gap-2">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-dark-border">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {u.nombre || '(sin nombre)'} {!u.activo && <span className="text-xs text-red-500">· suspendido</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email} · {u.role}</p>
              </div>
              <button
                onClick={() => handleToggle(u)}
                disabled={toggle.isPending}
                className={`rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${
                  u.activo
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400'
                }`}
              >
                {u.activo ? 'Suspender' : 'Reactivar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
