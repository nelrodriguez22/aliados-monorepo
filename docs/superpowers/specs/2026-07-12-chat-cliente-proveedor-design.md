# Chat cliente–proveedor

**Fecha:** 2026-07-12
**Estado:** aprobado (diseño validado en conversación)
**Alcance:** solo trabajos (no mudanzas).

## Problema

Hoy no existe ningún canal de comunicación dentro de la plataforma. Cliente y proveedor
coordinan por fuera (teléfono, WhatsApp) o directamente no coordinan: el cliente no puede
avisar que el portón está abierto, el proveedor no puede consultar una duda antes de
presupuestar, y no queda registro de nada de lo acordado.

Lo único que existe es una **maqueta muerta** en `JobTracking.tsx:416-446`: una `Card`
titulada "Chat con tu aliado" con el texto *"Disponible próximamente"* y un input y un
botón **deshabilitados**. No hay backend, no hay estado, no hay mock funcional. Del lado
del proveedor no existe ni siquiera la maqueta.

## Lo que ya está construido (y no hay que rehacer)

Esto es la mitad del valor del diseño: el transporte en tiempo real **ya está pago**,
construido para las notificaciones y el estado online.

- **`WebSocketConfig.java`** — STOMP sobre SockJS, endpoint `/ws`, broker con prefijos
  `/topic`, `/queue` y `/user`, `setUserDestinationPrefix("/user")`.
- **`WebSocketAuthInterceptor`** — autentica por el header `Authorization` del frame STOMP
  `CONNECT` (endurecido en SEC-6: el token nunca viaja por query param).
- **`UserStatusController`** + heartbeat — insumo de presencia ya disponible.
- **`NotificacionService`** + entity + event listener — push por FCM, empujando a
  `/user/queue/notifications`.
- **`useWebSocket.ts`** (frontend, 290 líneas) — cliente STOMP con reconexión y heartbeat.
- **Cloudinary** — `CloudinaryService`, `UploadController`, `uploadToCloudinary.ts`. El
  upload de imágenes se reutiliza tal cual.

Última migración Flyway aplicada: **`V9`**. La del chat será `V10`.

## Decisiones tomadas

1. **Persistente y consultable siempre, pero inmutable al cerrar.** El chat existe durante
   toda la vida del trabajo y sigue siendo legible después. Una vez que el trabajo llega a
   `COMPLETADO` o `CANCELADO`, **no se puede escribir más, ni editar, ni borrar**: queda
   como log/evidencia ante una disputa.

2. **Texto + imágenes, con `tipo` modelado desde el día uno.** El enum arranca con `TEXTO`
   e `IMAGEN`. Se modela `tipo` explícitamente para que agregar `SISTEMA` (mensajes
   automáticos del tipo "el proveedor envió un presupuesto de $X") sea después una
   migración trivial y no un rediseño. La ubicación queda **fuera de alcance**: es la que
   menos valor aporta por lo que cuesta.

3. **Badge de no leídos + push con regla de presencia.** Se notifica por push **sólo si el
   destinatario no tiene una sesión WebSocket activa**, con debounce por conversación. Una
   push por mensaje sería spam (una conversación de 15 mensajes = 15 vibraciones).

4. **Detección pasiva de datos de contacto, sin bloqueo.** Una regex marca los mensajes que
   contienen teléfonos o emails con un flag `contiene_contacto`. El mensaje **se guarda
   igual, sin censurar**. Esto da visibilidad sobre el bypass de comisión (fuga a WhatsApp)
   sin romper conversaciones legítimas, y sin contradecir la inmutabilidad del log: marcar
   y censurar son operaciones incompatibles — si enmascarás el contenido, perdés la
   evidencia.

5. **REST para escribir, WebSocket sólo para recibir.** El `POST` persiste el mensaje y el
   backend lo empuja por STOMP. El WebSocket es canal de **entrega**, no de **escritura**.
   Ver "Alternativas descartadas".

6. **`SimpleBroker` en memoria, con una sola instancia.** No se migra a broker externo.
   Ver "Riesgos conocidos".

## Modelo de datos

Migración **`V10__chat_mensajes.sql`**:

```sql
mensaje
  id                 BIGSERIAL PK
  trabajo_id         BIGINT NOT NULL FK → trabajo
  emisor_id          BIGINT NOT NULL FK → usuario
  tipo               VARCHAR NOT NULL   -- TEXTO | IMAGEN
  contenido          TEXT               -- el texto, o NULL si es IMAGEN
  imagen_url         VARCHAR            -- URL de Cloudinary, o NULL si es TEXTO
  contiene_contacto  BOOLEAN NOT NULL DEFAULT FALSE
  creado_at          TIMESTAMP NOT NULL

  INDEX (trabajo_id, id)   -- paginación e histórico

lectura_conversacion
  trabajo_id              BIGINT NOT NULL   ┐ PK compuesta
  usuario_id              BIGINT NOT NULL   ┘
  ultimo_mensaje_leido_id BIGINT
```

**La inmutabilidad se garantiza por ausencia de operaciones, no por un flag.** No hay
columnas de edición ni borrado lógico, y no se expone ningún endpoint que las permita. El
único `UPDATE` de todo el módulo es el del puntero de lectura.

**Puntero de lectura, no `leido_at` por mensaje.** Marcar 200 mensajes como leídos serían
200 `UPDATE`; mover un puntero es uno solo, y el contador de no leídos sale de un `COUNT`
con `id > puntero`. Con un chat 1-a-1 y log inmutable, el puntero es estrictamente mejor.

## Backend

### `ChatService`

`enviarMensaje(trabajoId, emisorId, dto)` — toda la sustancia del módulo está acá. Valida
**en este orden**:

1. El emisor es el cliente **o** el proveedor **de ese trabajo** → si no, **403**.
2. El estado del trabajo no es `COMPLETADO` ni `CANCELADO` → si no, **409** (log congelado).
3. El contenido es coherente con el `tipo` (`TEXTO` exige `contenido`; `IMAGEN` exige
   `imagen_url`).

Después corre la regex de contacto para setear `contiene_contacto`, **persiste**, y recién
entonces publica por STOMP.

**El orden importa: persistir primero, publicar después.** Al revés, un fallo de base de
datos posterior a la emisión por el socket le mostraría al destinatario un mensaje que no
existe — y en un log que es evidencia, un mensaje fantasma es peor que uno demorado.

Las otras tres operaciones son mecánicas:
- `listarMensajes(trabajoId, usuarioId, pageable)` — paginado, con la misma autorización.
- `marcarLeido(trabajoId, usuarioId, hastaMensajeId)` — mueve el puntero.
- `contarNoLeidos(trabajoId, usuarioId)` — `COUNT` con `id > puntero`.

### `ChatController`

Los endpoints cuelgan del trabajo, que es el recurso padre natural:

```
GET  /api/trabajos/{id}/mensajes?page=&size=
POST /api/trabajos/{id}/mensajes
POST /api/trabajos/{id}/mensajes/leidos
```

Esto no es cosmética: hace que la autorización sea *estructuralmente* la misma pregunta que
ya se responde en el resto de la app ("¿este usuario participa en este trabajo?"). Un
`/api/mensajes/{id}` suelto obligaría a reconstruir esa relación en cada endpoint, que es
justo donde nacen los IDOR.

### Tiempo real y push

Tras persistir, el servicio publica a **`/user/{destinatarioId}/queue/chat`** — el mismo
mecanismo de destino por usuario que ya usan las notificaciones. Inmediatamente después
consulta presencia: si el destinatario **no** tiene sesión WebSocket activa, delega en el
`NotificacionService` existente para disparar la push, con **debounce por conversación**.

La regla de presencia tiene dos condiciones de carrera, ambas benignas y aceptadas:
- El usuario se desconecta entre el chequeo y el envío → pierde la push, pero ve el badge
  al volver.
- El usuario se conecta en ese intervalo → recibe una push redundante.

Ninguna de las dos pierde el mensaje, porque el mensaje ya está en la base.

## Frontend

### Refactor de `useWebSocket` (primera tarea, la más delicada)

Hoy el hook abre la conexión y suscribe **a mano** a `/user/queue/notifications`
(línea 78). Hay que darle una API de suscripción genérica —`subscribe(destino, handler)`
que devuelva una función de desuscripción— preservando la reconexión y el heartbeat que ya
funcionan. Las notificaciones pasan a ser **un consumidor más** de esa API, no un caso
especial hardcodeado.

Va con sus propios tests: es infraestructura viva en producción, y si se rompe, se rompen
las notificaciones.

### `ChatPanel` (componente compartido)

Recibe `trabajoId` y un modo (escritura / sólo lectura). Resuelve:
- Historial paginado con scroll infinito hacia arriba.
- **Envío optimista**: el mensaje aparece en gris hasta que el `POST` confirma; se marca en
  rojo con opción de reintentar si falla. El rollback merece la misma seriedad que el
  éxito — si el usuario cree que mandó algo que nunca salió, en un log que es evidencia
  legal eso no es un detalle de UX.
- Subida de imagen reutilizando `uploadToCloudinary.ts`.
- Marcado de leídos cuando el panel está visible.

### Puntos de montaje

| Pantalla | Rol | Modo |
|---|---|---|
| `JobTracking.tsx` | Cliente | Escritura — **reemplaza el placeholder muerto (línea 416)** |
| `ActiveJob.tsx` | Proveedor | Escritura — **hay que crearlo, hoy no existe nada** |
| `JobCompleted.tsx` | Cliente | Sólo lectura |
| `ProviderCompletedJob.tsx` | Proveedor | Sólo lectura |

Más el **badge de no leídos** en `ClientDashboard` y `ProviderDashboard`, alimentado por
`contarNoLeidos`.

### Manejo de errores

Tres casos que la UI debe distinguir de verdad, no con un toast genérico:

- **Socket caído** → el chat **sigue funcionando** (el `POST` no depende del socket), pero
  no llegan mensajes en vivo. Aviso discreto de "reconectando" y refresco del historial al
  recuperar la conexión.
- **`409` al enviar** → el trabajo se cerró mientras el usuario escribía. Se deshabilita el
  input y **se explica por qué**. Es el caso que más va a confundir si se comunica mal.
- **Falla del upload** → error local, sin mensaje persistido. Reintento sin perder la imagen
  ya elegida.

## Testing

**Backend** (`ChatService`), cubriendo el terreno donde viven los bugs:
- Un tercero que intenta leer o escribir la conversación → **403**.
- Envío sobre trabajo `COMPLETADO` / `CANCELADO` → **409**.
- La regex marcando un teléfono **y no marcando** un monto: que un presupuesto de "$15000"
  no se confunda con un número de contacto es tan importante como detectar el teléfono.
- El puntero de lectura calculando bien el contador de no leídos.

**Frontend** (hook de chat):
- Recepción de un mensaje por socket.
- Envío optimista y **rollback** ante fallo.

## Alternativas descartadas

**Todo por STOMP (`@MessageMapping`).** Más "puro" en tiempo real, pero obliga a duplicar la
autorización dentro del canal de mensajería (el `WebSocketAuthInterceptor` autentica el
`CONNECT`, no autoriza cada mensaje contra el trabajo), y empeora el manejo de errores: sin
un HTTP 4xx hay que inventar un canal de error. Suma complejidad sin ganar nada
perceptible — la diferencia de latencia son milisegundos.

El enfoque elegido separa **durabilidad** de **latencia**: la base de datos es la fuente de
verdad y el WebSocket es un acelerador. Si el acelerador falla, el sistema degrada a
"recargá la página" en vez de perder datos — la propiedad que se quiere en algo declarado
evidencia legal. Además, escribir es una **acción del usuario** (tolera 200ms, necesita
confirmación explícita de éxito o error) mientras que recibir es un **evento del servidor**
(necesita ser instantáneo, no tiene a quién reportarle un error): cada dirección usa el
transporte que le queda cómodo.

**Polling sin WebSocket.** Sería tirar infraestructura ya construida y funcionando, y
contradice el trabajo explícito de reducción de polling redundante ya hecho en el frontend.

**Bloqueo activo de datos de contacto.** Fricción real (hay motivos legítimos para pasar un
número, como coordinar la entrada a un edificio), los usuarios evaden la regex en días
("cuatro-uno-uno-cinco…"), y contradice la inmutabilidad del log. La detección pasiva da
**datos** sobre si el problema existe antes de pagar el costo de UX de combatirlo.

## Riesgos conocidos

1. **`SimpleBroker` en memoria → el sistema sólo es correcto con UNA instancia.**
   `enableSimpleBroker` mantiene las suscripciones en el proceso. Con dos réplicas en
   Railway, un mensaje publicado en la instancia A **nunca llega** a un usuario conectado a
   la B, y el bug es intermitente y muy difícil de diagnosticar. Se asume conscientemente en
   pre-launch. **Escalar horizontalmente exige migrar antes a un broker externo (Redis /
   RabbitMQ), ~1-2 días más un servicio nuevo que operar.** El chat vuelve este riesgo
   mucho más peligroso de lo que era para las notificaciones.

2. **`useWebSocket` es infraestructura viva.** El refactor pone en riesgo las notificaciones
   existentes. Mitigación: tarea propia, con tests.

3. **Retención del log.** Si el chat es evidencia, los Términos y la política de Privacidad
   (publicados el 2026-07-12) deberían declarar cuánto tiempo se conservan los mensajes.
   Pendiente de revisar con el usuario.

## Estimación

**~13 tareas, 4 a 6 días de trabajo efectivo.**

| Bloque | Tareas |
|---|---|
| Backend | 5 — migración `V10`; entities `Mensaje`/`TipoMensaje`/`LecturaConversacion`; `ChatService`; `ChatController` + push STOMP; presencia + debounce |
| Frontend | 6 — refactor `useWebSocket`; `chatApi` en `packages/api`; `ChatPanel`; montaje en `JobTracking` + `ActiveJob`; badge de no leídos; vistas read-only |
| Cierre | 2 — security review (autorización/IDOR, XSS en el render, validación del upload) y verificación end-to-end en la app viva |

**La mitad del costo no está en el chat**, sino en el refactor del hook y en la UI del
proveedor, que hoy no existe.
