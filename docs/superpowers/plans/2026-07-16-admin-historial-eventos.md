# Historial de Eventos en Panel Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timeline de eventos de ciclo de vida dentro de la fila expandida de la pestaña Servicios del panel admin.

**Architecture:** Componente `EventosTimeline` (fetch propio con react-query, montado solo al expandir → lazy gratis) + extracción de `ESTADO_CHIP` a módulo compartido. Sin backend nuevo: consume `GET /api/admin/{trabajos|mudanzas}/{id}/eventos` (PR #45).

**Tech Stack:** React + TypeScript, @tanstack/react-query, Tailwind, lucide-react, vitest + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-16-admin-historial-eventos-design.md`

## Global Constraints

- Directorio frontend: `/Users/nelrodriguez/proyectos/.pri/aliados/apps/app` — comandos pnpm ahí.
- Typecheck: `pnpm exec tsc -b` (NO `tsc --noEmit`: no ve los tests).
- La suite completa (`pnpm test`) debe correrse UNA vez con `.env` apartado (paridad CI: con `.env` local los tests levantan Firebase de verdad y dan falso verde). Patrón: `mv .env /tmp/env.bak && pnpm test; RES=$?; mv /tmp/env.bak .env; exit $RES` — SIEMPRE restaurar el `.env`.
- Tests de componente: docblock `// @vitest-environment happy-dom` en la primera línea (el entorno global de vitest es node).
- `EventosTimeline` usa `useQuery` → los tests lo envuelven en `QueryClientProvider` con `retry: false`.
- Textos de UI en español, con acentos correctos. Comentarios del código en español, densos en porqués.
- Commits en español (`feat(admin): ...`), firmados GPG (si el commit cuelga hay un pinentry gráfico esperando).
- Tipos exactos del contrato (PR #45): ver interfaz `EventoAdmin` en Task 2 — no inventar campos.

---

### Task 1: Extraer `ESTADO_CHIP` a `estadoChips.ts`

**Files:**
- Create: `apps/app/src/features/aliados/estadoChips.ts`
- Modify: `apps/app/src/features/aliados/ServiciosPanel.tsx` (borrar el mapa local, importar el módulo)

**Interfaces:**
- Consumes: nada.
- Produces: `export const ESTADO_CHIP: Record<string, string>` — lo importan `ServiciosPanel` (esta task) y `EventosTimeline` (Task 2).

- [ ] **Step 1: Crear el módulo**

`apps/app/src/features/aliados/estadoChips.ts`:

```ts
// Colores de chip por estado, compartidos entre la lista de servicios y el
// timeline de eventos. PENDIENTE_PAGO y PAGADO existen solo en el eje de pago
// del timeline (CAMBIO_ESTADO_PAGO): siguen el mismo esquema visual que
// PENDIENTE_PAGO_EXTRA y COMPLETADO respectivamente.
export const ESTADO_CHIP: Record<string, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  PROPUESTO: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-dark-brand',
  RESERVADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  CONTRAPROPUESTO: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  ACEPTADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  EN_CURSO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  PRESUPUESTADO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  EN_COLA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  FINALIZADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  PENDIENTE_PAGO_EXTRA: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  COMPLETADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  CANCELADO: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  // Eje de pago (solo timeline)
  PENDIENTE_PAGO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  PAGADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
};
```

- [ ] **Step 2: Reemplazar el mapa local en `ServiciosPanel.tsx`**

Borrar la constante `ESTADO_CHIP` (líneas 41-54 actuales) y agregar el import junto a los demás imports relativos:

```ts
import { ESTADO_CHIP } from './estadoChips';
```

Nada más cambia en este archivo en esta task.

- [ ] **Step 3: Verificar typecheck y suite**

Run (desde `apps/app`): `pnpm exec tsc -b && pnpm test`
Expected: typecheck limpio; misma cantidad de tests verdes que antes del cambio (extracción pura, cero cambios de comportamiento).

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/aliados/estadoChips.ts apps/app/src/features/aliados/ServiciosPanel.tsx
git commit -m "refactor(admin): ESTADO_CHIP a módulo compartido (+ chips del eje de pago)"
```

---

### Task 2: Componente `EventosTimeline` con tests

**Files:**
- Create: `apps/app/src/features/aliados/EventosTimeline.tsx`
- Test: `apps/app/src/features/aliados/__tests__/EventosTimeline.test.tsx`

**Interfaces:**
- Consumes: `ESTADO_CHIP` (Task 1), `apiClient.get<T>(endpoint)` (existente), `formatDateTime(iso)` de `@/shared/lib/dayjs`, `TipoServicio` de `@/shared/lib/servicioId`, `ErrorState` de `@/shared/components/ui/ErrorState` (props: `compact`, `message`, `onRetry`).
- Produces: `export function EventosTimeline({ tipo, id }: { tipo: TipoServicio; id: number })` — la monta Task 3.

- [ ] **Step 1: Escribir los tests que fallan**

`apps/app/src/features/aliados/__tests__/EventosTimeline.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventosTimeline } from '../EventosTimeline';
import { apiClient } from '@/shared/lib/apiClient';

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}));

const getMock = vi.mocked(apiClient.get);

// Wrapper con retry apagado: sin esto, el caso de error reintenta y el test
// se cuelga esperando un estado que nunca llega dentro del timeout.
function renderTimeline(tipo: 'TRABAJO' | 'MUDANZA', id: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventosTimeline tipo={tipo} id={id} />
    </QueryClientProvider>,
  );
}

const evento = (over: Record<string, unknown> = {}) => ({
  id: 1,
  tipo: 'CAMBIO_ESTADO',
  valorAnterior: 'PENDIENTE',
  valorNuevo: 'PROPUESTO',
  actorTipo: 'PROVEEDOR',
  actorNombre: 'Carlos',
  detalle: null,
  createdAt: '2026-07-16T10:09:45',
  ...over,
});

describe('EventosTimeline', () => {
  beforeEach(() => getMock.mockReset());
  afterEach(() => cleanup());

  it('pega al endpoint de trabajos para tipo TRABAJO', async () => {
    getMock.mockResolvedValue([evento()]);
    renderTimeline('TRABAJO', 123);
    await screen.findByText(/Carlos/);
    expect(getMock).toHaveBeenCalledWith('/api/admin/trabajos/123/eventos');
  });

  it('pega al endpoint de mudanzas para tipo MUDANZA', async () => {
    getMock.mockResolvedValue([evento()]);
    renderTimeline('MUDANZA', 45);
    await screen.findByText(/Carlos/);
    expect(getMock).toHaveBeenCalledWith('/api/admin/mudanzas/45/eventos');
  });

  it('muestra actor con nombre y la transición anterior → nuevo', async () => {
    getMock.mockResolvedValue([evento()]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('Carlos (proveedor)')).not.toBeNull();
    expect(screen.getByText('PENDIENTE')).not.toBeNull();
    expect(screen.getByText('PROPUESTO')).not.toBeNull();
  });

  it('actor SISTEMA se muestra como "Sistema"', async () => {
    getMock.mockResolvedValue([
      evento({ actorTipo: 'SISTEMA', actorNombre: null, valorAnterior: 'EN_COLA', valorNuevo: 'EN_CURSO' }),
    ]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('Sistema')).not.toBeNull();
  });

  it('nacimiento (valorAnterior null) muestra un solo chip', async () => {
    getMock.mockResolvedValue([evento({ valorAnterior: null, valorNuevo: 'PENDIENTE' })]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('PENDIENTE')).not.toBeNull();
    // Sin flecha: no hay transición, solo el estado inicial.
    expect(screen.queryByText('→')).toBeNull();
  });

  it('eventos de pago llevan el badge PAGO', async () => {
    getMock.mockResolvedValue([
      evento({ tipo: 'CAMBIO_ESTADO_PAGO', valorAnterior: 'PENDIENTE_PAGO', valorNuevo: 'PAGADO' }),
    ]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('PAGO')).not.toBeNull();
  });

  it('muestra el detalle cuando existe', async () => {
    getMock.mockResolvedValue([
      evento({ valorNuevo: 'CANCELADO', actorTipo: 'CLIENTE', actorNombre: 'Ana', detalle: 'me arrepentí' }),
    ]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText('me arrepentí')).not.toBeNull();
  });

  it('timeline vacío muestra el mensaje de sin historial', async () => {
    getMock.mockResolvedValue([]);
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText(/Sin historial/)).not.toBeNull();
  });

  it('error de fetch muestra ErrorState', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    renderTimeline('TRABAJO', 1);
    expect(await screen.findByText(/No se pudo cargar el historial/)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run (desde `apps/app`): `pnpm exec vitest run src/features/aliados/__tests__/EventosTimeline.test.tsx`
Expected: FAIL — no existe `../EventosTimeline`.

- [ ] **Step 3: Implementar el componente**

`apps/app/src/features/aliados/EventosTimeline.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { User, Wrench, Cog } from 'lucide-react';
import { apiClient } from '@/shared/lib/apiClient';
import { formatDateTime } from '@/shared/lib/dayjs';
import type { TipoServicio } from '@/shared/lib/servicioId';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { ESTADO_CHIP } from './estadoChips';

// Contrato de GET /api/admin/{trabajos|mudanzas}/{id}/eventos (PR #45).
interface EventoAdmin {
  id: number;
  tipo: 'CAMBIO_ESTADO' | 'CAMBIO_ESTADO_PAGO';
  valorAnterior: string | null; // null = nacimiento del eje (∅)
  valorNuevo: string;
  actorTipo: 'CLIENTE' | 'PROVEEDOR' | 'SISTEMA' | 'ADMIN';
  actorNombre: string | null; // null cuando SISTEMA
  detalle: string | null;
  createdAt: string;
}

const ICONO_ACTOR = {
  CLIENTE: User,
  PROVEEDOR: Wrench,
  SISTEMA: Cog,
  ADMIN: Cog,
} as const;

function labelActor(e: EventoAdmin): string {
  return e.actorNombre ? `${e.actorNombre} (${e.actorTipo.toLowerCase()})` : 'Sistema';
}

function Chip({ valor }: { valor: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_CHIP[valor] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {valor.replaceAll('_', ' ')}
    </span>
  );
}

/**
 * Timeline del audit log de un servicio, para la fila expandida de la pestaña
 * Servicios. Se monta solo al expandir → el fetch es lazy sin código extra, y
 * el cache de react-query evita re-pedir al re-expandir el mismo servicio.
 * Orden: el backend devuelve id ASC (cronológico); se pinta tal cual, el más
 * nuevo abajo — orden natural de lectura de un caso.
 */
export function EventosTimeline({ tipo, id }: { tipo: TipoServicio; id: number }) {
  const base = tipo === 'TRABAJO' ? 'trabajos' : 'mudanzas';
  const { data, isFetching, isError, refetch } = useQuery<EventoAdmin[]>({
    queryKey: ['admin-eventos', tipo, id],
    queryFn: () => apiClient.get(`/api/admin/${base}/${id}/eventos`),
  });

  if (isError) {
    return <ErrorState compact message="No se pudo cargar el historial." onRetry={() => refetch()} />;
  }
  if (isFetching && !data) {
    return <p className="text-xs text-slate-500">Cargando historial…</p>;
  }
  if (!data || data.length === 0) {
    // Los servicios anteriores a la migración V12 no tienen eventos: es un
    // vacío esperado, no un error.
    return <p className="text-xs text-slate-500">Sin historial — servicio anterior al registro de eventos.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {data.map((e) => {
        const Icono = ICONO_ACTOR[e.actorTipo] ?? Cog;
        return (
          <li key={e.id} className="flex items-start gap-2">
            <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {e.tipo === 'CAMBIO_ESTADO_PAGO' && (
                  <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    PAGO
                  </span>
                )}
                {e.valorAnterior !== null && (
                  <>
                    <Chip valor={e.valorAnterior} />
                    <span className="text-[10px] text-slate-400">→</span>
                  </>
                )}
                <Chip valor={e.valorNuevo} />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">{labelActor(e)}</span>
                <span className="text-[10px] text-slate-400">{formatDateTime(e.createdAt)}</span>
              </div>
              {e.detalle && (
                <p className="mt-0.5 text-[11px] italic text-slate-500 dark:text-slate-400">{e.detalle}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run src/features/aliados/__tests__/EventosTimeline.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `pnpm exec tsc -b`
Expected: limpio.

```bash
git add apps/app/src/features/aliados/EventosTimeline.tsx apps/app/src/features/aliados/__tests__/EventosTimeline.test.tsx
git commit -m "feat(admin): timeline de eventos de ciclo de vida (EventosTimeline)"
```

---

### Task 3: Integrar en la fila expandida de `ServiciosPanel` + verificación integral

**Files:**
- Modify: `apps/app/src/features/aliados/ServiciosPanel.tsx` (dentro del bloque `{abierto && (...)}`)

**Interfaces:**
- Consumes: `EventosTimeline({ tipo, id })` (Task 2). La fila ya tiene `s.tipo: TipoServicio` y `s.id: number`.
- Produces: nada nuevo hacia afuera.

- [ ] **Step 1: Montar el timeline en el expandido**

En `ServiciosPanel.tsx`, agregar el import:

```ts
import { EventosTimeline } from './EventosTimeline';
```

y dentro del bloque `{abierto && (...)}`, DESPUÉS del `</dl>` existente (envolver ambos en un fragment):

```tsx
{abierto && (
  <>
    <dl className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-slate-50 p-3 text-xs dark:bg-dark-bg sm:grid-cols-2">
      {/* ... contenido existente sin cambios ... */}
    </dl>
    <div className="mt-2 rounded-lg bg-slate-50 p-3 dark:bg-dark-bg">
      <h3 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Historial</h3>
      <EventosTimeline tipo={s.tipo} id={s.id} />
    </div>
  </>
)}
```

- [ ] **Step 2: Verificación integral (paridad CI)**

Run (desde `apps/app`):

```bash
pnpm exec tsc -b
mv .env /tmp/env.bak && pnpm test; RES=$?; mv /tmp/env.bak .env; exit $RES
```

Expected: typecheck limpio; suite completa verde SIN `.env` (si un test nuevo dependiera de Firebase real, acá se cae — no en CI).

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/features/aliados/ServiciosPanel.tsx
git commit -m "feat(admin): historial de eventos en la fila expandida de Servicios"
```
