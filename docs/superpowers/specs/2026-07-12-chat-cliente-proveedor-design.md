# Chat cliente–proveedor

**Fecha:** 2026-07-12
**Estado:** aprobado (diseño validado en conversación)
**Alcance:** trabajos **y** mudanzas.

## Problema

Hoy no existe ningún canal de comunicación dentro de la plataforma. Cliente y proveedor
coordinan por fuera (teléfono, WhatsApp) o directamente no coordinan: el cliente no puede
avisar que el portón está abierto, el proveedor no puede consultar una duda antes de
presupuestar, y no queda registro de nada de lo acordado.

Lo único que existe es una **maqueta muerta** en `JobTracking.tsx:416-446`: una `Card`
titulada "Chat con tu aliado" con el texto *"Disponible próximamente"* y un input y un
botón **deshabilitados**. No hay backend, no hay estado, no hay mock funcional. Del lado
del proveedor no existe ni siquiera la maqueta, ni en trabajos ni en mudanzas.

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

1. **Cubre trabajos y mudanzas.** Ambas entidades tienen la misma forma para lo que importa:
   `cliente_id` y `proveedor_id` como FK a `User`, y estados terminales que se llaman igual
   (`COMPLETADO`, `CANCELADO`). Pero **son entidades separadas**, no hay herencia entre
   ellas — de ahí el modelo polimórfico de la sección siguiente.

2. **Persistente y consultable siempre, pero inmutable al cerrar.** El chat vive mientras el
   servicio está abierto y sigue siendo legible después. Al llegar a `COMPLETADO` o
   `CANCELADO` **no se puede escribir más, ni editar, ni borrar**: queda como log/evidencia
   ante una disputa.

3. **La conversación se crea cuando el cliente acepta**, no cuando pide el servicio. Antes de
   eso no hay contraparte con quien hablar, así que no existe la fila. Un servicio cancelado
   sin haber sido aceptado nunca **no tiene conversación** — no se inventa un log vacío.

4. **El chat de mudanza NO cubre la contrapropuesta.** Esa negociación la resuelve la feature
   de contrapropuesta (`CONTRAPROPUESTO`). Mantenerlo así evita darle al proveedor un canal
   libre *antes* de que el cliente se comprometa, que es donde más incentivo hay de arreglar
   por afuera de la plataforma.

5. **Texto + imágenes, con `tipo` modelado desde el día uno.** El enum arranca con `TEXTO` e
   `IMAGEN`. Se modela `tipo` explícitamente para que agregar `SISTEMA` (mensajes automáticos
   del tipo "el proveedor envió un presupuesto de $X") sea después una migración trivial y no
   un rediseño. La ubicación queda **fuera de alcance**.

6. **Badge de no leídos + push con regla de presencia.** Se notifica por push **sólo si el
   destinatario no tiene una sesión WebSocket activa**, con debounce por conversación. Una
   push por mensaje sería spam (una conversación de 15 mensajes = 15 vibraciones).

7. **Detección pasiva de datos de contacto, sin bloqueo.** Una regex marca los mensajes que
   contienen teléfonos o emails con un flag `contiene_contacto`. El mensaje **se guarda igual,
   sin censurar**. Da visibilidad sobre el bypass de comisión (fuga a WhatsApp) sin romper
   conversaciones legítimas, y sin contradecir la inmutabilidad: marcar y censurar son
   operaciones incompatibles — si enmascarás el contenido, perdés la evidencia.

8. **REST para escribir, WebSocket sólo para recibir.** El `POST` persiste el mensaje y el
   backend lo empuja por STOMP. El WebSocket es canal de **entrega**, no de **escritura**.
   Ver "Alternativas descartadas".

9. **`SimpleBroker` en memoria, con una sola instancia.** No se migra a broker externo.
   Ver "Riesgos conocidos".

## Ventana de escritura

El estado del chat es **ternario**, no binario. Modelarlo con un booleano fuerza a inventar
un cuarto caso implícito, y ahí nace el bug de mostrar un chat vacío en un servicio que
todavía no tiene proveedor con quien hablar.

| | Sin conversación (no existe) | Escritura | Sólo lectura |
|---|---|---|---|
| **Trabajo** | `PENDIENTE`, `PROPUESTO` | `EN_CURSO`, `EN_COLA`, `PRESUPUESTADO` | `COMPLETADO`, `CANCELADO` |
| **Mudanza** | `PENDIENTE`, `RESERVADO`, `CONTRAPROPUESTO` | `ACEPTADO`, `EN_CURSO`, `FINALIZADO`, `PENDIENTE_PAGO_EXTRA` | `COMPLETADO`, `CANCELADO` |

La regla unificada: **el chat se abre cuando el cliente aceptó** (que es cuando el vínculo
cliente-proveedor queda confirmado) y se congela cuando el servicio cierra.

Dos casos que es fácil equivocar, y que son deliberados:

- **`EN_COLA` TIENE chat.** En `TrabajoService.java:738-746`, cuando el cliente acepta, el
  trabajo queda `EN_CURSO` **o** `EN_COLA` según el proveedor esté libre u ocupado. `EN_COLA`
  significa "el cliente ya aceptó, espera turno". Es **el momento de mayor ansiedad del
  cliente**: justo cuando quiere preguntar "¿cuándo venís?". El placeholder actual
  (`JobTracking.tsx:417`, condición `enCurso && proveedorNombre`) lo dejaría afuera — se
  escribió antes de que existiera `EN_COLA`. **No replicar esa condición.**

- **`FINALIZADO` y `PENDIENTE_PAGO_EXTRA` (mudanza) TIENEN chat.** La mudanza ya terminó
  físicamente, pero si hay un pago extra en discusión, cerrar el chat ahí sería cerrarlo
  justo cuando más se necesita.

## Modelo de datos

`Mudanza` es una entidad separada de `Trabajo`, no una subclase. Un `mensaje.trabajo_id` no
sirve: aparece el problema de la **asociación polimórfica** (un mensaje que puede colgar de
dos padres distintos).

Se resuelve con una tabla **`conversacion` de primera clase**, que **confina el polimorfismo
a una sola tabla**: `mensaje` y `lectura_conversacion` nunca se enteran de que existen
trabajos y mudanzas — sólo conocen `conversacion_id`.

Migración **`V10__chat_conversaciones.sql`**:

```sql
conversacion
  id            BIGSERIAL PK
  trabajo_id    BIGINT FK → trabajo   NULL   ┐ CHECK: exactamente uno
  mudanza_id    BIGINT FK → mudanza   NULL   ┘ de los dos seteado
  cliente_id    BIGINT NOT NULL FK → usuario
  proveedor_id  BIGINT NOT NULL FK → usuario
  creado_at     TIMESTAMP NOT NULL

  UNIQUE (trabajo_id), UNIQUE (mudanza_id)   -- una conversación por servicio

mensaje
  id                 BIGSERIAL PK
  conversacion_id    BIGINT NOT NULL FK → conversacion   -- un único FK, sin ramas
  emisor_id          BIGINT NOT NULL FK → usuario
  tipo               VARCHAR NOT NULL   -- TEXTO | IMAGEN
  contenido          TEXT               -- el texto, o NULL si es IMAGEN
  imagen_url         VARCHAR            -- URL de Cloudinary, o NULL si es TEXTO
  contiene_contacto  BOOLEAN NOT NULL DEFAULT FALSE
  creado_at          TIMESTAMP NOT NULL

  INDEX (conversacion_id, id)   -- paginación e histórico

lectura_conversacion
  conversacion_id         BIGINT NOT NULL   ┐ PK compuesta
  usuario_id              BIGINT NOT NULL   ┘
  ultimo_mensaje_leido_id BIGINT
```

**Por qué `conversacion` y no columnas nullable en `mensaje`:** la ganancia grande está en la
**autorización**. Al denormalizar `cliente_id` y `proveedor_id` en `conversacion`, la pregunta
"¿este usuario puede leer esto?" se responde con **una sola fila**, sin joins a `trabajo` ni a
`mudanza`. El `ChatService` deja de saber qué es un trabajo, y como el chequeo de permisos es
idéntico para ambos verticales, **desaparece la rama donde se cuelan los IDOR**.

Denormalizar esos dos IDs es seguro precisamente porque **son inmutables**: una vez asignado
el proveedor, el par cliente-proveedor de esa conversación no cambia nunca. Denormalizar datos
mutables es deuda; denormalizar datos congelados es sólo una copia.

Cuando mañana se agregue un tercer tipo de servicio, es **una columna nullable en
`conversacion`** y nada más.

**La inmutabilidad se garantiza por ausencia de operaciones, no por un flag.** No hay columnas
de edición ni borrado lógico, y no se expone ningún endpoint que las permita. El único
`UPDATE` de todo el módulo es el del puntero de lectura.

**Puntero de lectura, no `leido_at` por mensaje.** Marcar 200 mensajes como leídos serían 200
`UPDATE`; mover un puntero es uno solo, y el contador de no leídos sale de un `COUNT` con
`id > puntero`. Con un chat 1-a-1 y log inmutable, el puntero es estrictamente mejor.

## Backend

### `ConversacionResolver`

Lo **único** que necesita ramificar entre trabajo y mudanza. Dada una conversación, mira el
`estado` del padre y devuelve el modo: `ESCRITURA` | `LECTURA`. Vive en un único lugar, no
esparcido por el servicio. Como ambos enums usan `COMPLETADO`/`CANCELADO`, la rama es mínima.

También expone `getOrCreate(servicio)`, invocado desde `TrabajoService` y `MudanzaService` en
el momento de la aceptación del cliente.

### `ChatService`

`enviarMensaje(conversacionId, emisorId, dto)` — toda la sustancia del módulo. Valida
**en este orden**:

1. El emisor es el `cliente_id` **o** el `proveedor_id` de esa conversación → si no, **403**.
   (Una sola fila, sin joins.)
2. El `ConversacionResolver` devuelve `ESCRITURA` → si no, **409** (log congelado).
3. El contenido es coherente con el `tipo` (`TEXTO` exige `contenido`; `IMAGEN` exige
   `imagen_url`).

Después corre la regex de contacto para setear `contiene_contacto`, **persiste**, y recién
entonces publica por STOMP.

**El orden importa: persistir primero, publicar después.** Al revés, un fallo de base de datos
posterior a la emisión por el socket le mostraría al destinatario un mensaje que no existe — y
en un log que es evidencia, un mensaje fantasma es peor que uno demorado.

Las otras tres operaciones son mecánicas:
- `listarMensajes(conversacionId, usuarioId, pageable)` — paginado, misma autorización.
- `marcarLeido(conversacionId, usuarioId, hastaMensajeId)` — mueve el puntero.
- `contarNoLeidos(conversacionId, usuarioId)` — `COUNT` con `id > puntero`.

### `ChatController`

Los endpoints cuelgan de la conversación, que ya es un recurso propio con su autorización
autocontenida:

```
GET  /api/conversaciones/{id}/mensajes?page=&size=
POST /api/conversaciones/{id}/mensajes
POST /api/conversaciones/{id}/mensajes/leidos
```

Para que el frontend encuentre la conversación desde la pantalla del servicio, el `id` de la
conversación viaja en los DTO que ya existen (`TrabajoDTO`, `MudanzaDTO`) como
`conversacionId` nullable. Si es `null`, no hay chat todavía y la UI no lo muestra.

### Tiempo real y push

Tras persistir, el servicio publica a **`/user/{destinatarioId}/queue/chat`** — el mismo
mecanismo de destino por usuario que ya usan las notificaciones. Inmediatamente después
consulta presencia: si el destinatario **no** tiene sesión WebSocket activa, delega en el
`NotificacionService` existente para disparar la push, con **debounce por conversación**.

La regla de presencia tiene dos condiciones de carrera, ambas benignas y aceptadas:
- El usuario se desconecta entre el chequeo y el envío → pierde la push, pero ve el badge al
  volver.
- El usuario se conecta en ese intervalo → recibe una push redundante.

Ninguna de las dos pierde el mensaje, porque el mensaje ya está en la base.

## Frontend

### Refactor de `useWebSocket` (primera tarea, la más delicada)

Hoy el hook abre la conexión y suscribe **a mano** a `/user/queue/notifications` (línea 78).
Hay que darle una API de suscripción genérica —`subscribe(destino, handler)` que devuelva una
función de desuscripción— preservando la reconexión y el heartbeat que ya funcionan. Las
notificaciones pasan a ser **un consumidor más** de esa API, no un caso especial hardcodeado.

Va con sus propios tests: es infraestructura viva en producción, y si se rompe, se rompen las
notificaciones.

### `ChatPanel` (componente compartido)

Recibe `conversacionId` y un modo (escritura / sólo lectura). **Es agnóstico de trabajo vs
mudanza** — esa es la razón de ser del modelo de `conversacion`. Resuelve:

- Historial paginado con scroll infinito hacia arriba.
- **Envío optimista**: el mensaje aparece en gris hasta que el `POST` confirma; se marca en
  rojo con opción de reintentar si falla. El rollback merece la misma seriedad que el éxito —
  si el usuario cree que mandó algo que nunca salió, en un log que es evidencia legal eso no
  es un detalle de UX.
- Subida de imagen reutilizando `uploadToCloudinary.ts`.
- Marcado de leídos cuando el panel está visible.

### Puntos de montaje (6)

| Pantalla | Vertical | Rol | Nota |
|---|---|---|---|
| `JobTracking.tsx` | Trabajo | Cliente | **Reemplaza el placeholder muerto (línea 416)** |
| `ActiveJob.tsx` | Trabajo | Proveedor | **Hay que crearlo, hoy no existe nada** |
| `JobCompleted.tsx` | Trabajo | Cliente | Sólo lectura |
| `ProviderCompletedJob.tsx` | Trabajo | Proveedor | Sólo lectura |
| `MudanzaDetail.tsx` | Mudanza | Cliente | El modo sale del estado de la mudanza |
| `ProviderMudanzaDetail.tsx` | Mudanza | Proveedor | El modo sale del estado de la mudanza |

En las pantallas de mudanza, una sola página cubre escritura y lectura: el modo lo determina
el estado, según la tabla de la ventana de escritura.

Más el **badge de no leídos** en `ClientDashboard` y `ProviderDashboard`, alimentado por
`contarNoLeidos`, cubriendo trabajos y mudanzas.

### Manejo de errores

Tres casos que la UI debe distinguir de verdad, no con un toast genérico:

- **Socket caído** → el chat **sigue funcionando** (el `POST` no depende del socket), pero no
  llegan mensajes en vivo. Aviso discreto de "reconectando" y refresco del historial al
  recuperar la conexión.
- **`409` al enviar** → el servicio se cerró mientras el usuario escribía. Se deshabilita el
  input y **se explica por qué**. Es el caso que más va a confundir si se comunica mal.
- **Falla del upload** → error local, sin mensaje persistido. Reintento sin perder la imagen ya
  elegida.

## Testing

**Backend** (`ChatService` + `ConversacionResolver`), cubriendo el terreno donde viven los bugs:

- Un tercero que intenta leer o escribir la conversación → **403**.
- Envío sobre servicio `COMPLETADO` / `CANCELADO` → **409**, en **ambos verticales**.
- **`EN_COLA` (trabajo) permite escribir** — es el caso que el placeholder actual se perdía.
- **`FINALIZADO` y `PENDIENTE_PAGO_EXTRA` (mudanza) permiten escribir.**
- **`CONTRAPROPUESTO` (mudanza) no tiene conversación.**
- El `CHECK` de exactamente-un-padre rechaza una conversación con ambos IDs o con ninguno.
- La regex marcando un teléfono **y no marcando** un monto: que un presupuesto de "$15000" no
  se confunda con un número de contacto es tan importante como detectar el teléfono.
- El puntero de lectura calculando bien el contador de no leídos.

**Frontend** (hook de chat):
- Recepción de un mensaje por socket.
- Envío optimista y **rollback** ante fallo.

## Alternativas descartadas

**Columnas nullable (`trabajo_id`, `mudanza_id`) directamente en `mensaje`.** Conserva las FK
reales, pero el polimorfismo **se filtra a todas las tablas**: `lectura_conversacion` también
necesitaría las dos columnas, y cada consulta arrancaría con un `if`. Confinarlo a
`conversacion` es estrictamente mejor.

**Polimorfismo genérico (`tipo_entidad VARCHAR` + `entidad_id BIGINT`).** El patrón de Rails.
Descartado: **no permite FK**, así que la base deja de garantizar integridad referencial y se
pueden quedar mensajes huérfanos apuntando a un servicio borrado. En un log declarado evidencia
legal, renunciar a la integridad referencial es exactamente lo que no se quiere.

**Todo por STOMP (`@MessageMapping`).** Más "puro" en tiempo real, pero obliga a duplicar la
autorización dentro del canal de mensajería (el `WebSocketAuthInterceptor` autentica el
`CONNECT`, no autoriza cada mensaje contra el servicio), y empeora el manejo de errores: sin un
HTTP 4xx hay que inventar un canal de error. Suma complejidad sin ganar nada perceptible — la
diferencia de latencia son milisegundos.

El enfoque elegido separa **durabilidad** de **latencia**: la base de datos es la fuente de
verdad y el WebSocket es un acelerador. Si el acelerador falla, el sistema degrada a "recargá
la página" en vez de perder datos — la propiedad que se quiere en algo declarado evidencia
legal. Además, escribir es una **acción del usuario** (tolera 200ms, necesita confirmación
explícita de éxito o error) mientras que recibir es un **evento del servidor** (debe ser
instantáneo, no tiene a quién reportarle un error): cada dirección usa el transporte que le
queda cómodo.

**Polling sin WebSocket.** Sería tirar infraestructura ya construida y funcionando, y contradice
el trabajo explícito de reducción de polling redundante ya hecho en el frontend.

**Bloqueo activo de datos de contacto.** Fricción real (hay motivos legítimos para pasar un
número, como coordinar la entrada a un edificio), los usuarios evaden la regex en días
("cuatro-uno-uno-cinco…"), y contradice la inmutabilidad del log. La detección pasiva da
**datos** sobre si el problema existe antes de pagar el costo de UX de combatirlo.

**Chat durante la contrapropuesta de mudanza.** Descartado por decisión de producto: esa
negociación ya la cubre la feature de contrapropuesta.

## Riesgos conocidos

1. **`SimpleBroker` en memoria → el sistema sólo es correcto con UNA instancia.**
   `enableSimpleBroker` mantiene las suscripciones en el proceso. Con dos réplicas en Railway,
   un mensaje publicado en la instancia A **nunca llega** a un usuario conectado a la B, y el
   bug es intermitente y muy difícil de diagnosticar. Se asume conscientemente en pre-launch.
   **Escalar horizontalmente exige migrar antes a un broker externo (Redis / RabbitMQ), ~1-2
   días más un servicio nuevo que operar.** El chat vuelve este riesgo mucho más peligroso de
   lo que era para las notificaciones.

2. **`useWebSocket` es infraestructura viva.** El refactor pone en riesgo las notificaciones
   existentes. Mitigación: tarea propia, con tests.

3. **Retención del log.** Si el chat es evidencia, los Términos y la política de Privacidad
   (publicados el 2026-07-12) deberían declarar cuánto tiempo se conservan los mensajes.
   Pendiente de revisar con el usuario.

4. **`getOrCreate` de la conversación toca `TrabajoService` y `MudanzaService`.** Son servicios
   centrales y en producción. El enganche debe ir en el punto de aceptación del cliente
   (`TrabajoService.java:738-746` y su equivalente en mudanzas), y una conversación que no se
   crea es un chat que nunca aparece — sin error visible. Cubrir con tests de integración en
   ambos verticales.

## Estimación

**~15 tareas, 5 a 7 días de trabajo efectivo.**

| Bloque | Tareas |
|---|---|
| Backend | 6 — migración `V10` (`conversacion` + `CHECK` + `mensaje` + `lectura_conversacion`); entities y enum `TipoMensaje`; `ConversacionResolver` (+ `getOrCreate` enganchado en ambos servicios); `ChatService`; `ChatController` + push por STOMP; presencia + debounce |
| Frontend | 7 — refactor `useWebSocket`; `chatApi` en `packages/api`; `ChatPanel`; montaje en trabajos (`JobTracking` + `ActiveJob`); montaje en mudanzas (`MudanzaDetail` + `ProviderMudanzaDetail`); vistas read-only; badge de no leídos |
| Cierre | 2 — security review (autorización/IDOR, XSS en el render, validación del upload) y verificación end-to-end en la app viva |

**La mitad del costo no está en el chat**, sino en el refactor del hook y en la UI del
proveedor, que hoy no existe en ninguno de los dos verticales. Cubrir mudanzas además de
trabajos suma aproximadamente **un día**, porque `ChatPanel` y todo el backend se reutilizan
sin ramas.
