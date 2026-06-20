# Diseño: Modo mantenimiento + Deploys sin downtime

**Fecha:** 2026-06-20
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

Al deployar el backend (Spring Boot en Railway), hay una ventana en la que Railway
corta el tráfico al contenedor viejo antes de que el nuevo termine de bootear
(~15-30s), devolviendo `502`. Los usuarios en prod ven errores durante cada deploy.

Además, para migraciones grandes (donde algo de downtime es inevitable) no existe
forma de avisar/bloquear la app, y un toggle no puede depender de redeployar
(el deploy es justo lo que rompe) ni del backend (que durante una migración puede
estar caído).

## Objetivos

1. **Zero-downtime** en deploys normales: que el usuario no vea `502`.
2. **Modo mantenimiento a demanda**, con dos niveles (aviso + bloqueo), toggleable
   en runtime **sin redeploy** e **independiente del backend**.

## No-objetivos (YAGNI)

- Realtime en el flag (el polling alcanza para mantenimiento).
- Flag de mantenimiento en el backend (rompe el requisito de independencia).
- Panel de admin propio para el toggle (la consola de Firebase ya cumple ese rol).

---

## Subsistema 1 — Modo mantenimiento (Firebase Remote Config)

El flag vive en **Firebase Remote Config**: independiente de Railway (funciona con
el backend caído), toggleable desde la consola sin deploy, y sin dependencias nuevas
(el paquete `firebase` 12.9.0 ya incluye Remote Config).

### Parámetros de Remote Config (a crear en la consola)

| Parámetro | Tipo | Default |
|---|---|---|
| `maintenance_level` | String | `off` |
| `maintenance_title` | String | `Estamos actualizando` |
| `maintenance_message` | String | `Volvemos en unos minutos. ¡Gracias por la paciencia!` |
| `maintenance_eta` | String | *(vacío)* |

`maintenance_level` admite: `off` | `warning` | `blocked`.

### Piezas frontend

- **`src/shared/lib/remoteConfig.ts`** — inicializa `getRemoteConfig(app)` con:
  - `settings.minimumFetchIntervalMillis`: `60_000` en prod, `0` en dev.
  - `defaultConfig`: `{ maintenance_level: "off", maintenance_title: "...", maintenance_message: "...", maintenance_eta: "" }`.
  - **Fail-open:** si Remote Config no responde, se usan los defaults (`off`) → la app
    funciona normal aunque los parámetros aún no existan o falle la red.

- **`src/shared/hooks/useMaintenance.ts`** — `fetchAndActivate` al montar y en un
  intervalo. Devuelve `{ level, title, message, eta }`.
  - Poll normal: cada 60s.
  - Cuando `level === "blocked"`: poll más rápido (~20s), para que al apagar el
    mantenimiento los usuarios se recuperen sin recargar a mano.

- **`src/shared/components/MaintenanceGate.tsx`** — envuelve la app:
  - `blocked` → pantalla full-screen bloqueante (título + mensaje + ETA + botón
    "Reintentar" que re-fetchea). No renderiza children.
  - `warning` → banner no-bloqueante arriba; children normales debajo.
  - `off` → children, sin nada.
  - Se monta **arriba del router** para que el bloqueo cubra también las páginas de auth.

- **Bypass dev/testers:** query param `?nomaint=1` guarda un flag en `localStorage`
  que hace ignorar el nivel `blocked` (el `warning` se sigue viendo). Permite entrar
  a verificar mientras para el resto está bloqueado.

### Flujo de mantenimiento (migración grande)

1. Con anticipación: `maintenance_level = warning` (+ message/eta) → banner de aviso.
2. A la hora: `maintenance_level = blocked` → pantalla de bloqueo.
3. Se hace la migración/deploy.
4. `maintenance_level = off` → la app vuelve (los clientes se recuperan en ≤20s por
   el poll acelerado, o con "Reintentar").

Todo desde la consola de Firebase, sin deploy, y funciona aunque Railway esté caído.

---

## Subsistema 2 — Deploys normales sin downtime

### a) Healthcheck de Railway (causa raíz de los 502)

Agregar `railway.json` versionado en el repo:

```json
{ "deploy": { "healthcheckPath": "/api/health", "healthcheckTimeout": 300 } }
```

Railway mantiene el contenedor viejo sirviendo tráfico **hasta que el nuevo responde
200 en `/api/health`**, y recién ahí switchea. Elimina la ventana de 502 en deploys
normales. (Confirmar también en el dashboard de Railway que no haya override.)

El endpoint `/api/health` ya existe (`HealthController`) y está permitido en
`SecurityConfig`.

### b) Graceful shutdown (Spring Boot)

En `application.properties`:

```properties
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

Las requests en vuelo terminan antes de que muera el contenedor viejo.

### c) Retry en `apiClient`

En la función central `request()` de `src/shared/lib/apiClient.ts`:

- Reintentar **solo métodos idempotentes (GET)** ante `502/503/504` o error de red.
- Hasta 2 reintentos con backoff corto (ej. 300ms, 800ms).
- **No** reintentar `POST/PATCH/PUT/DELETE` automáticamente (evita escrituras
  duplicadas).

Suaviza micro-blips más allá de los deploys.

### d) WebSocket (verificación)

Confirmar que el cliente STOMP tenga `reconnectDelay > 0` para reconectar solo tras
un deploy. (Verificación, no necesariamente cambio.)

### Flujo de deploy normal

CI → Railway levanta el contenedor nuevo → espera `/api/health` 200 → switchea el
tráfico → el viejo drena (graceful). El usuario no ve interrupción; el retry del
`apiClient` cubre cualquier micro-parpadeo. No requiere tocar Remote Config.

---

## Testing

- **Unit:** mapping `level → render` de `MaintenanceGate` (off/warning/blocked);
  retry del `apiClient` (mock `502` → `200`, y verificar que NO reintenta POST).
- **Manual:** flipear Remote Config y ver banner/bloqueo aparecer en ≤60s; disparar
  un deploy de backend y confirmar 0 errores en Network.

## Archivos afectados

**Nuevos:**
- `apps/app/src/shared/lib/remoteConfig.ts`
- `apps/app/src/shared/hooks/useMaintenance.ts`
- `apps/app/src/shared/components/MaintenanceGate.tsx`
- `backend/railway.json` (el servicio de Railway buildea desde `backend/` — ahí está
  el `Dockerfile` —, así que el config va en ese root; confirmar el "Root Directory"
  del servicio en el dashboard)

**Modificados:**
- `apps/app/src/shared/lib/apiClient.ts` (retry GET en 5xx/red)
- `apps/app/src/shared/lib/firebase.ts` (exponer `app` para Remote Config — ya se exporta)
- montaje de `MaintenanceGate` (App/router root)
- `backend/src/main/resources/application.properties` (graceful shutdown)

## Acciones manuales del usuario (fuera del código)

- Crear los 4 parámetros de Remote Config en la consola de Firebase.
- Verificar/ajustar el healthcheck en el dashboard de Railway.
