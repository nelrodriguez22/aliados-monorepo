import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import app from "@/shared/lib/firebase";
import {
  resolveLevel,
  type MaintenanceState,
} from "@/shared/lib/maintenance";

const DEFAULTS = {
  maintenance_level: "off",
  maintenance_title: "Estamos actualizando",
  maintenance_message: "Volvemos en unos minutos. ¡Gracias por la paciencia!",
  maintenance_eta: "",
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
      eta: getValue(instance, "maintenance_eta").asString(),
    };
  } catch {
    return {
      level: "off",
      title: DEFAULTS.maintenance_title,
      message: DEFAULTS.maintenance_message,
      eta: "",
    };
  }
}
