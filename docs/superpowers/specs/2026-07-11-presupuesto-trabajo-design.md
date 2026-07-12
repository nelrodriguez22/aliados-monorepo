# Presupuesto post-visita + pago del trabajo

**Fecha:** 2026-07-11
**Estado:** aprobado (diseño validado en conversación)
**Alcance:** solo trabajos (no mudanzas).

## Problema

Hoy el ciclo de un trabajo es: el cliente pide → el proveedor **propone** (fija la tarifa
de visita, ~15k, estado `PROPUESTO`) → el cliente **acepta** → `EN_CURSO` (el proveedor
va) → el proveedor toca **"Marcar como completado"** (`EN_CURSO` → `COMPLETADO`) → el
cliente califica. No existe ningún paso de **presupuesto del trabajo** ni de **pago**: el
proveedor no puede cotizar el trabajo real tras revisar en el domicilio, y el cliente no
tiene forma de aceptar/rechazar ese presupuesto ni de pagar.

La tarifa de visita (hoy 15k) es lo que el cliente paga por la visita. Si el proveedor
cotiza el trabajo (p. ej. 100k) y el cliente lo acepta, ese total es lo que abona. Si el
cliente **no** acepta el presupuesto, abona solo la visita (15k) y el trabajo no se hace.

## Decisiones tomadas

1. **Solo trabajos.** Las mudanzas quedan igual (ya tienen su propio esquema de montos).
2. **Gate post-visita.** Se inserta un paso entre `EN_CURSO` y el cierre: estando
   `EN_CURSO` (el proveedor ya fue y revisó), en vez de "Marcar como completado", el
   proveedor **envía un presupuesto** del trabajo. Nuevo estado intermedio
   **`PRESUPUESTADO`**.
3. **Resumen prellenado editable, monto vacío.** La página de presupuesto viene con los
   datos del trabajo (oficio, descripción del pedido, tarifa de visita) y el proveedor
   carga el **monto del trabajo** (arranca **vacío**) y una **nota** de lo que haría.
4. **Bifurcación del monto según la respuesta del cliente:**
   - **Acepta** → se hace el trabajo; paga el **total presupuestado** (p. ej. 100k).
   - **Rechaza** → no se hace; paga **solo la tarifa de visita** (15k).
5. **Una sola decisión cierra el trabajo.** Aceptar o rechazar lleva el trabajo a
   `COMPLETADO`, libera al proveedor y avanza la cola (misma lógica que el `completar`
   actual). El proveedor queda ocupado durante `PRESUPUESTADO`.
6. **Pago como capa ortogonal, sin Mercado Pago.** El pago se modela con un `estadoPago`
   (`PENDIENTE_PAGO` → `PAGADO`). En esta iteración, "Aceptar y pagar" / "Rechazar" solo
   cierran el proceso (marcan `PAGADO` con el monto correspondiente); **no** se integra
   con Mercado Pago todavía.
7. **Calificación en ambas ramas.** Tras responder el presupuesto —acepte o rechace— se
   habilita la calificación. La reseña **no** depende de haber aceptado: el cliente puede
   querer puntuar bajo justamente por un presupuesto abultado aunque lo haya rechazado, y
   eso es información que necesitamos capturar.

## Diseño

### 1. Máquina de estados

`TrabajoEstado` suma **`PRESUPUESTADO`**:

```
EN_CURSO ── presupuestar ──▶ PRESUPUESTADO ── responder(aceptar) ──▶ COMPLETADO (paga montoPresupuesto)
                                           └─ responder(rechazar) ─▶ COMPLETADO (paga tarifaVisita)
```

El resto de la máquina (`PENDIENTE`, `PROPUESTO`, `EN_CURSO`, `EN_COLA`, `COMPLETADO`,
`CANCELADO`) no cambia. En ambas ramas el cierre reutiliza la lógica actual de
`completarTrabajo` (promover cola, `updateUserStatus`, notificaciones de completado).

### 2. Backend

**Entidad `Trabajo`** — campos nuevos (+ migración Flyway con columnas nuevas):

| Campo | Tipo | Semántica |
|-------|------|-----------|
| `montoPresupuesto` | `BigDecimal` (nullable) | Cotización del trabajo que carga el proveedor. |
| `notaResumen` | `String` (nullable) | Nota del proveedor sobre lo que haría. |
| `presupuestoAceptado` | `Boolean` (nullable) | Resultado de la decisión del cliente; null hasta responder. |
| `montoPagado` | `BigDecimal` (nullable) | Lo efectivamente abonado: `montoPresupuesto` si aceptó, `tarifaVisita` si rechazó. |
| `estadoPago` | enum `EstadoPago` (nullable) | `PENDIENTE_PAGO` al presupuestar, `PAGADO` al responder. |
| `pagadoAt` | `LocalDateTime` (nullable) | Momento del "pago" (respuesta del cliente). |

Enum nuevo **`EstadoPago { PENDIENTE_PAGO, PAGADO }`**.

**Endpoints nuevos** (mismos requisitos de seguridad que el resto de `/api/trabajos/**`):

- **`PATCH /api/trabajos/{id}/presupuestar`** — solo el **proveedor dueño**; requiere
  estado `EN_CURSO`. Body `PresupuestarTrabajoDTO { montoPresupuesto: BigDecimal (>0),
  notaResumen: String }`. Efecto: setea `montoPresupuesto` + `notaResumen`, estado →
  `PRESUPUESTADO`, `estadoPago = PENDIENTE_PAGO`. Notifica al cliente (nuevo
  `TipoNotificacion`, deep-link al detalle del trabajo).
- **`PATCH /api/trabajos/{id}/responder-presupuesto`** — solo el **cliente dueño**;
  requiere estado `PRESUPUESTADO`. Body `ResponderPresupuestoDTO { aceptar: boolean }`.
  Efecto: `presupuestoAceptado = aceptar`; `montoPagado = aceptar ? montoPresupuesto :
  tarifaVisita`; `estadoPago = PAGADO`; `pagadoAt = now`; estado → `COMPLETADO` y se
  ejecuta el cierre compartido (promover cola / `ONLINE` / reasignación / notificaciones
  de completado, extraído de `completarTrabajo`). Notifica al proveedor si el presupuesto
  fue aceptado o rechazado.

**Refactor mínimo:** extraer de `completarTrabajo` la lógica de cierre (promoción de cola,
estado del proveedor, notificaciones) a un método privado reutilizable
(`cerrarTrabajoCompletado(trabajo)`), para que `responder-presupuesto` no duplique. El
endpoint `PATCH /api/trabajos/{id}/completar` actual queda para compatibilidad, pero el
botón del proveedor deja de usarlo (ver §3); no se elimina en esta iteración.

`TrabajoResponseDTO` expone los 6 campos nuevos.

### 3. Frontend

**Proveedor:**
- Nueva página/ruta `/proveedor/presupuesto/:id`
  (`apps/app/src/features/provider/pages/PresupuestoTrabajo.tsx`): formulario con el
  contexto del trabajo (oficio, descripción del pedido, tarifa de visita en modo lectura),
  input de **monto** (arranca **vacío**, requerido, > 0), textarea de **nota**, y botón
  **"Enviar presupuesto"** → `PATCH /presupuestar`. Al éxito, vuelve al dashboard.
- En `ActiveJob`, el botón "Marcar como completado" se reemplaza por **"Enviar
  presupuesto"**, que navega a la ruta nueva (ya no llama a `/completar`).

**Cliente:**
- Cuando el trabajo está en `PRESUPUESTADO`, la vista de seguimiento
  (`JobTracking`, que ya redirige por estado) muestra una **pantalla de presupuesto**: el
  monto del trabajo, la nota del proveedor, y la aclaración de que la visita son
  `$tarifaVisita`. Dos acciones:
  - **"Aceptar y pagar $<montoPresupuesto>"** → `responder-presupuesto { aceptar: true }`.
  - **"Rechazar (pagás solo la visita $<tarifaVisita>)"** → `{ aceptar: false }`.
- Tras responder, el trabajo pasa a `COMPLETADO` y el cliente va a `JobCompleted`, que
  ya existe: en **ambos casos** se ofrece la **calificación** (comportamiento actual). El
  mensaje/contexto difiere según `presupuestoAceptado` (trabajo realizado vs solo visita),
  pero la reseña está disponible aunque haya rechazado el presupuesto.

### 4. Manejo de errores

- `presupuestar` sobre un trabajo que no está `EN_CURSO` → 400/estado inválido controlado.
- `responder-presupuesto` sobre un trabajo que no está `PRESUPUESTADO` → 400 controlado
  (cubre el doble-submit: si ya pasó a `COMPLETADO`, no-op idempotente en el front).
- No dueño (proveedor que presupuesta ajeno / cliente que responde ajeno) → 403.
- `montoPresupuesto ≤ 0` o vacío → validación en front (botón deshabilitado) y back
  (`@Positive` / validación en el DTO).
- Nota vacía → permitida (opcional), pero el monto es obligatorio.

### 5. Testing

- **Backend (JUnit):**
  - `presupuestar`: `EN_CURSO` → `PRESUPUESTADO`, setea `montoPresupuesto`/`notaResumen`/
    `estadoPago=PENDIENTE_PAGO`; rechaza estado inválido; 403 si no es el proveedor dueño;
    monto ≤ 0 → error.
  - `responder-presupuesto` **aceptar**: `PRESUPUESTADO` → `COMPLETADO`,
    `montoPagado == montoPresupuesto`, `estadoPago=PAGADO`, se promueve la cola / cambia el
    estado del proveedor (verificar reutilización del cierre compartido).
  - `responder-presupuesto` **rechazar**: `montoPagado == tarifaVisita`, cierre igual.
  - 403 si no es el cliente dueño; estado inválido → error; idempotencia del doble-submit.
- **Frontend (vitest, según patrón del repo):** los componentes se verifican visualmente
  (el repo no tiene infra de tests de render; ver specs previos). Tests de lógica pura si
  aplica (p. ej. formateo del monto).

### 6. Fuera de alcance

- **Integración real con Mercado Pago.** "Aceptar y pagar" / "Rechazar" solo cierran el
  proceso y marcan el `estadoPago`. La redirección/checkout de MP es una iteración futura.
- **Mudanzas.**
- **Renegociación / contraoferta** del presupuesto (el cliente solo acepta o rechaza).
- **Historial de transacciones / múltiples pagos.**
- **Eliminar** el endpoint `/completar` viejo (se deja por compatibilidad).
