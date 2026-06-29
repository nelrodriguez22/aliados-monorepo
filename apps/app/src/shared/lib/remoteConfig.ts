import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import app from "@/shared/lib/firebase";
import {
  resolveLevel,
  type MaintenanceState,
} from "@/shared/lib/maintenance";

const DEFAULTS = {
  maintenance_level: "off",
  // Pantalla de bloqueo (blocked)
  maintenance_title: "Estamos en mantenimiento",
  maintenance_message: "Estamos realizando tareas de mantenimiento, volveremos a la brevedad.",
  // Banner de aviso previo (warning)
  maintenance_schedule: "",
  maintenance_duration: "",
  // Version-gate (Capa 3): versión mínima requerida. "0" = sin forzado.
  min_app_version: "0",
};

let rc: ReturnType<typeof getRemoteConfig> | null = null;

function getRc() {
  if (!rc) {
    rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.PROD ? 60_000 : 0;
    rc.defaultConfig = DEFAULTS;
  }
  return rc;
}

// Fail-open: ante cualquier error de Remote Config devolvemos los defaults (off).
export async function fetchMaintenance(): Promise<MaintenanceState> {
  try {
    const instance = getRc();
    await fetchAndActivate(instance);
    return {
      level: resolveLevel(getValue(instance, "maintenance_level").asString()),
      title: getValue(instance, "maintenance_title").asString(),
      message: getValue(instance, "maintenance_message").asString(),
      schedule: getValue(instance, "maintenance_schedule").asString(),
      duration: getValue(instance, "maintenance_duration").asString(),
    };
  } catch {
    return {
      level: "off",
      title: DEFAULTS.maintenance_title,
      message: DEFAULTS.maintenance_message,
      schedule: "",
      duration: "",
    };
  }
}

// Versión mínima requerida (version-gate). Fail-open: ante error → 0 (sin forzado).
export async function fetchMinAppVersion(): Promise<number> {
  try {
    const instance = getRc();
    await fetchAndActivate(instance);
    return Number(getValue(instance, "min_app_version").asString()) || 0;
  } catch {
    return 0;
  }
}
