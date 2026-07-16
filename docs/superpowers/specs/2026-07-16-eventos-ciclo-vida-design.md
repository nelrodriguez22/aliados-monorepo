# Eventos de ciclo de vida: `trabajo_evento` y `mudanza_evento`

**Fecha:** 2026-07-16
**Estado:** aprobado (diseño validado por secciones)

## Problema

La trazabilidad de `Trabajo` y `Mudanza` es "por snapshot": columnas de timestamps
(`acceptedAt`, `completedAt`, `pagadoAt`, …) que se pisan ante re-transiciones, y sin
registro de **quién** ejecutó cada cambio. Hoy es imposible distinguir una cancelación
del cliente de una cancelación automática del scheduler, o saber si un trabajo pasó
dos veces por `EN_CURSO`.

## Solución

Audit log append-only de transiciones de estado, con actor y motivo, en dos tablas
gemelas. Captura por **inserts explícitos** desde los services (enfoque elegido sobre
`@EntityListeners` y Envers: es el único que conoce al actor, y convive con el UPDATE
atómico de `proponerTrabajo` que bypassea JPA).

Consumo: diagnóstico interno (SQL directo) + endpoint admin de solo lectura.
Sin UI de panel ni timeline visible al usuario final en este lote.

## Esquema (migración `V12__eventos_ciclo_vida.sql`)

```sql
CREATE TABLE trabajo_evento (
    id             BIGSERIAL PRIMARY KEY,
    trabajo_id     BIGINT      NOT NULL REFERENCES trabajos(id),
    tipo           VARCHAR(30) NOT NULL,  -- CAMBIO_ESTADO | CAMBIO_ESTADO_PAGO
    valor_anterior VARCHAR(30),           -- NULL en la creación (∅ → PENDIENTE)
    valor_nuevo    VARCHAR(30) NOT NULL,
    actor_tipo     VARCHAR(20) NOT NULL,  -- CLIENTE | PROVEEDOR | SISTEMA | ADMIN
    actor_id       BIGINT REFERENCES users(id),  -- NULL cuando actor_tipo = SISTEMA
    detalle        VARCHAR(500),          -- motivo de cancelación, etc.
    created_at     TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX idx_trabajo_evento_trabajo_id ON trabajo_evento(trabajo_id);
```

`mudanza_evento` es idéntica con `mudanza_id REFERENCES mudanzas(id)`. Mudanza no
usa `CAMBIO_ESTADO_PAGO`: su flujo de pago extra pasa por estados propios
(`PENDIENTE_PAGO_EXTRA`), cubiertos por `CAMBIO_ESTADO`.

Decisiones:

- **Estados como VARCHAR, no enum de Postgres** — igual que el resto del esquema
  (`@Enumerated(EnumType.STRING)`); un estado nuevo no requiere `ALTER TYPE`.
- **Append-only** — sin `updated_at`; jamás UPDATE/DELETE sobre estas tablas.
- **Sin `ON DELETE CASCADE`** — si algún día se borran trabajos, la FK falla y
  obliga a decidir qué hacer con la historia.
- **Índice solo por `trabajo_id`** — única query prevista: timeline de una entidad.
  `ORDER BY id` da el orden cronológico.
- **`ADMIN` previsto en el enum** aunque hoy ningún flujo admin muta estados.

## Componentes

| Pieza | Contenido |
|---|---|
| `entity/TrabajoEvento.java` | Entidad JPA; solo `@CreationTimestamp`, inmutable post-creación |
| `entity/MudanzaEvento.java` | Ídem con FK a `Mudanza` |
| `entity/TipoEvento.java` | `CAMBIO_ESTADO`, `CAMBIO_ESTADO_PAGO` |
| `entity/ActorTipo.java` | `CLIENTE`, `PROVEEDOR`, `SISTEMA`, `ADMIN` |
| `repository/TrabajoEventoRepository.java` | `findByTrabajoIdOrderByIdAsc(Long)` |
| `repository/MudanzaEventoRepository.java` | Ídem |
| `service/EventoService.java` | `registrarTrabajo(...)`, `registrarMudanza(...)` + lecturas para el endpoint |
| `controller/EventoAdminController.java` | Los dos GET admin |
| `dto/EventoResponseDTO.java` | DTO compartido de ambos endpoints |

Firma de registro (misma forma para ambas entidades):

```java
public void registrarTrabajo(Trabajo trabajo, TipoEvento tipo,
                             String valorAnterior, String valorNuevo,
                             ActorTipo actorTipo, User actor, String detalle)
```

`EventoService.registrar*` **no deduce nada**: el caller captura `estadoAnterior`
antes del `setEstado` y pasa todo resuelto. Corre en la transacción del caller
(sin `@Transactional` propio).

## Puntos de inserción

### `TrabajoService` (8 métodos que registran; la tabla incluye un no-punto explícito)

| Método | Evento | Actor |
|---|---|---|
| `crearTrabajo` | ∅ → PENDIENTE | CLIENTE |
| `proponerTrabajo` | PENDIENTE → PROPUESTO, **después** del `tomarTrabajoSiPendiente` exitoso | PROVEEDOR |
| `aceptarPropuesta` | PROPUESTO → EN_CURSO ó EN_COLA | CLIENTE |
| `rechazarPropuesta` | PROPUESTO → PENDIENTE | CLIENTE |
| `presupuestarTrabajo` | EN_CURSO → PRESUPUESTADO | PROVEEDOR |
| `responderPresupuesto` | dos eventos: `CAMBIO_ESTADO_PAGO` (PENDIENTE_PAGO → PAGADO) y luego el cierre | CLIENTE |
| `cerrarTrabajoCompletado` | → COMPLETADO (actor lo pasa el caller como parámetro nuevo) y EN_COLA → EN_CURSO de la promoción de cola (SISTEMA) | según caller / SISTEMA |
| `cancelarTrabajo` / `escalarUnTrabajo` | → CANCELADO vía `aplicarCancelacion` (recibe actor); `detalle` = motivo | CLIENTE ó SISTEMA |
| `asignarTrabajosAProveedorQueSeConecta` | no muta estado → sin evento | — |

Cambios de firma internos: `cerrarTrabajoCompletado` y `aplicarCancelacion` reciben
el actor (mismo patrón con el que ya delegan las notificaciones al caller).

Caso carrera: en `proponerTrabajo` el evento se inserta solo si el flip atómico
ganó — el perdedor no registra nada.

### `MudanzaService` (11)

`crearMudanza`, `reservarMudanza`, `aceptarMudanza`, `contraproponer`,
`aceptarContrapropuesta`, `rechazarContrapropuesta`, `iniciarMudanza`,
`finalizarMudanza` (2 salidas: FINALIZADO ó PENDIENTE_PAGO_EXTRA), `pagarExtra`,
`completarMudanza`, `cancelarMudanza` (motivo en `detalle`).
Todos con actor CLIENTE o PROVEEDOR — Mudanza no tiene transiciones de sistema.

## Endpoint admin

```
GET /api/admin/trabajos/{id}/eventos
GET /api/admin/mudanzas/{id}/eventos
```

- Seguridad heredada: `/api/admin/**` → `hasRole("ADMIN")` en `SecurityConfig`.
- 404 (`NotFoundException`) si la entidad no existe.
- Sin paginación: ~5-15 eventos por entidad, lista completa `ORDER BY id ASC`.

`EventoResponseDTO`: `id`, `tipo`, `valorAnterior`, `valorNuevo`, `actorTipo`,
`actorNombre` (resuelto desde `User`; null si SISTEMA — nunca email/uid, sin PII),
`detalle`, `createdAt`. Mapeo dentro de `@Transactional(readOnly = true)` por las
asociaciones LAZY (mismo patrón que `TrabajoService`).

## Errores y transaccionalidad

- Evento en la **misma transacción** que la transición: rollback conjunto. Nunca un
  evento huérfano ni una transición sin rastro.
- `escalarUnTrabajo` (`REQUIRES_NEW`): el evento entra en esa transacción; si falla,
  rollbackea solo ese trabajo y el scheduler sigue.
- `EventoService` **no captura excepciones** (decisión validada): si el INSERT falla,
  la transición completa falla y Sentry lo reporta. El evento es parte de la
  transición, no telemetría best-effort — un audit log con huecos silenciosos vale
  menos que un error ruidoso en pre-launch.

## Testing

Integración con Testcontainers Postgres (TDD, como el resto del backend). Los asserts
de eventos se integran a los tests de servicio existentes, no como suites paralelas.

| Test | Verifica |
|---|---|
| Uno por método de transición (~9 + ~11) | `valor_anterior`, `valor_nuevo`, `actor_tipo`, `detalle` correctos |
| Cancelación cliente vs. escalación | Mismo estado final, distinto `actor_tipo` (CLIENTE vs SISTEMA) |
| `responderPresupuesto` | Dos eventos: `CAMBIO_ESTADO_PAGO` + `CAMBIO_ESTADO`, en ese orden |
| Carrera en `proponerTrabajo` | El perdedor del flip no inserta evento |
| Promoción de cola | EN_COLA → EN_CURSO con actor SISTEMA |
| Endpoint admin | 200 con timeline ordenado; 404 con id inexistente |
| Migración V12 | Implícito: Flyway + `ddl-auto=validate` rompen si esquema ≠ entidades |

## Fuera de alcance

- UI del panel de admin para el timeline (PR aparte si se quiere).
- Timeline visible a cliente/proveedor en la app.
- Eventos de oferta (grupo ofrecido / durmió): ya trazados por `trabajo_oferta`.
- Backfill de trabajos históricos: el log arranca vacío; los timestamps existentes
  siguen siendo la única traza de lo anterior.
