import { RefreshCw } from "lucide-react";
import { usePWAUpdate } from "@/shared/components/PWAUpdateProvider";

// Banner de "nueva versión disponible". Misma ubicación/estructura que
// MaintenanceBanner (franja full-width + tarjeta centrada, debajo del header fijo),
// pero en tono brand para distinguirlo del amber de mantenimiento.
export function PWAUpdateBanner() {
  const { needRefresh, reload } = usePWAUpdate();
  if (!needRefresh) return null;

  return (
    <div className="bg-slate-50 dark:bg-dark-bg pt-4">
      <div className="mx-auto w-full max-w-[min(92%,800px)] sm:max-w-[min(80%,800px)] lg:max-w-[min(55%,800px)]">
        <div className="flex items-center gap-3 rounded-2xl border border-brand-200 dark:border-brand-700/40 bg-brand-50 dark:bg-brand-900/10 px-4 py-3">
          <RefreshCw className="h-4 w-4 shrink-0 text-brand-600 dark:text-dark-brand" />
          <p className="flex-1 min-w-0 text-xs min-[375px]:text-sm text-brand-700 dark:text-dark-brand">
            Hay una nueva versión disponible.
          </p>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500"
          >
            Recargar
          </button>
        </div>
      </div>
    </div>
  );
}
