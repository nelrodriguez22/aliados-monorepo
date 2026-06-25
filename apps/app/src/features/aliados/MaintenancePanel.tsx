import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';
import { type MaintenanceLevel, type MaintenanceState, resolveLevel } from '@/shared/lib/maintenance';

const LEVEL_META: Record<MaintenanceLevel, { label: string; dot: string }> = {
  off: { label: 'Operativo', dot: 'bg-green-500' },
  warning: { label: 'Aviso', dot: 'bg-amber-500' },
  blocked: { label: 'Bloqueado', dot: 'bg-red-500' },
};

export function MaintenancePanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<MaintenanceState>({
    queryKey: ['admin-maintenance'],
    queryFn: () => apiClient.get('/api/admin/maintenance'),
  });

  const [level, setLevel] = useState<MaintenanceLevel>('off');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [schedule, setSchedule] = useState('');
  const [duration, setDuration] = useState('');

  useEffect(() => {
    if (data) {
      // Sanitiza el nivel que viene del backend antes de usarlo.
      setLevel(resolveLevel(data.level));
      setTitle(data.title);
      setMessage(data.message);
      setSchedule(data.schedule);
      setDuration(data.duration);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (body: MaintenanceState) => apiClient.put('/api/admin/maintenance', body),
    onSuccess: () => {
      toast.success('Mantenimiento actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-maintenance'] });
    },
    onError: () => toast.error('No se pudo actualizar el mantenimiento'),
  });

  const handleSave = () => {
    if (level === 'blocked' &&
        !window.confirm('Esto bloquea el acceso a TODOS los usuarios. ¿Confirmás?')) {
      return;
    }
    save.mutate({ level, title, message, schedule, duration });
  };

  if (isLoading) return <p className="text-sm text-slate-500">Cargando mantenimiento…</p>;

  const meta = LEVEL_META[level];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Mantenimiento · {meta.label}
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(['off', 'warning', 'blocked'] as MaintenanceLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                level === l
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-dark-bg dark:text-slate-200'
              }`}
            >
              {LEVEL_META[l].label}
            </button>
          ))}
        </div>
        <input
          disabled={level === 'off'}
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg disabled:cursor-not-allowed disabled:opacity-50"
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        <textarea
          disabled={level === 'off'}
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg disabled:cursor-not-allowed disabled:opacity-50"
          value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensaje" rows={2} />
        <input
          disabled={level === 'off'}
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg disabled:cursor-not-allowed disabled:opacity-50"
          value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Horario (ej. 22:00 hs)" />
        <input
          disabled={level === 'off'}
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg disabled:cursor-not-allowed disabled:opacity-50"
          value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Duración (ej. 30 minutos)" />
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="self-start rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </section>
  );
}
