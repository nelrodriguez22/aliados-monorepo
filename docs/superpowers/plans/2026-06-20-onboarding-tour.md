# Onboarding tour (spotlight 3 pasos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un tour de onboarding spotlight de 3 pasos en los dashboards de cliente y proveedor, que aparece automático la primera vez y se silencia (localStorage) al completarse o al tildar "No volver a mostrar".

**Architecture:** Lógica pura testeable (`onboarding.ts`: flags + filtrado de anclas + contenido de pasos) + un componente propio `OnboardingTour` que resalta el elemento real (overlay con hueco vía `box-shadow` + popover posicionado por `getBoundingClientRect`) y persiste en localStorage. Los dashboards exponen anclas `data-onboarding` y montan el tour.

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind, lucide-react, Vitest (entorno node, solo lógica pura). Sin dependencias nuevas.

## Global Constraints

- **Sin acciones de git sin orden explícita del usuario.** Los pasos "Commit" se ejecutan solo con OK explícito; si no, se dejan los cambios **staged** y se sigue. (Ejecución actual: sin commits, todo staged.)
- **Sin dependencias nuevas** (no driver.js/joyride; spotlight propio).
- **Copy en español (voseo).** Textos de los pasos exactamente como figuran en este plan.
- **Claves localStorage:** `aliados-onboarding-client`, `aliados-onboarding-provider`.
- **Semántica del checkbox:** `markTourSeen` se llama cuando (a) se completa el tour (botón "Listo" en el último paso) o (b) se cierra con el checkbox tildado. Cerrar sin tildar NO persiste.
- **Disparo:** auto la primera vez, solo si no fue visto y `ready` (datos cargados, anclas montadas).
- **Anclas siempre presentes** (renderizan aunque la sección esté vacía): no anclar a items de datos.
- **Tests:** Vitest node sin jsdom → solo se testea la lógica pura de `onboarding.ts`. El componente y el montaje se verifican con typecheck + build + manual.

---

### Task 1: `onboarding.ts` — lógica pura + contenido de pasos (TDD)

**Files:**
- Create: `apps/app/src/shared/lib/onboarding.ts`
- Test: `apps/app/src/shared/lib/__tests__/onboarding.test.ts`

**Interfaces:**
- Produces:
  - `interface TourStep { selector: string; title: string; description: string }`
  - `const ONBOARDING_KEYS: { client: string; provider: string }`
  - `shouldShowTour(key: string, storage: Pick<Storage,'getItem'>): boolean`
  - `markTourSeen(key: string, storage: Pick<Storage,'setItem'>): void`
  - `availableSteps(steps: TourStep[], root: Pick<Document,'querySelector'>): TourStep[]`
  - `const CLIENT_TOUR_STEPS: TourStep[]`, `const PROVIDER_TOUR_STEPS: TourStep[]`

- [ ] **Step 1: Escribir los tests (fallan)**

`apps/app/src/shared/lib/__tests__/onboarding.test.ts`:
```ts
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
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd apps/app && pnpm test onboarding`
Expected: FAIL (`Cannot find module '@/shared/lib/onboarding'`).

- [ ] **Step 3: Implementar `onboarding.ts`**

`apps/app/src/shared/lib/onboarding.ts`:
```ts
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
```

- [ ] **Step 4: Correr los tests**

Run: `cd apps/app && pnpm test onboarding`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd apps/app && npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/shared/lib/onboarding.ts apps/app/src/shared/lib/__tests__/onboarding.test.ts
git commit -m "feat(onboarding): lógica pura (flags, anclas, pasos)"
```

---

### Task 2: `OnboardingTour.tsx` — spotlight + popover

**Files:**
- Create: `apps/app/src/shared/components/OnboardingTour.tsx`

**Interfaces:**
- Consumes (Task 1): `availableSteps`, `markTourSeen`, `shouldShowTour`, `TourStep`.
- Produces: `<OnboardingTour storageKey={string} steps={TourStep[]} ready={boolean} />`.

- [ ] **Step 1: Crear `OnboardingTour.tsx`**

`apps/app/src/shared/components/OnboardingTour.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import {
  availableSteps,
  markTourSeen,
  shouldShowTour,
  type TourStep,
} from '@/shared/lib/onboarding';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  storageKey: string;
  steps: TourStep[];
  ready: boolean;
}

const POPOVER_WIDTH = 320;

export function OnboardingTour({ storageKey, steps, ready }: Props) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState<TourStep[]>([]);
  const startedRef = useRef(false);

  // Arranque: una sola vez por montaje, cuando ready y corresponde mostrar.
  useEffect(() => {
    if (!ready || startedRef.current) return;
    if (!shouldShowTour(storageKey, window.localStorage)) return;
    const avail = availableSteps(steps, document);
    if (avail.length === 0) return;
    startedRef.current = true;
    setVisible(avail);
    setIndex(0);
    setActive(true);
  }, [ready, steps, storageKey]);

  const measure = useCallback(() => {
    const step = visible[index];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [visible, index]);

  // Scroll al ancla del paso actual, medir, y remedir en resize/scroll.
  useEffect(() => {
    if (!active) return;
    const step = visible[index];
    const el = step ? document.querySelector(step.selector) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(measure, 320);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, index, visible, measure]);

  const finish = useCallback(
    (seen: boolean) => {
      if (seen) markTourSeen(storageKey, window.localStorage);
      setActive(false);
    },
    [storageKey],
  );

  // Esc cierra (guarda solo si el checkbox está tildado).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, dontShow, finish]);

  if (!active) return null;

  const isLast = index === visible.length - 1;
  const step = visible[index];

  const close = () => finish(dontShow);
  const next = () => (isLast ? finish(true) : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  // Popover: debajo del ancla si está en la mitad superior; si no, arriba.
  // Para "arriba" usamos `bottom` y así no hace falta medir la altura del popover.
  let popoverStyle: CSSProperties;
  if (rect) {
    const center = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(center - POPOVER_WIDTH / 2, 12),
      window.innerWidth - POPOVER_WIDTH - 12,
    );
    const below = rect.top + rect.height < window.innerHeight * 0.6;
    popoverStyle = below
      ? { top: rect.top + rect.height + 12, left }
      : { bottom: window.innerHeight - rect.top + 12, left };
  } else {
    popoverStyle = {
      bottom: 24,
      left: Math.max((window.innerWidth - POPOVER_WIDTH) / 2, 12),
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={close} />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-500 transition-all dark:ring-dark-brand"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}

      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-2xl bg-white p-4 shadow-2xl dark:bg-dark-surface"
        style={popoverStyle}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-3 top-3 cursor-pointer text-slate-400 transition hover:text-slate-600 dark:text-dark-text-secondary dark:hover:text-dark-text"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="pr-6 text-base font-semibold text-slate-900 dark:text-dark-text">
          {step.title}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-dark-text-secondary">
          {step.description}
        </p>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          {visible.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? 'w-4 bg-brand-600 dark:bg-dark-brand'
                  : 'w-1.5 bg-slate-300 dark:bg-dark-border'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            className="cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 disabled:invisible dark:text-dark-text-secondary dark:hover:bg-dark-elevated"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={next}
            className="cursor-pointer rounded-full bg-brand-600 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
          >
            {isLast ? 'Listo' : 'Siguiente'}
          </button>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-400 dark:text-dark-text-secondary">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-brand-600 dark:accent-dark-brand"
          />
          No volver a mostrar
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd apps/app && npx tsc -b && pnpm build`
Expected: tsc exit 0; build OK.

- [ ] **Step 3: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/shared/components/OnboardingTour.tsx
git commit -m "feat(onboarding): componente spotlight OnboardingTour"
```

---

### Task 3: Anclas + montaje en el dashboard del cliente

**Files:**
- Modify: `apps/app/src/features/client/pages/ClientDashboard.tsx`

**Interfaces:**
- Consumes (Task 1): `ONBOARDING_KEYS`, `CLIENT_TOUR_STEPS`. (Task 2): `OnboardingTour`.

- [ ] **Step 1: Imports**

Agregar al bloque de imports de `ClientDashboard.tsx`:
```tsx
import { OnboardingTour } from "@/shared/components/OnboardingTour";
import { ONBOARDING_KEYS, CLIENT_TOUR_STEPS } from "@/shared/lib/onboarding";
```

- [ ] **Step 2: Agregar las 3 anclas `data-onboarding`**

En `ClientDashboard.tsx`, agregar el atributo a los contenedores de sección (NO a items de datos). Ubicarlos por su contenido:

1. **Buscador** — el contenedor (la "tarjeta") que envuelve al input con `placeholder="¿Qué servicio necesitás?"` y el botón "Buscar". Agregar `data-onboarding="client-search"` a ese contenedor.
2. **Trabajos activos** — el contenedor de la sección que incluye el `<h2>Trabajos activos</h2>`. Agregar `data-onboarding="client-active"` a ese contenedor de sección.
3. **Historial** — el elemento `<div ref={historialRef}>`. Cambiarlo a:
   ```tsx
   <div ref={historialRef} data-onboarding="client-history">
   ```

- [ ] **Step 3: Montar el tour**

Dentro del JSX que retorna el componente principal `ClientDashboard`, agregar el tour como primer hijo del wrapper raíz (al lado del contenido; el componente es `position: fixed`, su ubicación en el árbol no afecta el layout):
```tsx
<OnboardingTour
  storageKey={ONBOARDING_KEYS.client}
  steps={CLIENT_TOUR_STEPS}
  ready={!loadingTrabajos && !loadingHistorial}
/>
```
(`loadingTrabajos` y `loadingHistorial` ya existen en el componente.)

- [ ] **Step 4: Typecheck + build**

Run: `cd apps/app && npx tsc -b && pnpm build`
Expected: tsc exit 0; build OK.

- [ ] **Step 5: Verificación manual (cliente)**

1. `cd apps/app && pnpm dev`, entrar como cliente con `localStorage` limpio de la clave `aliados-onboarding-client`.
2. Al cargar el dashboard (datos listos), arranca el tour: paso 1 resalta el buscador, 2 "Trabajos activos", 3 historial.
3. Completar (Listo) → recargar → NO reaparece. En DevTools → Application → Local Storage debe existir `aliados-onboarding-client = 1`.
4. Borrar esa clave, recargar, cerrar el tour en el paso 1 **sin** tildar → recargar → reaparece. Cerrar **tildando** "No volver a mostrar" → recargar → no reaparece.
5. Probar dark mode y mobile (resize): el popover se reubica.

- [ ] **Step 6: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/features/client/pages/ClientDashboard.tsx
git commit -m "feat(onboarding): tour en dashboard del cliente"
```

---

### Task 4: Anclas + montaje en el dashboard del proveedor

**Files:**
- Modify: `apps/app/src/features/provider/pages/ProviderDashboard.tsx`
- Modify: `apps/app/src/features/components/header/ProviderStatusToggle.tsx`

**Interfaces:**
- Consumes (Task 1): `ONBOARDING_KEYS`, `PROVIDER_TOUR_STEPS`. (Task 2): `OnboardingTour`.

- [ ] **Step 1: Ancla del toggle (en el header)**

En `apps/app/src/features/components/header/ProviderStatusToggle.tsx`, agregar `data-onboarding="provider-toggle"` al **elemento raíz** que retorna el componente (el contenedor del toggle). Solo se renderiza en rutas de proveedor, así que el ancla solo existe para proveedores.

- [ ] **Step 2: Imports en `ProviderDashboard.tsx`**

```tsx
import { OnboardingTour } from "@/shared/components/OnboardingTour";
import { ONBOARDING_KEYS, PROVIDER_TOUR_STEPS } from "@/shared/lib/onboarding";
```

- [ ] **Step 3: Anclas de secciones en `ProviderDashboard.tsx`**

Agregar el atributo a los contenedores de sección (renderizan aunque estén vacías):
1. **Trabajos disponibles** — contenedor de la sección que incluye el header `Trabajos disponibles`. Agregar `data-onboarding="provider-available"`.
2. **Historial** — contenedor de la sección que incluye el header `Historial`. Agregar `data-onboarding="provider-history"`.

- [ ] **Step 4: Montar el tour**

Dentro del JSX que retorna `ProviderDashboard`, como primer hijo del wrapper raíz:
```tsx
<OnboardingTour
  storageKey={ONBOARDING_KEYS.provider}
  steps={PROVIDER_TOUR_STEPS}
  ready={!loadingActivo && !loadingCompletados}
/>
```
(`loadingActivo` y `loadingCompletados` ya existen en el componente.)

- [ ] **Step 5: Typecheck + build**

Run: `cd apps/app && npx tsc -b && pnpm build`
Expected: tsc exit 0; build OK.

- [ ] **Step 6: Verificación manual (proveedor)**

1. Entrar como proveedor con `localStorage` limpio de `aliados-onboarding-provider`.
2. Al cargar, arranca el tour: paso 1 resalta el toggle (en el header), 2 "Trabajos disponibles", 3 historial.
3. Misma verificación de persistencia que en cliente (completar / checkbox / cerrar sin tildar) con la clave `aliados-onboarding-provider`.
4. Confirmar que el cliente y el proveedor tienen claves independientes (ver uno no silencia el otro).

- [ ] **Step 7: Commit (solo con OK explícito; si no, dejar staged)**

```bash
git add apps/app/src/features/provider/pages/ProviderDashboard.tsx apps/app/src/features/components/header/ProviderStatusToggle.tsx
git commit -m "feat(onboarding): tour en dashboard del proveedor"
```

---

## Acciones manuales del usuario (fuera del código)

Ninguna. (Verificación manual en browser descrita en Tasks 3 y 4.)
