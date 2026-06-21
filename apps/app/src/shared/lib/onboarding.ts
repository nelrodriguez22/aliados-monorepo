export interface TourStep {
  selector: string;
  title: string;
  description: string;
}

export const ONBOARDING_KEYS = {
  client: 'aliados-onboarding-client',
  provider: 'aliados-onboarding-provider',
} as const;

export function shouldShowTour(
  key: string,
  storage: Pick<Storage, 'getItem'>,
): boolean {
  return storage.getItem(key) !== '1';
}

export function markTourSeen(
  key: string,
  storage: Pick<Storage, 'setItem'>,
): void {
  try {
    storage.setItem(key, '1');
  } catch {
    // localStorage no disponible (modo restrictivo): a lo sumo el tour reaparece.
  }
}

// Devuelve solo los pasos cuya ancla existe en el DOM (tour robusto).
export function availableSteps(
  steps: TourStep[],
  root: Pick<Document, 'querySelector'>,
): TourStep[] {
  return steps.filter((s) => root.querySelector(s.selector) !== null);
}

export const CLIENT_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-onboarding="client-search"]',
    title: 'Buscá tu servicio',
    description: 'Escribí qué necesitás y encontrá al profesional indicado.',
  },
  {
    selector: '[data-onboarding="client-active"]',
    title: 'Trabajos en curso',
    description:
      'Acá seguís tus trabajos activos y cuándo tu profesional está en camino.',
  },
  {
    selector: '[data-onboarding="client-history"]',
    title: 'Historial',
    description:
      'Tus trabajos terminados quedan acá, para volver a contratar o calificar.',
  },
];

export const PROVIDER_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-onboarding="provider-toggle"]',
    title: 'Ponete en línea',
    description: 'Activá el toggle para empezar a recibir trabajos.',
  },
  {
    selector: '[data-onboarding="provider-available"]',
    title: 'Trabajos disponibles',
    description: 'Acá ves los pedidos cercanos y los tomás.',
  },
  {
    selector: '[data-onboarding="provider-history"]',
    title: 'Historial',
    description: 'Tus trabajos completados y tus calificaciones quedan acá.',
  },
];
