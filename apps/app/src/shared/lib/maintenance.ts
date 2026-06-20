export type MaintenanceLevel = 'off' | 'warning' | 'blocked';

export interface MaintenanceState {
  level: MaintenanceLevel;
  // Pantalla de bloqueo (nivel `blocked`)
  title: string;
  message: string;
  // Banner de aviso previo (nivel `warning`)
  schedule: string; // hora programada, ej "22:00 hs"
  duration: string; // duración estimada, ej "30 minutos"
}

export const BYPASS_KEY = 'aliados-maintenance-bypass';

const VALID: readonly MaintenanceLevel[] = ['off', 'warning', 'blocked'];

export function resolveLevel(raw: string | undefined): MaintenanceLevel {
  const v = (raw ?? '').trim().toLowerCase();
  return (VALID as readonly string[]).includes(v)
    ? (v as MaintenanceLevel)
    : 'off';
}

// Si la URL trae ?nomaint=1 lo persiste; devuelve si el bypass está activo.
export function readBypassFlag(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  if (new URLSearchParams(search).get('nomaint') === '1') {
    storage.setItem(BYPASS_KEY, '1');
  }
  return storage.getItem(BYPASS_KEY) === '1';
}

export function getMaintenanceView(
  level: MaintenanceLevel,
  bypass: boolean,
): 'app' | 'banner' | 'block' {
  if (level === 'blocked') return bypass ? 'app' : 'block';
  if (level === 'warning') return 'banner';
  return 'app';
}

// Arma el texto del banner de aviso a partir de la hora programada y la duración
// estimada (ambas desde Remote Config). Degrada elegante si falta alguna.
export function formatBannerText(schedule: string, duration: string): string {
  const s = schedule.trim();
  const d = duration.trim();
  const parts: string[] = [];
  if (s) parts.push(`Vamos a tener una actualización programada para las ${s}.`);
  if (d) parts.push(`El tiempo estimado del mantenimiento es de ${d}.`);
  if (parts.length === 0) {
    return 'Vamos a actualizar la app pronto, puede haber interrupciones.';
  }
  return parts.join(' ');
}
