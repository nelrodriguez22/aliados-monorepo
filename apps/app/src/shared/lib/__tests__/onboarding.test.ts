import { describe, it, expect } from 'vitest';
import {
  shouldShowTour,
  markTourSeen,
  availableSteps,
  CLIENT_TOUR_STEPS,
  PROVIDER_TOUR_STEPS,
  ONBOARDING_KEYS,
  type TourStep,
} from '@/shared/lib/onboarding';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('shouldShowTour', () => {
  it('true cuando no hay flag', () => {
    expect(shouldShowTour(ONBOARDING_KEYS.client, fakeStorage())).toBe(true);
  });
  it('false cuando el flag está en "1"', () => {
    const s = fakeStorage({ [ONBOARDING_KEYS.client]: '1' });
    expect(shouldShowTour(ONBOARDING_KEYS.client, s)).toBe(false);
  });
});

describe('markTourSeen', () => {
  it('persiste "1" en la clave', () => {
    const s = fakeStorage();
    markTourSeen(ONBOARDING_KEYS.provider, s);
    expect(s.getItem(ONBOARDING_KEYS.provider)).toBe('1');
  });
});

describe('availableSteps', () => {
  const steps: TourStep[] = [
    { selector: '#a', title: 'A', description: '' },
    { selector: '#b', title: 'B', description: '' },
    { selector: '#c', title: 'C', description: '' },
  ];
  it('filtra los pasos sin ancla, manteniendo el orden', () => {
    const root = {
      querySelector: (sel: string) =>
        sel === '#a' || sel === '#c' ? ({} as Element) : null,
    };
    expect(availableSteps(steps, root).map((s) => s.selector)).toEqual(['#a', '#c']);
  });
  it('devuelve [] si ninguna ancla existe', () => {
    expect(availableSteps(steps, { querySelector: () => null })).toEqual([]);
  });
});

describe('contenido', () => {
  it('cliente y proveedor tienen 3 pasos cada uno', () => {
    expect(CLIENT_TOUR_STEPS).toHaveLength(3);
    expect(PROVIDER_TOUR_STEPS).toHaveLength(3);
  });
});
