export type MaintenanceLevel = 'off' | 'warning' | 'blocked';

export interface MaintenanceState {
  level: MaintenanceLevel;
  title: string;
  message: string;
  eta: string;
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
