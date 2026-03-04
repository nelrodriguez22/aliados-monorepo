import { useState, useEffect, useTransition } from "react";
import { useStore } from "@/shared/store/useStore";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import toast from "react-hot-toast";

export function ProviderStatusToggle() {
  const user             = useStore((state) => state.user);
  const updateUserStatus = useStore((state) => state.updateUserStatus);
  const queryClient      = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const [optimisticStatus, setOptimisticStatus] = useState<'ONLINE' | 'OFFLINE' | 'BUSY'>(
    user?.status || 'OFFLINE'
  );

  const userStatus = user?.status || 'OFFLINE';
  const isBusy     = optimisticStatus === 'BUSY';
  const isOnline   = optimisticStatus === 'ONLINE';

  useEffect(() => {
    setOptimisticStatus(user?.status || 'OFFLINE');
  }, [user?.status]);

  const toggle = () => {
    if (isBusy) {
      toast.error('No podés desconectarte mientras tenés un trabajo en curso');
      return;
    }
    const newStatus = isOnline ? 'OFFLINE' : 'ONLINE';
    startTransition(async () => {
      setOptimisticStatus(newStatus);
      try {
        const token = await getToken();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          setOptimisticStatus(userStatus);
          toast.error('Error al actualizar estado');
          return;
        }
        updateUserStatus(newStatus);
        if (newStatus === 'ONLINE')
          queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
        toast.success(newStatus === 'ONLINE' ? 'Estás en línea' : 'Estás desconectado');
      } catch {
        setOptimisticStatus(userStatus);
        toast.error('Error al actualizar estado');
      }
    });
  };

  // ── BUSY ──
  if (isBusy) {
    return (
      <div className="hidden md:flex items-center gap-2 rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Ocupado</span>
      </div>
    );
  }

  // ── ONLINE / OFFLINE ──
  return (
    <div className="hidden md:flex items-center gap-2.5">
      {/* Label */}
      <span className={`text-xs font-medium transition-colors duration-200
        ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-dark-text-secondary'}`}>
        {isOnline ? 'Disponible' : 'Desconectado'}
      </span>

      {/* Pill toggle */}
      <button
        onClick={toggle}
        disabled={isPending}
        aria-label="Cambiar disponibilidad"
        className={`
          relative flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full border-none p-0
          transition-colors duration-300
          ${isOnline ? 'bg-green-500' : 'bg-slate-200 dark:bg-dark-elevated'}
          ${isPending ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        {/* Thumb */}
        <span
          className={`
            absolute top-[3px] left-[3px]
            flex h-[22px] w-[22px] items-center justify-center
            rounded-full bg-white
            shadow-[0_1px_4px_rgba(0,0,0,0.15)]
            transition-transform duration-300
            ${isOnline ? 'translate-x-6' : 'translate-x-0'}
          `}
          style={{ transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {/* Dot de estado */}
          <span className={`h-2 w-2 rounded-full transition-colors duration-200
            ${isOnline ? 'bg-green-500' : 'bg-slate-300'}`}
          />
        </span>
      </button>
    </div>
  );
}
