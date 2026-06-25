# Diseño: Escalado automático de trabajos sin proveedor

**Fecha:** 2026-06-24
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

El matching de trabajos es **secuencial, uno a la vez**: al crear un trabajo,
`TrabajoService.notificarProveedorDisponible` elige al mejor proveedor por score y le
ofrece el trabajo (setea `proveedorNotificadoId` + `notificadoAt`). Si ese proveedor
**rechaza explícitamente**, el trabajo rota al siguiente. Pero si el proveedor
**ignora** la oferta (ni acepta ni rechaza), **no hay nada que lo mueva**: el trabajo
queda `PENDIENTE` para siempre. No existe ningún timeout, rotación automática ni
auto-cancelación (confirmado: el único `@Scheduled` del backend es el reload de feature
flags). Hoy solo el cliente puede cancelar su propio trabajo, a mano.

## Objetivos

1. **Timeout de oferta automático:** si el proveedor al que se le ofreció el trabajo no
   responde en `timeout1`, re-ofrecer al siguiente proveedor (1 reintento).
2. **Expiración automática:** si tras el reintento tampoco hay respuesta en `timeout2`,
   cancelar el trabajo y avisar al cliente.
3. **Umbrales tuneables en runtime** (feature flags), sin redeploy.

## No-objetivos (YAGNI)

- **Acciones manuales del admin** (re-notificar/cancelar desde el panel). Se evaluó y se
  eligió automatizar primero; el panel manual queda como posible feature futura (override).
- **Loop infinito de reintentos.** Son exactamente **2 ventanas de oferta** y luego cancela.
- **Broadcast a todos los proveedores.** Se mantiene el modelo de oferta secuencial por score.
- **Cambiar el flujo de rechazo manual.** Sigue funcionando aparte, sin tocar el contador.

## Política de escalado

Por cada trabajo `PENDIENTE`, con `ref = notificadoAt ?? createdAt`:

| Estado | Condición | Acción |
|---|---|---|
| `reintentos == 0` | `ref` más viejo que **timeout1** | Re-ofrecer al siguiente proveedor (excluyendo `proveedorNotificadoId`); `reintentos = 1`; **notificar al cliente** ("seguimos buscando") |
| `reintentos >= 1` | `ref` más viejo que **timeout2** | **Cancelar** (`CANCELADO`, motivo "No encontramos un profesional disponible") + **notificar al cliente** |
| en ventana | `ref` dentro del umbral | No hacer nada |

**Valores (defaults de los flags):**
- Ahora (testing): `timeout1 = 3` min, `timeout2 = 3` min.
- Launch (a setear desde el panel): `timeout1 = 30` min, `timeout2 = 15` min.

El reintento por **rechazo manual** sigue su flujo actual y **no** incrementa `reintentos`.

---

## 1. Modelo de datos

### Migración `V4__trabajo_reintentos_y_flags_escalado.sql`
```sql
ALTER TABLE trabajos ADD COLUMN reintentos INTEGER NOT NULL DEFAULT 0;

-- Flags de umbrales (NUMBER). Seed en valores de testing; en launch se suben a 30/15
-- desde el panel admin. Idempotente: no pisa cambios de runtime.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('trabajo_oferta_timeout1_min', true, '3', 'NUMBER',
   'Minutos de espera de la 1ª oferta antes de re-ofrecer al siguiente proveedor (launch: 30).'),
  ('trabajo_oferta_timeout2_min', true, '3', 'NUMBER',
   'Minutos de espera del reintento antes de cancelar el trabajo (launch: 15).')
ON CONFLICT (key) DO NOTHING;
```

### Entity `Trabajo`
- Agregar campo `private Integer reintentos = 0;` (mapea a la columna nueva).

### Enum `TipoNotificacion`
Agregar dos valores (el enum se persiste como STRING, sin constraint en DB):
- `TRABAJO_BUSCANDO_PROVEEDOR`
- `TRABAJO_CANCELADO_SIN_PROVEEDOR`

## 2. Backend (`com.aliados.backend`)

### Repository `TrabajoRepository`
- Agregar `List<Trabajo> findByEstado(TrabajoEstado estado);` (derivado de Spring Data).

### Service `TrabajoService`
- **Refactor DRY:** extraer el core de cancelación de `cancelarTrabajo` a un privado
  `aplicarCancelacion(Trabajo t, String motivo)` que: setea `CANCELADO`, limpia
  `proveedorNotificadoId`/`notificadoAt`, setea `motivoCancelacion`, guarda y borra fotos
  (`cloudinaryService.borrarFotos`). `cancelarTrabajo` (cliente) pasa a usarlo.
- **`public void escalarPendientes(int timeout1Min, int timeout2Min)`** (testeable):
  - `for (Trabajo t : trabajoRepository.findByEstado(PENDIENTE))`:
    - `ref = t.getNotificadoAt() != null ? t.getNotificadoAt() : t.getCreatedAt()`
    - `mins = ChronoUnit.MINUTES.between(ref, now)`
    - `reintentos = t.getReintentos() != null ? t.getReintentos() : 0`
    - Si `reintentos == 0 && mins >= timeout1Min`:
      - `t.setReintentos(1)`
      - `notificarProveedorDisponible(t, t.getProveedorNotificadoId())` (re-ofrece y guarda)
      - notificar al cliente (`TRABAJO_BUSCANDO_PROVEEDOR`, "Seguimos buscando un
        profesional para tu pedido de {oficio}.")
    - Si no, si `reintentos >= 1 && mins >= timeout2Min`:
      - `aplicarCancelacion(t, "No encontramos un profesional disponible")`
      - notificar al cliente (`TRABAJO_CANCELADO_SIN_PROVEEDOR`, "No encontramos un
        profesional disponible. Cancelamos tu pedido de {oficio}; podés volver a intentarlo.")
  - Notificaciones vía `notificacionService.enviarNotificacion(cliente.getFirebaseUid(),
    tipo, titulo, mensaje, t.getId(), actionUrl)` (in-app + push).
  - Cada iteración envuelta en try/catch + log: un trabajo que falle no corta el batch.

### Scheduler `service/TrabajoEscalationScheduler.java`
- `@Component` con `@Scheduled(fixedDelay = 60_000)` `escalar()`:
  - `int t1 = (int) featureFlagService.getNumber("trabajo_oferta_timeout1_min", 30);`
  - `int t2 = (int) featureFlagService.getNumber("trabajo_oferta_timeout2_min", 15);`
  - `trabajoService.escalarPendientes(t1, t2);`
  - (Los fallbacks `30`/`15` son los valores prod-safe por si el flag no existe.)
- `@EnableScheduling` ya está activo (lo habilitó la feature de flags).

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Un trabajo falla al escalar (notif/DB) | try/catch por iteración + log; no corta el resto del batch |
| `notificarProveedorDisponible` no encuentra proveedor | no actualiza `notificadoAt`; en la próxima ventana el trabajo expira (cae a cancelación) |
| Flag ausente | `getNumber` devuelve el fallback prod-safe (30/15) |
| Trabajo ya no está PENDIENTE (aceptado entre ticks) | la query `findByEstado(PENDIENTE)` ya lo excluye |

## 4. Testing

- **Backend (sin DB → corre en el CI):** unit test de `TrabajoService.escalarPendientes`
  con colaboradores mockeados (`@ExtendWith(MockitoExtension)` + `@InjectMocks TrabajoService`
  + `@Mock` `trabajoRepository`, `userRepository`, `notificacionService`, `cloudinaryService`,
  `providerScoreService`). Casos:
  - Ventana 1 vencida (`reintentos=0`, `notificadoAt` viejo) → setea `reintentos=1`, re-ofrece
    (verifica que se buscan proveedores excluyendo el actual) y notifica al cliente.
  - Ventana 2 vencida (`reintentos=1`, `notificadoAt` viejo) → cancela (`CANCELADO` + motivo)
    y notifica al cliente.
  - Dentro de la ventana → no hace nada (no re-ofrece, no cancela).
  - `createdAt` usado como `ref` cuando `notificadoAt` es null.
- El `TrabajoEscalationScheduler` es un wrapper trivial (lee flags + delega) → no necesita
  test propio; su lógica está cubierta por `escalarPendientes`.

## 5. Notas de rollout

- Seed de flags en **3/3** (testing). **Antes de lanzar**, subir `trabajo_oferta_timeout1_min`
  a `30` y `trabajo_oferta_timeout2_min` a `15` desde el panel admin. (Documentar en el PR;
  es el mismo patrón que el ratio de mudanza, pero ahora togglable sin redeploy.)
- La migración V4 es aditiva (columna con default + seed idempotente), sin riesgo sobre datos.
- El scheduler corre cada 60s: un timeout de 3 min se detecta con ≤1 min de slack (aceptable).
