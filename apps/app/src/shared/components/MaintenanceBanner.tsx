import { AlertTriangle } from "lucide-react";
import { useMaintenanceState } from "@/shared/components/MaintenanceGate";
import { formatBannerText, getMaintenanceView } from "@/shared/lib/maintenance";

// Banner de aviso (nivel `warning`). Se monta arriba del contenido de la página,
// debajo del header fijo, alineado al mismo ancho que las tarjetas del dashboard.
export function MaintenanceBanner() {
  const { state, bypass } = useMaintenanceState();
  if (getMaintenanceView(state.level, bypass) !== "banner") return null;

  return (
    // Franja full-width con el mismo fondo que el contenido (tw.pageBg) para no
    // dejar una banda blanca sobre el dashboard slate-50.
    <div className="bg-slate-50 dark:bg-dark-bg pt-4">
      <div className="mx-auto w-full max-w-[min(92%,800px)] sm:max-w-[min(80%,800px)] lg:max-w-[min(55%,800px)]">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 min-w-0 text-xs min-[375px]:text-sm text-amber-700 dark:text-amber-400">
            {formatBannerText(state.schedule, state.duration)}
          </p>
        </div>
      </div>
    </div>
  );
}
