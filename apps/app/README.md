# Aliados — App (PWA)

PWA principal de Aliados: dashboards de **cliente**, **proveedor** y **admin**. Es el frontend que consume el [backend](../../backend). Para el panorama general del proyecto ver el [README raíz](../../README.md).

## Stack

- **React 19 + TypeScript**, **Vite** (con React Compiler), **Tailwind CSS**
- **React Router** (ruteo), **TanStack Query** (datos del server), **Zustand** (estado global; persistido y **cifrado** con crypto-js)
- **Firebase Web SDK**: Auth (Google + email/password), Remote Config, Cloud Messaging (FCM)
- **PWA**: `vite-plugin-pwa` (Workbox service worker)
- **Realtime**: STOMP sobre SockJS
- **UI**: lucide-react, react-hot-toast, dayjs
- **Observabilidad**: Sentry · **Tests**: Vitest

## Estructura

```
src/
  features/          Por dominio: client/, provider/, aliados (admin)/, auth/, notifications/, components/, pages/
  shared/
    components/      UI compartida (incl. AuthProvider, MaintenanceGate, OnboardingTour, AuthErrorScreen…)
    hooks/           useFirebaseAuth, useProfile, useMaintenance, usePushNotifications, useWebSocket…
    lib/             apiClient, firebase, remoteConfig, fetchProfile, maintenance, onboarding…
    providers/       ThemeProvider, WebSocketProvider
    store/           useStore (Zustand, persistido y cifrado)
    styles/          design-system (tokens Tailwind)
    constants/ types/
  router/            AppRouter (rutas + layouts protegidos por rol)
  App.tsx main.tsx
```

## Conceptos clave

- **Auth en 2 capas:** `useFirebaseAuth` (estado de Firebase) → `useProfile` (perfil del backend, con timeout + reintento). `AuthProvider` orquesta: spinner / onboarding (usuario nuevo) / pantalla de error (backend caído, con **Reintentar / Cerrar sesión**) / app.
- **Orden de providers:** `ThemeProvider → MaintenanceGate → AuthProvider → WebSocketProvider → AppRouter`. El `MaintenanceGate` va por encima del auth para que el modo mantenimiento gane aunque el perfil no cargue.
- **Modo mantenimiento:** vía Firebase Remote Config (`useMaintenance`), sin redeploy. Bypass con `?nomaint=1`.
- **PWA / service worker:** `vite.config.ts` → `VitePWA`. El `navigateFallbackDenylist` excluye `/api`, `/ws` y **`/__/`** (este último para no interceptar el handler de Firebase Auth).
- **apiClient:** wrapper de `fetch` con auth por token y **retry de GETs** ante 5xx/red transitorios.

## Comandos

```bash
pnpm dev          # dev server (Vite)
pnpm build        # tsc -b && vite build
pnpm preview      # previsualizar el build
pnpm test         # Vitest (una corrida)
pnpm test:watch   # Vitest watch
pnpm lint         # ESLint
```

## Variables de entorno

Copiar `.env.example` → `.env` y completar. Los `.env` están gitignoreados; en CI salen de GitHub Secrets. Detalle de cada variable en el [README raíz](../../README.md#variables-de-entorno).

> **Importante:** `VITE_FIREBASE_AUTH_DOMAIN` debe ser el dominio custom (mismo origen que la app), si no el OAuth de Google entra en loop. `firebase.ts` tiene un fallback hardcodeado por las dudas.

## Tests

Vitest corre en entorno **node** (sin jsdom): se testea **lógica pura** (helpers de `shared/lib`). Componentes y posicionamiento se validan con typecheck + build + verificación manual.
