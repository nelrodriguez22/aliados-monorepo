# Onboarding tour (spotlight 3 pasos) — cliente y proveedor — Diseño

**Fecha:** 2026-06-20
**Estado:** Aprobado (pendiente implementación)

## Objetivo

Un tour de onboarding de 3 pasos en los dashboards de cliente y proveedor, estilo
**spotlight** (oscurece la pantalla y resalta el elemento real con un tooltip), que
explica brevemente qué hace cada sección. Aparece automáticamente la primera vez y no
vuelve a mostrarse una vez visto, con un checkbox "No volver a mostrar".

## Decisiones tomadas (brainstorming)

- **Disparo:** automático la primera vez que el usuario entra al dashboard (por rol),
  solo si no fue visto y **ya cargaron los datos** (para que existan las anclas, no el
  skeleton).
- **Formato:** spotlight (resalta el elemento real), no modal carrusel.
- **Implementación:** componente propio en React, **sin dependencia nueva**.
- **Persistencia del "no volver a mostrar":** `localStorage`, una clave por rol.
- **Semántica del checkbox:** el flag se guarda si (a) el usuario **completa** el tour
  (llega al último paso → "Listo"), o (b) **cierra antes con el checkbox tildado**.
  Cerrar antes **sin** tildar → el tour vuelve a aparecer la próxima vez.

## No-objetivos (YAGNI)

- No hay botón "ver tutorial de nuevo" (puede agregarse después; no ahora).
- No se usa librería de tour (driver.js, joyride, etc.).
- No se hace tour en otras pantallas que no sean los dos dashboards.
- No se persiste en backend; es por dispositivo/navegador (localStorage).

## Arquitectura y componentes

### Unidad 1 — Lógica pura `onboarding.ts`
`apps/app/src/shared/lib/onboarding.ts` (sin DOM/React, testeable en Vitest node):

- `interface TourStep { selector: string; title: string; description: string }`
  (`selector` apunta a un atributo `data-onboarding`, ej. `[data-onboarding="client-search"]`).
- `const ONBOARDING_KEYS = { client: 'aliados-onboarding-client', provider: 'aliados-onboarding-provider' }`
- `shouldShowTour(key: string, storage: Pick<Storage,'getItem'>): boolean` → `storage.getItem(key) !== '1'`.
- `markTourSeen(key: string, storage: Pick<Storage,'setItem'>): void` → `storage.setItem(key, '1')`.
- `availableSteps(steps: TourStep[], root: Pick<Document,'querySelector'>): TourStep[]` →
  devuelve solo los pasos cuyo `root.querySelector(step.selector)` existe. Hace el tour
  robusto: si una ancla no está montada, ese paso se omite en vez de romper.

### Unidad 2 — Componente visual `OnboardingTour.tsx`
`apps/app/src/shared/components/OnboardingTour.tsx`. API:

```tsx
<OnboardingTour
  storageKey={ONBOARDING_KEYS.client}
  steps={CLIENT_TOUR_STEPS}
  ready={!loadingTrabajos && !loadingHistorial}
/>
```

Responsabilidades:
- **Arranque:** al montar (o cuando `ready` pasa a true), si `shouldShowTour(storageKey)`
  y hay al menos un paso en `availableSteps(steps, document)`, inicia el tour en el índice 0.
  Guard para arrancar **una sola vez** por montaje (no re-disparar en cada render).
- **Posición:** por cada paso, `querySelector` del ancla → `scrollIntoView({ block:'center' })`
  → mide `getBoundingClientRect()`. El "hueco" se hace con un div posicionado sobre el rect
  con `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` + un ring de resalte. El popover (tooltip)
  se ubica debajo del rect, o arriba si no entra, clamp al viewport.
- **Reposición:** listeners de `resize` y `scroll` recalculan el rect del paso actual
  (se limpian al cerrar/desmontar).
- **Navegación:** Anterior / Siguiente; en el último paso el botón dice **Listo**.
  Cerrar = botón "Saltar" / X / Esc / click en el backdrop.
- **Checkbox** "No volver a mostrar" en el footer del popover (default destildado).
- **Persistencia:** `markTourSeen(storageKey)` cuando: se completa (Listo en el último
  paso), **o** se cierra con el checkbox tildado. Cierre sin tildar → no se guarda.
- **Fin:** desmonta el overlay y libera listeners.

### Unidad 3 — Anclas en los dashboards
Agregar `data-onboarding="..."` a los contenedores de sección (siempre presentes, incluso
con empty state):

- `ClientDashboard.tsx`:
  - `client-search` → tarjeta del buscador de servicios.
  - `client-active` → sección "Trabajos activos" (empty state: "No tenés trabajos activos").
  - `client-history` → sección de historial (la del `historialRef`).
- `ProviderDashboard.tsx`:
  - `provider-toggle` → el toggle de online/disponible.
  - `provider-available` → sección "Trabajos disponibles" (empty state existente).
  - `provider-history` → sección de historial (empty state existente).

Y montar `<OnboardingTour .../>` en cada dashboard con sus pasos.

### Contenido de los pasos

**Cliente (`CLIENT_TOUR_STEPS`):**
1. `client-search` — **Buscá tu servicio** · "Escribí qué necesitás y encontrá al profesional indicado."
2. `client-active` — **Trabajos en curso** · "Acá seguís tus trabajos activos y cuándo tu profesional está en camino."
3. `client-history` — **Historial** · "Tus trabajos terminados quedan acá, para volver a contratar o calificar."

**Proveedor (`PROVIDER_TOUR_STEPS`):**
1. `provider-toggle` — **Ponete en línea** · "Activá el toggle para empezar a recibir trabajos."
2. `provider-available` — **Trabajos disponibles** · "Acá ves los pedidos cercanos y los tomás."
3. `provider-history` — **Historial** · "Tus trabajos completados y tus calificaciones quedan acá."

## Manejo de errores / robustez

- Ancla faltante: `availableSteps` la filtra; si no queda ninguna, el tour no arranca.
- Si el ancla del paso actual desaparece a mitad de tour (raro), el paso avanza al
  siguiente disponible; si no hay, cierra (sin marcar visto salvo que corresponda).
- `localStorage` no disponible (modo restrictivo): `shouldShowTour` devuelve true y
  `markTourSeen` falla silenciosamente → a lo sumo el tour reaparece; nunca rompe la app.
- El overlay no debe bloquear el scroll de la página de forma permanente; al cerrar se
  restablece todo.

## Testing

- **Unit (Vitest, entorno node):**
  - `shouldShowTour` / `markTourSeen` con un storage falso.
  - `availableSteps` con un `querySelector` falso (filtra anclas inexistentes, mantiene orden).
- **Manual (browser):** spotlight y posición correctos en cliente y proveedor; scroll a
  cada paso; reposición en resize; dark mode; mobile; el flag persiste (completar y
  checkbox); cerrar sin tildar reabre.

## Archivos afectados

- Crear: `apps/app/src/shared/lib/onboarding.ts` + test `__tests__/onboarding.test.ts`
- Crear: `apps/app/src/shared/components/OnboardingTour.tsx`
- Modificar: `apps/app/src/features/client/pages/ClientDashboard.tsx` (data-onboarding + montaje)
- Modificar: `apps/app/src/features/provider/pages/ProviderDashboard.tsx` (data-onboarding + montaje)
