# Diseño: Feature Flags operativos (backend DB + admin)

**Fecha:** 2026-06-24
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

El backend tiene config operativa que hoy vive como **env vars** y solo se puede
cambiar redeployando. El caso testigo es `MUDANZA_RATIO_TIEMPO` (acelera el tiempo
de las mudanzas para testing): es un `@Value("${mudanza.ratio-tiempo:1.0}")` en
`MudanzaService`, y hay un footgun conocido — **hay que acordarse de borrar la env
var antes de lanzar** o se cobra/calcula con el ratio de testing en producción.

Queremos un mecanismo para togglear/ajustar config operativa **en runtime, sin
redeploy**, manejable desde el admin, y self-hosted (sin servicio externo ni costo).

## Objetivos

1. Tabla de feature flags **tipados** (no solo on/off) en la DB del backend.
2. Lectura server-side con **cache** y **default seguro** (un flag ausente nunca
   rompe la lógica de negocio).
3. **Rewire de `MUDANZA_RATIO_TIEMPO`** al sistema de flags → elimina el footgun de
   la env var (default 1.0; para testing se togglea el flag).
4. **Panel de admin** en el dashboard existente para ver/togglear/editar flags.

## No-objetivos (YAGNI)

- **Maintenance mode NO entra acá.** Ya está implementado vía Firebase Remote
  Config (`MaintenanceBanner`, `MaintenanceGate`, `useMaintenance`, `remoteConfig`,
  ver `2026-06-20-maintenance-mode-design.md`), deliberadamente **independiente del
  backend** para funcionar con el backend caído. Un flag de backend rompería ese
  requisito. Maintenance se queda donde está.
- **Sin endpoint público `GET /api/feature-flags` ni hook `useFlag` en el front.**
  Su único consumidor candidato (maintenance) ya está cubierto. El único flag inicial
  (`mudanza_ratio_tiempo`) es server-side. Se agregan cuando aparezca un flag
  *front-facing* operativo real.
- **Sin crear/borrar flags desde la UI.** Los flags se declaran por migración
  (en código); el admin solo los togglea/edita.
- Sin targeting por usuario, %rollout ni A/B (eso es trabajo de PostHog, a futuro,
  como herramienta de experimentación de producto separada).

---

## 1. Modelo de datos

### Migración `V3__feature_flags.sql`

```sql
CREATE TABLE feature_flags (
    key         VARCHAR(100) PRIMARY KEY,
    enabled     BOOLEAN      NOT NULL DEFAULT false,
    value       TEXT,                         -- valor serializado como string
    value_type  VARCHAR(20)  NOT NULL,        -- BOOLEAN | NUMBER | STRING | JSON
    description TEXT,
    updated_at  TIMESTAMPTZ,
    updated_by  VARCHAR(128)                  -- uid del admin (auditoría mínima)
);

-- Seed idempotente: NO pisa cambios hechos en runtime por el admin.
INSERT INTO feature_flags (key, enabled, value, value_type, description)
VALUES (
    'mudanza_ratio_tiempo', true, '1.0', 'NUMBER',
    'Ratio de aceleración del tiempo en mudanzas (1.0 = real, 180 = testing).'
)
ON CONFLICT (key) DO NOTHING;
```

**Decisiones:**
- `ON CONFLICT (key) DO NOTHING` es clave: el seed corre en cada `flyway migrate`,
  pero al ser repetible-seguro **nunca sobrescribe** el valor que el admin haya
  cambiado en runtime.
- `value` siempre string; `value_type` dice cómo parsearlo. Para un flag puramente
  on/off, `value` queda NULL y `value_type=BOOLEAN`.
- Flags nuevos = nueva migración versionada con su propio `INSERT ... ON CONFLICT`.

## 2. Backend (`com.aliados.backend`)

### Entity + Repository
- `entity/FeatureFlag.java` — mapea `feature_flags`. `@Id` = `key` (String).
- `repository/FeatureFlagRepository.java` — `extends JpaRepository<FeatureFlag, String>`.

### Service `service/FeatureFlagService.java`
- **Cache** en `ConcurrentHashMap<String, FeatureFlag>`:
  - Carga inicial en `@PostConstruct` (todos los flags).
  - **Write-through**: al actualizar un flag, se refresca su entrada en el cache.
  - **Reload periódico** `@Scheduled(fixedDelay = 60_000)` que recarga el cache
    desde la DB → para cuando se escale a multi-instancia (hoy Railway es single
    instance, así que el write-through ya es instantáneo; el scheduled es robustez
    a futuro).
- **Getters tipados con default seguro** (si el flag no existe, está disabled, o el
  valor no parsea → devuelve el default y loguea a nivel WARN):
  - `double getNumber(String key, double fallback)`
  - `boolean isEnabled(String key)`
  - `String getString(String key, String fallback)`
- **Gestión:**
  - `List<FeatureFlag> getAll()`
  - `FeatureFlag update(String key, boolean enabled, String value, String updatedBy)`
    — valida `value` contra `value_type` (un NUMBER debe parsear como `double`,
    BOOLEAN como `true/false`, JSON como JSON válido); si no, tira excepción de
    validación → 400.

### Controller `controller/FeatureFlagAdminController.java`
Bajo `/api/admin/feature-flags` (ya protegido por `.hasRole("ADMIN")` en
`SecurityConfig`, sin cambios de seguridad necesarios):
- `GET /api/admin/feature-flags` → lista de `FeatureFlagDto` (key, enabled, value,
  valueType, description, updatedAt).
- `PUT /api/admin/feature-flags/{key}` → body `UpdateFeatureFlagRequest`
  `{ enabled, value }`. Toma el uid del admin del contexto de auth para `updated_by`.
  Devuelve el flag actualizado. 404 si la key no existe; 400 si el valor no valida.

### DTOs (`dto/`)
- `FeatureFlagDto` (respuesta).
- `UpdateFeatureFlagRequest` (`enabled: boolean`, `value: String` nullable).

### Rewire de mudanza (`service/MudanzaService.java`)
- Eliminar el campo `@Value("${mudanza.ratio-tiempo:1.0}") private Double ratioTiempo;`.
- Eliminar la línea `mudanza.ratio-tiempo=${MUDANZA_RATIO_TIEMPO:1.0}` de
  `application.properties` (y su comentario de testing).
- Inyectar `FeatureFlagService` y, en el punto de uso (cálculo de `minutosServicio`,
  ~línea 460), leer:
  `double ratioTiempo = featureFlagService.getNumber("mudanza_ratio_tiempo", 1.0);`
- Resultado: en prod sin tocar nada el ratio es **1.0**; para testing, el admin pone
  el flag en 180 desde el panel y lo vuelve a 1.0 cuando termina. **Sin env var, sin
  redeploy, sin footgun.**

## 3. Frontend (`apps/app`)

### Panel de admin `features/aliados/FeatureFlagsPanel.tsx`
- Componente nuevo embebido en `AliadosDashboard.tsx` (sección "Feature flags").
- Lee `GET /api/admin/feature-flags` con React Query (`apiClient` existente).
- Por cada flag: nombre + descripción, un **switch** (enabled) y, si `valueType` no
  es BOOLEAN, un **input de valor** (numérico para NUMBER, texto para STRING/JSON).
- Guardar → `PUT /api/admin/feature-flags/{key}` con `{ enabled, value }`, toast de
  éxito/error (patrón `react-hot-toast` existente), invalida la query al volver.
- Validación de valor en el front (number parsea, JSON parsea) antes de mandar, pero
  el backend revalida igual (fuente de verdad).

## 4. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Flag ausente / disabled al leer en backend | getter devuelve el `fallback` (prod-safe: mudanza nunca rompe, cae a 1.0) |
| `value` no parsea al tipo declarado (lectura) | log WARN + devuelve `fallback` |
| PUT con valor inválido para el `value_type` | 400 con mensaje claro |
| PUT a una key inexistente | 404 |
| Cache vacío / DB lenta en boot | `@PostConstruct` falla ruidoso solo si la DB no está; en operación normal el reload periódico tolera fallos transitorios (mantiene el cache previo) |

## 5. Testing

- **Backend (corre en el CI nuevo, sin DB):** unit test de `FeatureFlagService` con
  `FeatureFlagRepository` mockeado — cubre getters tipados, parseo, fallback ante
  flag ausente/disabled/valor inválido, y validación en `update()`. No usa
  `@SpringBootTest` (no necesita contexto ni Postgres).
- **Frontend:** vitest del helper de parseo/validación de valor del panel.

## 6. Notas de rollout

- La migración V3 es aditiva (tabla nueva + seed idempotente), sin riesgo sobre datos
  existentes.
- El rewire de `MudanzaService` cambia el origen del ratio pero **conserva el default
  1.0**, así que el comportamiento en prod es idéntico al actual (asumiendo que la
  env var `MUDANZA_RATIO_TIEMPO` no esté seteada en prod; si lo estuviera, este cambio
  justamente la deja de leer → hay que quitarla de Railway al deployar).
- Al desplegar: remover `MUDANZA_RATIO_TIEMPO` de las variables de Railway (ya no se
  lee). Documentar en el PR.
