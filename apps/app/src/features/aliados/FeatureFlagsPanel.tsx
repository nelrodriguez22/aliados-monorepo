import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';
import { type FeatureFlag, validateFlagValue } from './featureFlags';

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
        <p className="font-medium text-slate-800 dark:text-slate-100">{flag.key}</p>
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
