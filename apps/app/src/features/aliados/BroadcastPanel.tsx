import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

type Segmento = 'TODOS' | 'CLIENTES' | 'PROVEEDORES';
const SEGMENTOS: { key: Segmento; label: string }[] = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'CLIENTES', label: 'Clientes' },
  { key: 'PROVEEDORES', label: 'Proveedores' },
];

export function BroadcastPanel() {
  const [segmento, setSegmento] = useState<Segmento>('TODOS');
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');

  const send = useMutation({
    mutationFn: (body: { segmento: Segmento; titulo: string; mensaje: string }) =>
      apiClient.post<{ targetCount: number }>('/api/admin/broadcast', body),
    onSuccess: (res) => {
      toast.success(`Enviado a ${res.targetCount} usuarios`);
      setTitulo('');
      setMensaje('');
    },
    onError: () => toast.error('No se pudo enviar el aviso'),
  });

  const handleSend = () => {
    if (!titulo.trim() || !mensaje.trim()) {
      toast.error('Completá título y mensaje');
      return;
    }
    const label = SEGMENTOS.find((s) => s.key === segmento)!.label;
    if (!window.confirm(`Vas a enviar un aviso a "${label}". ¿Confirmás?`)) return;
    send.mutate({ segmento, titulo, mensaje });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Aviso a usuarios</h2>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {SEGMENTOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegmento(s.key)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                segmento === s.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-dark-bg dark:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
        <textarea
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje" rows={3} />
        <button
          onClick={handleSend}
          disabled={send.isPending}
          className="self-start rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {send.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </section>
  );
}
