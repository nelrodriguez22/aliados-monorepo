# Resiliencia ante backend caído (spinner eterno en auth) — Diseño

**Fecha:** 2026-06-20
**Estado:** Aprobado (pendiente implementación)

## Problema

Cuando el backend no responde (DB caída, deploy fallido, etc.) y el usuario tiene
una sesión de Firebase válida, la app queda **trabada en un spinner para siempre** y
no se puede ni cerrar sesión.

**Causa raíz** (`apps/app/src/shared/components/AuthProvider.tsx:43`):

```
QueryClientProvider → AuthProvider → App( ThemeProvider → MaintenanceGate → … )
```

- `AuthProvider` hace `if (!profile) return <Spinner/>`. Solo mira la ausencia de
  perfil; **no maneja el estado de error** de la query.
- `useProfile` (`/api/users/me`) **no tiene timeout**: si el backend cuelga, el fetch
  queda colgado y la query nunca sale de `pending`.
- Si el backend devuelve error, React Query reintenta 2 veces y setea `error`, pero
  `AuthProvider` igual cae en `!profile → <Spinner/>` (no distingue error de carga).
- El spinner ocupa toda la pantalla y `isAuthenticated` está persistido (store
  encriptado) → no hay UI para salir.

**Agravante de orden:** `AuthProvider` está **por encima** de `MaintenanceGate`. Cuando
spinea, corta el render antes de montar el Gate, así que el flag `blocked` del modo
mantenimiento **no puede rescatar** a un usuario ya trabado.

## Objetivo

1. Que la app **nunca** deje al usuario trabado sin salida cuando el backend no
   responde (caída planeada o inesperada).
2. Que, en un mantenimiento planeado, el flag `blocked` muestre la pantalla branded
   de mantenimiento aunque el perfil no cargue.

## No-objetivos (YAGNI)

- **No** se fuerza el logout masivo antes de acciones de mantenimiento (no es
  confiable para clientes desconectados, es destructivo y no cubre caídas
  inesperadas).
- **No** se cambia el mecanismo de persistencia del store ni el flujo de login.
- **No** se agrega retry/timeout a otras queries fuera del bootstrap de auth (el
  `apiClient` ya tiene su propio retry de GETs; acá solo tocamos `useProfile`).

## Diseño

### Parte A — Resiliencia en el bootstrap de auth (opción 1)

**A1. Timeout + reintentos en el fetch del perfil** — `apps/app/src/shared/hooks/useProfile.ts`

- Envolver el `fetch` de `/api/users/me` con un `AbortController` y un timeout de
  **5 segundos** por intento.
  - Razón del valor: es una PWA mobile-first; un GET chico que pasa de 5s casi
    siempre es problema real (backend colgado), no red lenta. Por debajo (3-4s) se
    arriesgan falsos positivos en conexiones móviles flojas (DNS+TLS+TCP frío).
- Si se aborta por timeout, la `queryFn` lanza un error de tipo "red/timeout" (NO
  `Unauthorized` ni `NotRegistered`), de modo que entre en la rama de reintento y,
  agotados los reintentos, quede como error recuperable.
- **Bajar los reintentos del bootstrap de 2 → 1** (2 intentos en total). Con 5s por
  intento, el peor caso hasta la pantalla de fallo queda en ~10s (en vez de ~15s con
  2 reintentos). Un solo reintento alcanza para absorber un blip de red transitorio.
- No cambia la clasificación existente: `401/403 → Unauthorized` (signOut+logout),
  `404 → NotRegistered` (onboarding), resto → error de servidor/red.

**A2. Pantalla de fallo en `AuthProvider`** — `apps/app/src/shared/components/AuthProvider.tsx`

- `useProfile` ya expone el objeto de React Query. Exponer/usar también:
  - `isError` / `error`
  - `isFetching` (para deshabilitar "Reintentar" mientras reintenta)
  - `refetch`
- Nueva lógica de render en `AuthProvider` (manteniendo el orden actual de chequeos):
  1. `firebaseLoading` → `<Spinner/>`
  2. `!firebaseUser` → `children`
  3. `!emailVerified` → `children`
  4. `isNewUser` → `children`
  5. **`isError` (perfil falló, recuperable)** → `<AuthErrorScreen onRetry={refetch} retrying={isFetching} />`  ← NUEVO
  6. `!profile` (aún cargando) → `<Spinner/>`
  7. `children`

- Componente nuevo `AuthErrorScreen` (`apps/app/src/shared/components/AuthErrorScreen.tsx`):
  - Mensaje: "No pudimos conectar con el servidor." + subtexto breve.
  - Botón **Reintentar** → `onRetry()` (deshabilitado mientras `retrying`).
  - Botón **Cerrar sesión** → `signOut(auth)` + `logout()` del store + navega a login.
    Esta es la salida que hoy no existe.
  - Estilo consistente con la pantalla de bloqueo de `MaintenanceGate` (icono, dark mode).

> Nota: el cierre de sesión desde esta pantalla debe funcionar **sin** backend (solo
> `signOut` de Firebase + `logout` del store + redirect). No depende de `/api/...`.

**A3. Feedback durante la espera (spinner no pelado)** — `AuthProvider` / `Spinner`

- Mientras se espera el perfil (estado 6, `<Spinner/>`), mostrar un texto que aparece
  **después de ~3s** debajo del spinner: *"Esto está tardando más de lo normal, por
  favor aguardá…"*.
- Así la secuencia percibida es: spinner → (~3s) "esto está tardando…" → (~10s)
  pantalla de fallo accionable. Evita el spinner pelado largo sin agregar complejidad.
- El texto demorado se controla con un `setTimeout` local en el componente Spinner
  (se limpia al desmontar); no requiere estado global.

### Parte B — Precedencia del mantenimiento (opción 2)

Reordenar el árbol de providers para que el Gate evalúe **antes** que el auth:

```
ThemeProvider → MaintenanceGate → AuthProvider → WebSocketProvider → AppRouter
```

- Hoy `AuthProvider` envuelve a `<App/>` en `main.tsx`, y `App` contiene
  `ThemeProvider → MaintenanceGate → WebSocketProvider → AppRouter`.
- Cambio: **bajar `AuthProvider` dentro de `App`**, debajo del `MaintenanceGate`.
  - `main.tsx`: `QueryClientProvider → [<App/>, <Toaster/>, <ReactQueryDevtools/>]`
    (se saca `AuthProvider` de acá; el `Toaster` pasa a ser hermano de `<App/>` bajo
    `QueryClientProvider`).
  - `App.tsx`: `ThemeProvider → MaintenanceGate → AuthProvider → WebSocketProvider → AppRouter`.
- `MaintenanceGate` solo usa Remote Config (Firebase, no auth ni store), así que
  ubicarlo por encima de `AuthProvider` es seguro.
- `ThemeProvider` queda por encima del Gate (la pantalla de bloqueo usa clases
  `dark:`), igual que hoy.

**Resultado combinado:**
- Caída **inesperada** → Parte A: pantalla de fallo con Reintentar / Cerrar sesión.
- Mantenimiento **planeado** (flag `blocked`) → Parte B: pantalla branded de
  mantenimiento gana sobre el spinner/fallo, y rescata a usuarios ya trabados al
  publicarse el flag (≤60s, ≤20s en blocked).

## Manejo de errores

- Timeout de perfil: 5s por intento vía `AbortController`; se trata como error
  recuperable. Con 1 reintento, peor caso a la pantalla de fallo ~10s.
- `AuthProvider` distingue: cargando (`Spinner`, con texto demorado a los ~3s) vs
  error recuperable (`AuthErrorScreen`) vs casos ya existentes (onboarding /
  unauthorized).
- "Cerrar sesión" siempre disponible y operable sin backend.

## Testing

- **Unit:** lógica de timeout/clasificación de error en `useProfile` (que un timeout
  produce error recuperable y no `Unauthorized`/`NotRegistered`). Con Vitest +
  `fetch` mockeado y timers falsos donde aplique.
- **Manual:**
  1. Backend caído con sesión válida → aparece `AuthErrorScreen` (no spinner eterno);
     "Cerrar sesión" lleva a login; "Reintentar" reintenta.
  2. Con backend caído, publicar `maintenance_level=blocked` → en ≤60s se ve la
     pantalla de mantenimiento (Parte B) por encima del fallo.
  3. Flujos normales intactos: login, onboarding (404), expiración (401).

## Archivos afectados

- `apps/app/src/shared/hooks/useProfile.ts` (timeout + exponer error/refetch/isFetching)
- `apps/app/src/shared/components/AuthProvider.tsx` (rama de error)
- `apps/app/src/shared/components/AuthErrorScreen.tsx` (nuevo)
- `apps/app/src/App.tsx` y `apps/app/src/main.tsx` (reorden de providers)
- Tests: `apps/app/src/shared/hooks/__tests__/useProfile.test.ts` (nuevo, según lo testeable)
