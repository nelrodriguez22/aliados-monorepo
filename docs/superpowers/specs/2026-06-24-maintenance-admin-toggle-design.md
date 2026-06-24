# Diseño: Toggle de maintenance mode desde el admin panel

**Fecha:** 2026-06-24
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

El maintenance mode ya existe (ver `2026-06-20-maintenance-mode-design.md`): vive en
**Firebase Remote Config** y el front lo **lee** client-side (`useMaintenance` /
`remoteConfig.ts`) para mostrar banner/gate. Pero **togglearlo hoy solo se puede
desde la consola de Firebase**. Queremos manejarlo desde el propio admin panel, sin
salir de la app.

El SDK cliente de Firebase es **read-only** para Remote Config — no se puede escribir
desde el browser. Escribir requiere credenciales privilegiadas, así que el toggle pasa
por el backend, que ya tiene el Firebase Admin SDK inicializado.

## Objetivos

1. Leer y editar el estado de mantenimiento desde el admin panel: nivel
   (`off` | `warning` | `blocked`) + textos (título, mensaje, horario y duración).
2. Backend escribe los parámetros de Remote Config vía Admin SDK
   (`FirebaseRemoteConfig`), confirmado disponible en `firebase-admin:9.4.2`.
3. El banner/gate de usuarios **no cambia**: sigue leyendo Remote Config client-side.

## No-objetivos (YAGNI)

- **Reemplazar la lectura client-side.** Se conserva: el gate debe funcionar con el
  backend caído (su razón de ser original). Solo el *toggle* (escritura) pasa por el
  backend.
- **Condiciones/segmentación de Remote Config.** Solo editamos los `defaultValue` de
  4 parámetros. No tocamos conditions ni parameter groups.
- **Historial/rollback de versiones de Remote Config.** La consola de Firebase ya lo
  ofrece; no lo replicamos.

## Caveat de arquitectura (aceptado)

Togglear desde el backend significa que **no se puede encender el mantenimiento si el
backend está caído de forma imprevista**. Para mantenimiento *planificado* (el caso
principal: se prende antes de una migración, con el backend sano) es perfecto. Para una
caída inesperada, la **consola de Firebase queda como break-glass**.

---

## Parámetros de Remote Config

Los 4 que ya lee el front (`apps/app/src/shared/lib/remoteConfig.ts`):

| Parámetro | Valores |
|---|---|
| `maintenance_level` | `off` \| `warning` \| `blocked` |
| `maintenance_title` | string libre (pantalla de bloqueo) |
| `maintenance_message` | string libre (pantalla de bloqueo) |
| `maintenance_schedule` | string libre (banner de aviso, ej. `22:00 hs`, vacío permitido) |
| `maintenance_duration` | string libre (banner de aviso, ej. `30 minutos`, vacío permitido) |

## 1. Backend (`com.aliados.backend`)

### Bean `FirebaseRemoteConfig`
En `config/FirebaseConfig.java`, agregar un `@Bean` que dependa del `FirebaseApp`
existente, para que el service sea inyectable y **mockeable en tests**:
```java
@Bean
public FirebaseRemoteConfig firebaseRemoteConfig(FirebaseApp app) {
    return FirebaseRemoteConfig.getInstance(app);
}
```

### Service `service/MaintenanceService.java`
Constructor recibe `FirebaseRemoteConfig`. Métodos:

- `MaintenanceState get()`:
  - `Template t = remoteConfig.getTemplate();`
  - Lee `t.getParameters().get("maintenance_level")` etc.; de cada `Parameter`, el
    `getDefaultValue()` casteado a `ParameterValue.Explicit` → `getValue()`.
  - Si un parámetro no existe aún en el template publicado, usa el default
    (mismos valores que el `DEFAULTS` del front en `remoteConfig.ts`: `off`, los
    textos por defecto, y `""` para `schedule` y `duration`).
  - Devuelve `MaintenanceState(level, title, message, schedule, duration)`.

- `void update(String level, String title, String message, String schedule, String duration, String adminUid)`:
  - Valida `level ∈ {off, warning, blocked}` → si no, `IllegalArgumentException`.
  - `Template t = remoteConfig.getTemplate();` (trae la versión actual → evita
    conflictos de ETag al publicar).
  - **Upsert** de los 5 parámetros en `t.getParameters()`:
    `params.put("maintenance_level", new Parameter().setDefaultValue(ParameterValue.of(level)))`
    (idem title/message/schedule/duration). Si ya existían, `setDefaultValue` los pisa.
  - `remoteConfig.publishTemplate(t);`
  - Loguea `INFO`: `"Maintenance actualizado a level={} por admin={}"` (auditoría).
  - Deja propagar `FirebaseRemoteConfigException`; el controller la mapea a 502.

Tipo interno `MaintenanceState` (record: level, title, message, schedule, duration).

### DTOs (`dto/`)
- `MaintenanceStateDto(String level, String title, String message, String schedule, String duration)`.
- `UpdateMaintenanceRequest(String level, String title, String message, String schedule, String duration)`.

### Controller `controller/MaintenanceAdminController.java`
Bajo `/api/admin/maintenance` (ya gateado por `.hasRole("ADMIN")` en SecurityConfig —
mismo patrón centralizado que el resto de `/api/admin/**`; comentar dónde vive el gate):
- `GET /api/admin/maintenance` → `MaintenanceStateDto`.
- `PUT /api/admin/maintenance` → body `UpdateMaintenanceRequest`, toma `adminUid` de
  `Authentication.getName()`, devuelve el estado actualizado.
  - `IllegalArgumentException` (nivel inválido) → 400.
  - `FirebaseRemoteConfigException` (falla de publish) → 502 con mensaje claro.

## 2. Frontend (`apps/app`)

### `features/aliados/MaintenancePanel.tsx`
Sección en `AliadosDashboard` (junto al resto de paneles admin):
- `useQuery` a `GET /api/admin/maintenance` → estado actual.
- Indicador del nivel actual con color (off=verde, warning=ámbar, blocked=rojo).
- Selector de nivel (off/warning/blocked) + inputs de título, mensaje, horario
  (`schedule`) y duración (`duration`), precargados con el estado actual.
- Botón Guardar → `useMutation` `PUT /api/admin/maintenance`; toast éxito/error;
  invalida la query al volver.
- **Confirmación** al guardar con `level === "blocked"`: un `window.confirm`/diálogo
  ("Esto bloquea el acceso a TODOS los usuarios. ¿Confirmás?") antes del PUT.
- Reusa `apiClient` (`get`/`put`), React Query y `react-hot-toast` existentes.

### Tipos: reusar los canónicos
NO se crea un módulo de tipos nuevo. El panel **reusa** `apps/app/src/shared/lib/maintenance.ts`,
que ya define `MaintenanceLevel`, `MaintenanceState` (`{ level, title, message, schedule, duration }`)
y `resolveLevel(raw)` (sanitiza un string al nivel válido). El panel usa `resolveLevel`
para el nivel que llega del backend antes de setearlo en el form.

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Parámetro ausente en el template (GET) | usa el default (`off` / textos default / `""`) |
| Nivel inválido (PUT) | 400 con mensaje |
| `publishTemplate` falla (red / ETag / permisos) | 502 + toast claro; `getTemplate` justo antes de publicar minimiza conflictos de versión |
| Backend caído | el toggle no está disponible (esperado) → usar consola de Firebase (break-glass) |

## 4. Testing

- **Backend (sin DB → corre en el CI):** unit test de `MaintenanceService` con
  `FirebaseRemoteConfig` **mockeado** (Mockito). Casos: `get()` lee los params y cae a
  defaults si faltan; `update()` valida el nivel (rechaza inválido), hace upsert de los
  5 params y llama `publishTemplate`; verifica con `InOrder` que se relee `getTemplate()`
  antes de publicar. No usa `@SpringBootTest` (no necesita contexto ni Postgres).
- **Frontend:** la sanitización del nivel la cubre `resolveLevel`, ya testeado en
  `shared/lib/maintenance` (no se agrega helper nuevo).

## 5. Seguridad

- Endpoints bajo `/api/admin/**` → ya gateados por `.hasRole("ADMIN")` (SecurityConfig).
  No se modifica la config de seguridad. El `MaintenancePanel` se renderiza dentro de
  `AliadosDashboard`, que ya está detrás de `<ProtectedRoute allowedRoles={['ADMIN']}>`.

## 6. Notas de rollout

- Asegurar que el service account del backend (Firebase Admin) tenga permiso para
  publicar Remote Config (rol **Firebase Remote Config Admin** o equivalente). Si falta,
  el `publishTemplate` devuelve 403 → documentar el rol requerido en el PR.
- La primera escritura crea los parámetros en el template publicado si aún no existían.
