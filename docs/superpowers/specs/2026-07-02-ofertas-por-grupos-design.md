# Diseño — Ofertas por grupos + penalización de no-respuesta

> Fecha: 2026-07-02 · Estado: aprobado en brainstorming, pendiente de plan de implementación.

## Problema

Hoy un trabajo se ofrece **a un solo proveedor por vez** (el mejor por score, `Trabajo.proveedorNotificadoId`). El `TrabajoEscalationScheduler` re-ofrece al siguiente tras 30 min (1 reintento) y cancela a los +15 min → un solo re-ofrecimiento y hasta ~45 min de espera. Además, **dormir o rechazar una oferta no tiene costo en el score**: los 3 factores actuales se calculan sobre trabajos ya tomados, así que ignorar ofertas que no convienen no baja el ranking (incentivo perverso al cherry-picking).

## Objetivo

1. Ofrecer cada trabajo a un **grupo de 10 proveedores** por score a la vez.
2. Si en **5 min** ninguno del grupo propone, pasar al **grupo siguiente** (próximos 10), y así hasta **agotar** los proveedores disponibles del oficio; recién ahí cancelar.
3. Dentro del grupo, **carrera**: el primero que propone se lo queda; el cliente sigue viendo **una** propuesta.
4. **Penalizar la no-respuesta** con un factor de score nuevo, de peso **configurable desde el panel admin**.

## Decisiones tomadas (brainstorming)

- **Toma dentro del grupo:** carrera, el primero que propone gana (lock atómico). El cliente ve una sola propuesta.
- **Corte:** escalar grupo tras grupo hasta agotar proveedores disponibles; ahí cancelar + avisar al cliente.
- **Penalización:** sí, incluida; con peso configurable en admin (default "media" = 0.20).
- **Qué cuenta como "durmió" (estricto):** cualquiera ofertado que no propuso y el trabajo se resolvió/avanzó sin su propuesta cuenta `DURMIO` (ataca el cherry-picking, aunque castigue al que "casi" gana la carrera).
- **Rechazo del cliente:** reabrir al resto del grupo actual (excluye al rechazado y a quien ya propuso), re-notificar, timer de 5 min nuevo; si no queda nadie en el grupo → grupo siguiente.

## Modelo de datos

### Nueva tabla `trabajo_oferta`
Reemplaza a `Trabajo.proveedorNotificadoId`/`notificadoAt` y es a la vez el historial para el score.

| columna | tipo | notas |
|---|---|---|
| `id` | bigserial PK | |
| `trabajo_id` | FK → trabajo | |
| `proveedor_id` | FK → users | |
| `grupo` | int | nº de grupo (1, 2, 3…) |
| `ofrecido_at` | timestamp | inicio de la ventana de 5 min de su grupo |
| `respondio_at` | timestamp null | se setea cuando propone |
| `resultado` | enum | `OFRECIDA` · `PROPUSO` · `DURMIO` |

- **Unicidad:** una fila por `(trabajo_id, proveedor_id)` — nadie recibe el mismo trabajo dos veces ni acumula dos `DURMIO`.
- **Índices:** `(trabajo_id)`, `(proveedor_id, resultado)` (para los counts del score), y para la vista del proveedor un filtro por `resultado='OFRECIDA'`.
- **Enum `ResultadoOferta`:** `OFRECIDA` (viva, sin desenlace), `PROPUSO` (respondió), `DURMIO` (ofertado y el trabajo se fue sin su propuesta).

### Cambios en `Trabajo`
- **Se quitan** `proveedorNotificadoId` y `notificadoAt` (migrados a `trabajo_oferta`).
- `proveedor` (el que finalmente propone) se mantiene.
- **Sin `@Version`:** la carrera se resuelve con un UPDATE condicional atómico sobre `estado` (ver Concurrencia), que no requiere columna de versión.

### Migración Flyway (`V7__ofertas_por_grupos.sql`)
- Crear `trabajo_oferta` + enum + índices.
- **Backfill:** por cada `Trabajo` PENDIENTE con `proveedor_notificado_id` no nulo → insertar una fila `OFRECIDA` (grupo 1, `ofrecido_at = notificado_at`).
- Drop de `proveedor_notificado_id` y `notificado_at` (tras el backfill).

## Mecánica de escalada (scheduler existente, tick 60s)

Reusa `TrabajoEscalationScheduler` (60s) → `escalarUnTrabajo` reescrito.

**Alta del trabajo** (`crearTrabajo`): calcular ranking por score de `findProveedoresDisponibles` y ofrecer el **grupo 1 (top N)**: N filas `OFRECIDA` + push a los N. `notificarProveedorDisponible` pasa a "ofrecer al siguiente grupo".

**Cada tick, por trabajo PENDIENTE:**
1. Si `now - ofrecido_at(grupo actual) ≥ intervalo (5 min)` y nadie propuso:
   - Marcar las filas `OFRECIDA` del grupo actual como `DURMIO`.
   - Buscar el **grupo siguiente**: próximos N por score de `findProveedoresDisponibles`, **excluyendo** proveedores ya ofertados (join anti `trabajo_oferta`).
   - Si hay → insertar filas `OFRECIDA` (grupo+1) + push.
   - Si no hay → **CANCELAR** trabajo + notificar cliente.

**Config (feature flags, seed en la V7 o V-migration de flags):**
- `trabajo_oferta_grupo_tamano` = 10
- `trabajo_oferta_grupo_intervalo_min` = 5
- `trabajo_oferta_timeout1_min` / `timeout2_min`: **deprecados** (quedan sin uso).

## Toma del trabajo y concurrencia (la carrera)

`proponerTrabajo` cambia:
- **Guard nuevo:** existe fila `trabajo_oferta` con `resultado='OFRECIDA'` para el proveedor en ese trabajo (reemplaza `proveedorNotificadoId == me`).
- **Lock atómico** (reemplaza el read-then-write `estado==PENDIENTE`):
  ```sql
  UPDATE trabajo SET estado='PROPUESTO', proveedor_id=:me, propuesto_at=now, ...
   WHERE id=:trabajoId AND estado='PENDIENTE'
  ```
  - 1 fila afectada → ganó: su `trabajo_oferta` → `PROPUSO` + `respondio_at`; notificar cliente.
  - 0 filas → alguien ganó primero → `409 "El trabajo ya no está disponible"`.
- Mientras el trabajo esté `PROPUESTO`, el resto del grupo no puede proponer (guard exige `PENDIENTE`); sus filas siguen `OFRECIDA`.

## Rechazo del cliente y finalización de `DURMIO`

**`rechazarPropuesta`:** trabajo → `PENDIENTE`; la fila del rechazado → `DURMIO` (queda fuera de este trabajo); re-ofrecer al **resto del grupo actual** (filas `OFRECIDA` restantes), re-notificar, resetear `ofrecido_at`. Si no quedan `OFRECIDA` en el grupo → avanzar al grupo siguiente (misma lógica del scheduler).

**Finalización de `DURMIO`** (criterio estricto): una fila `OFRECIDA` pasa a `DURMIO` cuando el trabajo se va de su grupo sin su propuesta:
- al avanzar al grupo siguiente (durmió la ventana),
- al **cancelarse** el trabajo,
- cuando el cliente **acepta** la propuesta de otro (`aceptarPropuesta`): las `OFRECIDA` restantes del trabajo → `DURMIO`.

Mientras el trabajo pueda volver a estar disponible (propuesta pendiente de aceptación/rechazo), las filas del grupo siguen `OFRECIDA` (no se finalizan aún).

## Factor de score nuevo

`ProviderScoreService` suma un 4º factor:
```
tasaRespuestaOfertas = PROPUSO / (PROPUSO + DURMIO) × 100        (neutral 50 si no hay datos)
```
- `combinarScore` pasa a 4 pesos, normalizando por la suma (los actuales no cambian de valor):
  - `score_peso_calificacion` 0.40 · `score_peso_aceptacion` 0.35 · `score_peso_velocidad` 0.25 · **`score_peso_respuesta_ofertas` 0.20** (nuevo).
- Counts nuevos en `TrabajoOfertaRepository`: `countByProveedorAndResultado(PROPUSO|DURMIO)`.
- **Velocidad:** hoy `getPromedioTiempoRespuestaMinutosByProveedorId` usa `trabajo.notificadoAt→propuestoAt`; al quitarse esas columnas, se recalcula sobre `trabajo_oferta.ofrecido_at → respondio_at`.

## Panel admin

El nuevo `score_peso_respuesta_ofertas` y los flags `trabajo_oferta_grupo_*` son feature flags → aparecen en `FeatureFlagsPanel.tsx` (mismo patrón que los `score_peso_*` seedeados en `V5__config_flags_operativa.sql`), gestionados por `FeatureFlagAdminController`, ajustables sin deploy.

## Vista del proveedor

`getTrabajosPendientes`: en vez de `findByEstadoAndOficioIdAndProveedorNotificadoId`, filtrar por trabajos `PENDIENTE` del oficio con fila `trabajo_oferta` `OFRECIDA` para ese proveedor.

## Touchpoints / riesgos

- **`asignarTrabajosAProveedorQueSeConecta`** (proveedor que se conecta): hoy le asigna pendientes directo. Reconciliar con el modelo de grupos → un proveedor recién online entra naturalmente al próximo grupo del scheduler; revisar/simplificar esta ruta para que no asigne por fuera de las ofertas.
- **`rechazarTrabajo`** (proveedor rechaza, distinto de rechazo del cliente): hoy excluye a quien rechaza. Con `trabajo_oferta`, marcar su fila `DURMIO`/rechazo y seguir con el grupo.
- **Backfill** de trabajos PENDIENTE en vuelo al momento del deploy.
- **Notificaciones**: hoy se notifica de a uno; ahora N push por grupo (volumen mayor pero acotado por el tamaño de grupo).

## Testing (TDD)

- Escalada: grupo duerme 5 min → avanza al siguiente; sin más proveedores → cancela + notifica.
- Carrera: dos `proponerTrabajo` concurrentes → uno gana (1 fila), el otro 409.
- `DURMIO` estricto: ganador aceptado → resto del grupo `DURMIO`; grupo que duerme → todos `DURMIO`.
- Rechazo del cliente: reabre al resto del grupo, resetea timer; grupo vacío → avanza.
- Score: `tasaRespuestaOfertas` = PROPUSO/(PROPUSO+DURMIO); neutral 50 sin datos; `combinarScore` con 4 pesos normaliza bien.
- Backfill de la migración.
