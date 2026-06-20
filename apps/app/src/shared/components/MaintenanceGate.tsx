import { createContext, useContext, type ReactNode } from "react";
import { useMaintenance } from "@/shared/hooks/useMaintenance";
import { getMaintenanceView, type MaintenanceState } from "@/shared/lib/maintenance";
import icono from "@/assets/icono.png";

interface MaintenanceContextValue {
  state: MaintenanceState;
  bypass: boolean;
  refetch: () => void;
}

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

// Estado de mantenimiento compartido (un solo poll en el Gate, leído donde se necesite).
export function useMaintenanceState(): MaintenanceContextValue {
  const ctx = useContext(MaintenanceContext);
  if (!ctx) {
    throw new Error("useMaintenanceState debe usarse dentro de <MaintenanceGate>");
  }
  return ctx;
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { state, bypass, refetch } = useMaintenance();
  const view = getMaintenanceView(state.level, bypass);

  if (view === "block") {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-dark-bg">
        <img src={icono} alt="Aliados" className="h-14 w-auto" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-dark-text">
          {state.title || "Estamos actualizando"}
        </h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-dark-text-secondary">
          {state.message || "Volvemos en unos minutos. ¡Gracias por la paciencia!"}
        </p>
        {state.eta && (
          <p className="text-xs font-medium text-brand-600 dark:text-dark-brand">
            Estimado: {state.eta}
          </p>
        )}
        <button
          onClick={refetch}
          className="mt-2 cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
        >
          Reintentar
        </button>
      </section>
    );
  }

  // El banner de `warning` se renderiza dentro del layout (ver MaintenanceBanner),
  // para que quede debajo del header fijo y no tapado por él.
  return (
    <MaintenanceContext.Provider value={{ state, bypass, refetch }}>
      {children}
    </MaintenanceContext.Provider>
  );
}
