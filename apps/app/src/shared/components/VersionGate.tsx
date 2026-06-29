import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMinAppVersion } from "@/shared/lib/remoteConfig";
import { hardReload } from "@/shared/lib/hardReload";
import icono from "@/assets/icono.png";

/**
 * Version-gate (Capa 3): si la versión que corre el cliente (__APP_VERSION__) es
 * menor a `min_app_version` (Remote Config), bloquea con una pantalla de
 * actualización forzada. Para deploys rompedores: el admin bumpea min_app_version
 * y los clientes viejos quedan obligados a actualizar.
 *
 * Fail-open: si Remote Config falla, fetchMinAppVersion devuelve 0 → no bloquea.
 * En build local __APP_VERSION__ es 0 → nunca bloquea (no rompe dev).
 */
export function VersionGate({ children }: { children: ReactNode }) {
  const { data: minVersion = 0 } = useQuery({
    queryKey: ["min-app-version"],
    queryFn: fetchMinAppVersion,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const outdated = __APP_VERSION__ > 0 && minVersion > __APP_VERSION__;

  if (outdated) {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center dark:bg-dark-bg">
        <img src={icono} alt="Aliados" className="h-14 w-auto" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-dark-text">
          Actualizá la app
        </h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-dark-text-secondary">
          Hay una versión nueva obligatoria. Tocá «Actualizar» para seguir usando Aliados.
        </p>
        <button
          onClick={hardReload}
          className="mt-2 cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
        >
          Actualizar
        </button>
      </section>
    );
  }

  return <>{children}</>;
}
