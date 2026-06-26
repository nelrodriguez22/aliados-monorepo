# Diseño: Config operativa como feature flags (comisión + límites + scoring)

**Fecha:** 2026-06-25
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

Varios valores operativos están hard-codeados (constantes) o como env var (`@Value`),
así que cambiarlos requiere **redeploy**:
- Comisión de mudanzas: `@Value("${app.mudanza.comision-porcentaje:10.00}")`.
- Límite de trabajos simultáneos por proveedor: constantes `LIMITE_TRABAJOS_DEFAULT = 3`,
  `LIMITE_TRABAJOS_FLETE = 8`.
- Pesos del algoritmo de matching: constantes `PESO_CALIFICACION = 0.40`,
  `PESO_TASA_ACEPTACION = 0.35`, `PESO_VELOCIDAD_RESPUESTA = 0.25`, y
  `TIEMPO_MAX_RESPUESTA_MIN = 30.0`.

Queremos tunearlos en runtime desde el panel, sin redeploy — reusando el sistema de
feature flags ya existente (mismo patrón que `mudanza_ratio_tiempo`).

## Objetivos

1. Mover esos 7 valores a feature flags NUMBER.
2. Reconectar los 3 services para leer del flag (con default prod-safe).
3. Los pesos del scoring se **auto-normalizan** al leerlos (siempre suman 1.0 efectivo),
   para que un valor mal puesto no rompa el ranking.

## No-objetivos (YAGNI)

- **Frontend nuevo.** Los 7 flags aparecen solos en el `FeatureFlagsPanel` (editor de
  valor + descripción), porque son NUMBER. Cero panel nuevo.
- **Comisión de trabajos.** No existe (la comisión es solo de mudanzas). Un solo flag.
- **Validar que los pesos sumen 1.0 en el panel.** Se resuelve normalizando en la lectura,
  no restringiendo la edición.

---

## 1. Flags (migración `V5__config_flags_operativa.sql`)

Seed idempotente (`ON CONFLICT (key) DO NOTHING`), todos `enabled=true`, `value_type=NUMBER`:

| key | value | description |
|---|---|---|
| `mudanza_comision_porcentaje` | `10` | % de comisión sobre el monto de la mudanza |
| `limite_trabajos_default` | `3` | Máx. de trabajos simultáneos por proveedor |
| `limite_trabajos_flete` | `8` | Máx. de trabajos simultáneos para fletes |
| `score_peso_calificacion` | `0.40` | Peso de la calificación en el score de matching (se normaliza) |
| `score_peso_aceptacion` | `0.35` | Peso de la tasa de aceptación (se normaliza) |
| `score_peso_velocidad` | `0.25` | Peso de la velocidad de respuesta (se normaliza) |
| `score_tiempo_max_respuesta_min` | `30` | Minutos de referencia para normalizar la velocidad (30+ → 0) |

## 2. Backend (`com.aliados.backend`)

### `MudanzaService`
- Ya tiene `FeatureFlagService` inyectado.
- Eliminar el campo `@Value("${app.mudanza.comision-porcentaje:10.00}") private BigDecimal comisionPorcentaje;`
  (y el import de `@Value` si no queda otro uso — hay que verificar).
- En el punto de uso (`mudanza.setComisionPorcentaje(...)`), leer:
  `BigDecimal comisionPorcentaje = BigDecimal.valueOf(featureFlagService.getNumber("mudanza_comision_porcentaje", 10.0));`
- Quitar la línea `app.mudanza.comision-porcentaje` de `application.properties` si está.

### `TrabajoService`
- **Inyectar `FeatureFlagService`** (`@Autowired`, mismo estilo que los otros campos).
- En `getLimiteTrabajos(Oficio oficio)`, reemplazar las constantes por lecturas del flag:
  - Flete → `(int) featureFlagService.getNumber("limite_trabajos_flete", 8)`
  - default → `(int) featureFlagService.getNumber("limite_trabajos_default", 3)`
- Las constantes `LIMITE_TRABAJOS_DEFAULT`/`LIMITE_TRABAJOS_FLETE` se eliminan (o quedan
  solo como fallback de `getNumber`, que es lo que se usa).

### `ProviderScoreService`
- **Inyectar `FeatureFlagService`**.
- En `calcularScore(User)`, leer y **normalizar** los pesos:
  ```
  w1 = getNumber("score_peso_calificacion", 0.40)
  w2 = getNumber("score_peso_aceptacion", 0.35)
  w3 = getNumber("score_peso_velocidad", 0.25)
  suma = w1 + w2 + w3
  si suma <= 0 → usar 0.40/0.35/0.25 (guard contra división por cero / todo en 0)
  score = calif*(w1/suma) + aceptacion*(w2/suma) + velocidad*(w3/suma)
  ```
- En `calcularVelocidadRespuesta(...)`, reemplazar la constante `TIEMPO_MAX_RESPUESTA_MIN`
  por `featureFlagService.getNumber("score_tiempo_max_respuesta_min", 30.0)`.
- Las lecturas pegan al cache en memoria del `FeatureFlagService` (no a la DB), así que
  llamarlas por proveedor durante el ranking no agrega costo relevante.

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Flag ausente / disabled / valor inválido | `getNumber` devuelve el default prod-safe (mismos valores de hoy) |
| Pesos del scoring suman 0 (o negativos) | guard → se usan los pesos por defecto (0.40/0.35/0.25); nunca se divide por cero |
| Comisión: el flag es un `double`, la comisión es `BigDecimal` | `BigDecimal.valueOf(double)` en el punto de lectura |

## 4. Testing

- **Backend (sin DB → CI):** unit test de `ProviderScoreService` con `TrabajoRepository` y
  `FeatureFlagService` mockeados:
  - Pesos por defecto (0.40/0.35/0.25, suman 1.0) → score = combinación esperada.
  - Pesos que **no** suman 1.0 (ej. 1/1/1) → score normalizado (cada uno cuenta 1/3).
  - Pesos en 0 → guard usa los defaults (no NaN/Infinity).
- Unit test de `getLimiteTrabajos` (oficio "Flete" → flag flete; otro → flag default),
  con `FeatureFlagService` mockeado.

## 5. Frontend

- **Ninguno.** Los 7 flags NUMBER aparecen automáticamente en el `FeatureFlagsPanel`
  (pestaña Configuración), cada uno con su input de valor y su descripción.

## 6. Notas de rollout

- Migración V5 aditiva (solo seed idempotente de flags), sin riesgo sobre datos.
- Tras deployar, borrar de Railway la env var `app.mudanza.comision-porcentaje` /
  `APP_MUDANZA_COMISION_PORCENTAJE` si estuviera seteada (ya no se lee). Documentar en el PR.
