# Aliados

Plataforma que conecta **clientes** con **profesionales de confianza** (oficios y mudanzas): el cliente pide un servicio, el proveedor lo toma, y la app coordina el trabajo en tiempo real (seguimiento, notificaciones, calificaciones).

> **Estado:** pre-launch. El único entorno activo es producción, sin usuarios reales todavía (dev + testers).

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Estructura del repo](#estructura-del-repo)
- [Stack](#stack)
- [Funcionalidades](#funcionalidades)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Scripts](#scripts)
- [Tests](#tests)
- [Deploy](#deploy)
- [Notas operativas](#notas-operativas)

---

## Arquitectura

Monorepo (**pnpm workspaces + Turborepo**) con el frontend, y un backend Spring Boot aparte.

```
Cliente / Proveedor / Admin (PWA React)
        │  HTTPS + WebSocket (STOMP/SockJS)
        ▼
Backend Spring Boot (Railway)  ──► PostgreSQL (Neon, vía Flyway)
        │
        ├─ Firebase Admin (verificación de tokens, FCM push)
        ├─ Cloudinary (imágenes)
        ├─ Resend (emails de registración / verificación)
        └─ Sentry (errores)

Auth: Firebase Auth (Google + email/password)
Config en runtime: Firebase Remote Config (modo mantenimiento)
Hosting frontend: Firebase Hosting (app + landing)
```

## Estructura del repo

```
apps/
  app/        PWA principal (clientes, proveedores, admin) — React + Vite
  landing/    Landing pública — Astro
  mobile/     Placeholder (app mobile nativa, aún no implementada)
packages/
  ui/                  Componentes React compartidos (@repo/ui)
  eslint-config/       Config de ESLint compartida
  typescript-config/   tsconfig base compartido
  api/ stores/ types/  Placeholders para código compartido (aún vacíos)
backend/      API Spring Boot (Java 21, Gradle) + migraciones Flyway
loadtest/     Scripts de prueba de carga (k6)
docs/         Specs y planes de diseño (docs/superpowers/)
firebase.json Hosting (targets app/landing), headers de seguridad y CSP
turbo.json    Pipeline de Turborepo
```

## Stack

**Frontend (`apps/app`)**
- React 19 + TypeScript, Vite (con React Compiler), Tailwind CSS
- React Router, TanStack Query (datos del server), Zustand (estado global; persistido y cifrado con crypto-js)
- Firebase Web SDK: Auth, Remote Config, Cloud Messaging (FCM)
- PWA: `vite-plugin-pwa` (Workbox service worker)
- Realtime: STOMP sobre SockJS
- UI: lucide-react (íconos), react-hot-toast, dayjs
- Observabilidad: Sentry
- Tests: Vitest (lógica pura, entorno node)

**Landing (`apps/landing`)**
- Astro + Tailwind

**Backend (`backend`)**
- Java 21, Spring Boot 3.4.2 (Web, Data JPA, Security, Validation, WebSocket, Actuator)
- PostgreSQL gestionado en **Neon** (neon.tech) + Flyway (migraciones versionadas)
- Firebase Admin (verificación de ID tokens, envío de push FCM)
- Cloudinary (subida/gestión de imágenes), Caffeine (cache en memoria), Sentry
- Resend (envío de emails de registración / verificación, vía su API HTTP)
- Build: Gradle

**Infra / CI**
- Frontend: Firebase Hosting (deploy automático por GitHub Actions)
- Backend: Railway (Docker, con healthcheck y graceful shutdown)

## Funcionalidades

- **Roles:** cliente, proveedor y admin, cada uno con su dashboard.
- **Servicios (oficios):** búsqueda, pedido, seguimiento del trabajo en curso, historial, calificaciones.
- **Mudanzas:** flujo propio con tiers de precio y comisión de plataforma.
- **Proveedor:** toggle online/offline (recibe trabajos), trabajos disponibles, historial.
- **Tiempo real:** estado del proveedor y avance del trabajo vía WebSocket; push con FCM.
- **Onboarding:** tour spotlight de 3 pasos por dashboard (cliente/proveedor), una sola vez (localStorage).
- **Modo mantenimiento:** banner de aviso o pantalla de bloqueo, toggleable en runtime desde Firebase Remote Config (sin redeploy). Bypass con `?nomaint=1`.
- **Resiliencia:** retry de GETs ante errores transitorios, timeout + pantalla de error con "Reintentar / Cerrar sesión" si el backend no responde.
- **PWA:** instalable, con service worker.

## Requisitos

- Node.js ≥ 18 (CI usa 22) y **pnpm 9**
- Para el backend: JDK 21 (incluye `./gradlew`)
- Cuentas/servicios: Firebase, Neon (Postgres), Cloudinary, Railway, Google Maps API, Sentry

## Puesta en marcha

```bash
# 1. Instalar dependencias (desde la raíz)
pnpm install

# 2. Configurar variables de entorno del frontend
cp apps/app/.env.example apps/app/.env
# completar los valores (ver sección Variables de entorno)

# 3. Levantar el frontend en dev
pnpm dev --filter app          # o: cd apps/app && pnpm dev

# Landing
pnpm dev --filter landing
```

Backend:
```bash
cd backend
./gradlew bootRun          # requiere las env vars del backend (DB, Firebase, Cloudinary, etc.)
./gradlew build            # compila + tests
```

## Variables de entorno

Frontend (`apps/app/.env`, ver `.env.example`):

| Variable | Para qué |
|----------|----------|
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_MEASUREMENT_ID` | Config del Firebase Web SDK |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Debe ser el dominio custom (mismo origen que la app)**, ej. `aliados-app.convivirtech.com.ar`, para que el OAuth de Google no entre en loop |
| `VITE_STORAGE_KEY` | Clave para cifrar el store persistido |
| `VITE_API_URL` | URL del backend |
| `VITE_GOOGLE_MAPS_API_KEY` | Mapas / geocoding |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_TRACES_SAMPLE_RATE` | Sentry frontend |
| `VITE_APP_VERSION` | Versión (en CI = commit SHA) |

> Los `.env` están gitignoreados. En CI los valores salen de **GitHub Secrets** (ver `.github/workflows/deploy.yml`).

## Scripts

Desde la raíz (Turborepo orquesta todos los workspaces):

```bash
pnpm dev           # dev de todo
pnpm build         # build de todo
pnpm lint          # lint
pnpm check-types   # typecheck
pnpm format        # prettier
```

Filtrar a un workspace: agregar `--filter app` / `--filter landing`.

App (`apps/app`):
```bash
pnpm test          # Vitest (una corrida)
pnpm test:watch    # Vitest watch
pnpm build         # tsc -b && vite build
```

## Tests

- **Frontend:** Vitest en entorno **node** (sin jsdom) → se testea **lógica pura** (helpers, clasificación de errores, etc.). Componentes y posicionamiento se verifican con typecheck + build + manual.
- **Backend:** `./gradlew test` (JUnit / Spring Boot Test).
- **Carga:** scripts k6 en `loadtest/`.

## Deploy

- **Frontend → Firebase Hosting:** automático vía GitHub Actions (`.github/workflows/deploy.yml`) en cada push a `main` que toque `apps/app/**`, `apps/landing/**` o `packages/**`. Buildea con las env vars de GitHub Secrets y corre `firebase deploy --only hosting`.
- **Backend → Railway:** deploy por push; usa `backend/railway.json` (healthcheck en `/api/health`) + graceful shutdown para deploys sin downtime.

## Notas operativas

- **Modo mantenimiento:** en Firebase Console → Remote Config, parámetros `maintenance_level` (`off`/`warning`/`blocked`), `maintenance_schedule`, `maintenance_duration`, `maintenance_title`, `maintenance_message`. Publicar para aplicar en runtime.
- **Migraciones:** la base se versiona con Flyway (`backend/src/main/resources/db/migration`). No editar migraciones ya aplicadas; agregar nuevas.
- **Auth de Google:** el `authDomain` debe ser el dominio custom (mismo origen que la app). El service worker excluye `/__/` del fallback para no interceptar el handler de Firebase.
- **Antes de lanzar:** revisar flags de testing (p. ej. `MUDANZA_RATIO_TIEMPO` debe ir en su valor real de producción).
- **Docs de diseño:** las decisiones y planes de features viven en `docs/superpowers/`.
