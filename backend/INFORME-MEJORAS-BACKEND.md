# Informe de mejoras — Backend Aliados

> Documento vivo para retomar entre sesiones. Marcá los TODOs a medida que se resuelven.
> Última actualización: 2026-06-18

Stack: Spring Boot 3.4.2 · Java 21 · PostgreSQL · Firebase Auth · WebSocket STOMP · SendGrid · FCM.

---

## Decisiones tomadas

- ✅ **La base se limpia** (drop & recreate). Hecho: `DROP SCHEMA public CASCADE` corrido en Neon.
- ✅ **Se suma Flyway** (migraciones versionadas) para no depender más de `ddl-auto=update`.
- ✅ **Dinero `BigDecimal` end-to-end** (entidades + DTOs + aritmética) con columnas `NUMERIC(12,2)`. **Hecho.**
- ✅ **`ddl-auto=validate`** tras Flyway. **Hecho.**
- ✅ **`fotos` → `jsonb`** (`@JdbcTypeCode(JSON)`). **Hecho.**
- ✅ **Seeds a Flyway** (`R__seed_oficios.sql`, `R__seed_mudanza_tiers.sql`); `DataInitializer` eliminado. **Hecho.**
- ⏳ **Denormalizar** `promedioCalificacion`/`cantidad` en `users` → pendiente (Fase 3, #8).

### Estado de implementación (2026-06-17)
- Refactor + Flyway implementados y **`./gradlew compileJava` = BUILD SUCCESSFUL**.
- **1er deploy a prod (Railway) FALLÓ en `validate`**: `missing column [precio_bloque30min] in table [mudanza_tiers]`.
  - Causa: la naming strategy de Hibernate convierte `precioBloque30Min` → `precio_bloque30min` (NO inserta `_` antes de "Min" porque viene tras un dígito; la regla solo inserta en transición minúscula→mayúscula). La V1/seed usaban `precio_bloque30_min`.
  - Fix aplicado: `@Column(name = "precio_bloque30_min")` explícito en `MudanzaTier.precioBloque30Min` (deja el nombre legible y consistente con V1/seed). Recompila OK.
  - Fix pusheado + re-wipe de Neon + redeploy.
- **✅ 2do deploy OK (verificado en prod)**: `/api/health` = 200, `/api/oficios` y `/api/mudanzas/tiers` devuelven los seeds, montos serializados como `NUMERIC(12,2)` (ej. `450000.00`). `validate` pasó → `jsonb` y `NUMERIC` confirmados. **Fase 1 completa.**

---

## Hallazgos (ordenados por severidad)

### 🔴 Críticos

1. **Bug de precedencia SQL en `findProveedoresFletes` (`UserRepository`).**
   `... AND u.oficio.nombre LIKE '%udanza%' OR u.oficio.nombre LIKE '%lete%'` sin paréntesis: `AND` precede a `OR`, así la 2ª rama trae cualquier usuario (clientes, inactivos) cuyo oficio contenga "lete". Corregir con paréntesis / usar flag explícito de oficio.

2. **Doble-booking de turnos de mudanza (race TOCTOU).**
   En `aceptarMudanza` / `aceptarContrapropuesta`: el `existsByFechaConfirmadaAndTurnoAndEstadoNotIn` y el `save` no son atómicos y no hay constraint único en `(fecha_confirmada, turno)`. Dos requests concurrentes pueden agendar el mismo turno. → índice único parcial + lock pesimista o capturar violación.

3. **Spoofing de identidad en WebSocket `/authenticate` (`UserStatusController`).**
   Confía en el `firebaseUid` del payload sin verificar token (a diferencia de `/status` y `/heartbeat`). Cualquier usuario conectado puede cambiar el estado de otro. Además `getSessionAttributes()` puede ser `null` → NPE. → derivar UID del `Principal` autenticado en el CONNECT.

4. **Dinero como `Double`.**
   `montoBase/Final/Extra`, `comisionMonto`, `montoProveedor`, `precioEstimado`, `tarifaVisita`, `precioBloque30Min`… punto flotante = errores de redondeo en cálculos financieros. → `BigDecimal` / `NUMERIC(12,2)`.

5. **`ProviderScoreService.ordenarPorScore` — explosión de queries.**
   `Comparator.comparingDouble(this::calcularScore)` reevalúa el score O(n·log n) veces, y cada `calcularScore` hace 4 queries, todo dentro de la tx de `crearTrabajo`. → calcular score una vez por proveedor en un `Map` y ordenar sobre eso.

### 🟠 Altos

6. **Sin índices en BD.** `ddl-auto=update` sin ninguna `@Index`; sólo índices de columnas `unique`. Postgres no indexa FKs. Filtran sin índice: `trabajos(estado, oficio_id, proveedor_id, proveedor_notificado_id, cliente_id)`, `mudanzas(estado, fecha_confirmada, turno, proveedor_id, cliente_id)`, `users(status, localidad, oficio_id, role)`, `calificaciones(proveedor_id, trabajo_id)`, `notificaciones(user_id, leida)`.

7. **`FetchType.EAGER` global** en todos los `@ManyToOne/@OneToOne`. Los listados cargan el grafo completo siempre. → `LAZY` por defecto + `JOIN FETCH` puntual.

8. **N+1 en mapeo de DTOs.** `mapToDTO(Trabajo)` hace 2 queries por trabajo; `UserService.mapToDTO` 3 queries por usuario PROVIDER. Candidato a denormalizar promedio de calificación en `users`.

9. **`FirebaseAuthFilter`: query a BD en cada request** para derivar rol (sin caché). → cache uid→rol (Caffeine) o custom claim en el token.

10. **Manejo de errores genérico.** `GlobalExceptionHandler` mapea toda `RuntimeException` a 400 y devuelve `e.getMessage()` al cliente. "No autorizado" debería ser 403, "no encontrado" 404. → excepciones tipadas con códigos HTTP.

11. **Geocoding proxy abierto.** `/api/geocoding/**` es `permitAll` (proxy a Google Maps con tu API key, sin rate limit). `forward`/`autocomplete` concatenan el parámetro sin URL-encode (inyección/fallos). `new RestTemplate()` por request. → auth/rate limit + `UriComponentsBuilder` + RestTemplate bean.

### 🟡 Medios

12. **`WebSocketEventListener`:** pool de 1 hilo sin `shutdown`; lógica de OFFLINE tras 5s no compara `lastSeenAt` → flapping ONLINE/OFFLINE.
13. **`verifyIdToken` repetido en cada heartbeat** (cada 30s/usuario). → usar `Principal` del CONNECT.
14. **Filtrado en memoria:** `getTrabajosPendientes` trae todos los PENDIENTE del oficio y filtra en memoria; `marcarTodasComoLeidas` trae y guarda en memoria. → query directa / `UPDATE ... WHERE leida=false`.
15. **Tokens FCM muertos nunca se limpian** (`PushNotificationService`). → detectar `UNREGISTERED`/`INVALID_ARGUMENT` y limpiar `fcm_token`.
16. **Mensaje de tarifa hardcodeado** en `proponerTrabajo` ("$15.000" fijo) aunque `tarifaVisita` sea parametrizable.
17. **Localidad case-sensitive inconsistente:** query usa `=`, otro código usa `equalsIgnoreCase`. → normalizar al guardar.
18. **`getMudanzasPendientesProveedor` devuelve todas las RESERVADO a cualquier proveedor** (provisional, no escala).
19. **Config riesgosa en prod:** `ddl-auto=update`, `logging.level.org.hibernate.SQL=DEBUG`. → Flyway + bajar logging.
20. **🟠 Fotos en base64 → payload gigante (2026-06-18).** El front (`ServiceRequest.tsx` con `FileReader.readAsDataURL`) guarda las fotos del trabajo como **data URLs base64** en `trabajo.fotos` (hasta 3, ~MB c/u). `/api/trabajos/cliente` (y demás listados) devolvía `fotos` de **todo el historial sin paginar** → 1.5MB. Doble problema: (a) almacenamiento base64 en Postgres, (b) payload de respuesta.
    - **[x] Mitigación A (hecha):** `mapToDTOOptimized` ya NO incluye `fotos` (las listas no las muestran; el detalle vía `mapToDTO` las conserva). Baja drásticamente el payload de los 4 endpoints de lista.
    - **[ ] Fix de fondo C (pendiente):** subir las fotos a **Cloudinary** (ya está en el stack) y guardar solo URLs en `fotos`. Toca el flujo de upload (front + posible endpoint de firma/upload backend) + migración de datos base64 existentes. Recomendado diseñarlo con brainstorming.
    - **[ ] Adicional:** paginar el endpoint de historial (`Pageable`).

### 🟢 Menores

- `cors(cors -> cors.configure(http))` poco habitual; verificar que aplica.
- `System.out.println` en `FirebaseAuthFilter` → logger.
- `Notificacion.tipo` String libre → enum.
- `fotos` JSON en TEXT sin validación → `jsonb`.
- Validación de región Rosario (bounding box) duplicada en `TrabajoService` y `MudanzaService` → helper.
- `saveFcmToken` / `updateProfile` sin `@Transactional`.
- `enviarNotificacion` emite por WS dentro de la tx del caller → eventos "fantasma" si hay rollback. → `@TransactionalEventListener(AFTER_COMMIT)`.
- `comisionPorcentaje` por fila con default 10 → si es global, a config.

---

## Esquema de BD (reconstruido)

| Tabla | Columnas clave | Notas |
|---|---|---|
| **users** | id, firebaseUid(uniq), email(uniq), role(enum), nombre, telefono, fotoPerfil, activo, oficio_id(FK), matricula, localidad, status(ONLINE/OFFLINE/BUSY), lastSeenAt, fcm_token | falta índice (role,status,localidad,oficio_id) |
| **oficios** | id, nombre(uniq), icono, activo, exclusivo | seed de 8 oficios |
| **trabajos** | id, cliente_id, proveedor_id, oficio_id, estado(enum), descripcion, direccion, lat/lng cliente·proveedor·destino, tiempoEstimado, precioEstimado(Double), fotos(TEXT), notificadoAt, proveedorNotificadoId, tarifaVisita(Double) | PENDIENTE→PROPUESTO→EN_CURSO/EN_COLA→COMPLETADO/CANCELADO |
| **mudanzas** | id, cliente_id, proveedor_id, tier_id, tier_original_id, estado(enum), origen/destino(dir+lat+lng), pisos, tieneAscensor, cantidadAmbientes, fechaDeseada/Confirmada/Original, turno(PRIMERO/SEGUNDO), fotos(TEXT), montos(Double×6), comisionPorcentaje, iniciado/finalizadoAt, duracionRealMinutos, bloquesExtra | falta unique (fecha_confirmada,turno); dinero Double |
| **mudanza_tiers** | id, nombre(uniq), emoji, precioBase, minutosIncluidos, precioBloque30Min, descripcion, descripcionCompleta, activo, orden | BRONCE/PLATA/ORO/DIAMANTE |
| **calificaciones** | id, trabajo_id(FK uniq 1:1), cliente_id, proveedor_id, estrellas(1-5), comentario | 1 por trabajo |
| **notificaciones** | id, user_id, tipo(String), titulo, mensaje, trabajoId, actionUrl, leida | tipo→enum; falta índice (user_id,leida) |
| **bug_reports** | id, user_id, categoria(enum), titulo, descripcion, url | |

**Nota clave sobre migración:** `ddl-auto=update` es aditivo — agrega tablas/columnas/constraints faltantes, pero **no cambia tipos** (Double→NUMERIC) ni convierte a jsonb. Por eso, con base limpia, lo más prolijo es dropear y recrear vía Flyway con los tipos correctos desde el arranque.

---

## TODO — Plan de trabajo

### Fase 0 — Diseño
- [x] Cerrar decisiones pendientes (BigDecimal scope, validate, jsonb, seeds).

### Fase 1 — Infra de migraciones (base limpia + Flyway)
- [x] Agregar dependencia Flyway en `build.gradle` (`flyway-core` + `flyway-database-postgresql`).
- [x] `ddl-auto=validate` + config Flyway en `application.properties`.
- [x] `V1__init_schema.sql`: esquema con `NUMERIC(12,2)`, `jsonb`, índices, unique `(fecha_confirmada, turno)` parcial, FKs.
- [x] Seeds a Flyway repeatable (`R__seed_oficios.sql`, `R__seed_mudanza_tiers.sql`); `DataInitializer` eliminado.
- [x] **Verificar arranque contra base vacía** — OK en prod (health 200, seeds y montos NUMERIC verificados).

### Fase 2 — Bugs críticos de código
- [x] #1 Fix precedencia SQL `findProveedoresFletes` (paréntesis al OR).
- [x] #3 Fix spoofing WS `/authenticate`: UID derivado del token verificado (`extractFirebaseUid`), ya no del payload; + null-check de `getSessionAttributes`. ⚠️ Requiere que el front mande el header `Authorization: Bearer` en el frame `/authenticate` (igual que ya hace para `/status` y `/heartbeat`).
- [x] #5 Refactor `ProviderScoreService.ordenarPorScore` (score cacheado 1 vez por proveedor, en vez de O(n·log n) reevaluaciones).
- [x] #4 Migrar dinero a `BigDecimal` (entidades + DTOs + aritmética).
- [x] #2 Doble-booking cerrado (2026-06-18). Constraint: índice único parcial `uq_mudanzas_fecha_turno (fecha_confirmada, turno) WHERE estado NOT IN ('CANCELADO','COMPLETADO')` en V1. Código endurecido en `aceptarMudanza` y `aceptarContrapropuesta`: `save` → `saveAndFlush` envuelto en `try/catch (DataIntegrityViolationException)` → relanza `ConflictException` (409 amigable). El pre-check (`existsBy...`) se mantiene como camino feliz; el catch es el backstop que cierra la race TOCTOU si dos requests pasan el chequeo a la vez. `compileJava` OK.

### Fase 3 — Rendimiento
- [x] #6 Índices (incluidos en `V1__init_schema.sql`).
- [x] #7 EAGER→LAZY (2026-06-17, sesión 2) — **implementado, PENDIENTE VERIFICAR en prod con OSIV off**:
  - Todas las relaciones `@ManyToOne/@OneToOne` → `LAZY` (8 entidades).
  - `@Transactional(readOnly=true)` a nivel de clase en los 6 services + ProviderScoreService (mantiene sesión abierta durante el mapeo a DTO). Writers que no lo tenían (`updateProfile`, `saveFcmToken`, `forceProviderOffline`, `asignarTrabajosAProveedorQueSeConecta`) → `@Transactional` explícito.
  - `@EntityGraph` en finders de listado/detalle de `TrabajoRepository` (cliente/proveedor/oficio) y `MudanzaRepository` (cliente/proveedor/tier/tierOriginal) para evitar N+1.
  - `spring.jpa.open-in-view=false` (setting correcto para prod; hace que un lazy mal resuelto explote como error, no como N+1 silencioso).
  - Verificado: ningún controller devuelve entidades crudas; único embed en DTOs = `Oficio`/`MudanzaTier` (leaf, sin relaciones → seguros de serializar). WebSocket usa solo campos escalares de User.
  - **Fix post-deploy #1** (`LazyInitializationException` en `Oficio`) y **#2** (`Type definition error: ByteBuddyInterceptor`): el DTO embebe la entidad `Oficio` (`TrabajoResponseDTO`/`UserResponseDTO`). Primero falló por proxy sin inicializar; tras `Hibernate.initialize` siguió fallando porque un proxy inicializado **igual es una subclase ByteBuddy** que Jackson no serializa. Solución final: `dto.setOficio((Oficio) Hibernate.unproxy(getOficio()))` (devuelve la entidad real, null-safe) en `TrabajoService.mapToDTO`/`mapToDTOOptimized` y `UserService.mapToDTO`. Único embed de entidad en DTOs = `Oficio`; el resto escalares. _Alternativa sistémica futura: registrar `jackson-datatype-hibernate6` para manejar proxies globalmente._
  - **Fix post-deploy #3** (`Could not initialize proxy [Oficio] - no session` en PATCH `/api/users/me/status`): `UserController.updateStatus` carga el `user` en el controller (sesión propia, se cierra) y lo pasa detached a `TrabajoService.asignarTrabajosAProveedorQueSeConecta(@Transactional)`, que accede a `proveedor.getOficio()` (LAZY) → proxy de sesión muerta. Fix: el método **recarga el proveedor por id** (`userRepository.findById`) dentro de su propia tx, así el oficio LAZY se inicializa en la sesión activa.
  - **Falta**: seguir recorriendo el resto de endpoints de listado/detalle tras re-deploy (mirar logs: sin `LazyInitializationException`/`ByteBuddy`; contar queries para N+1 residual).
- [x] #8 N+1 en DTOs — **vía batch (no denormalización)** (2026-06-17, sesión 2): nuevo `getPromediosByProveedorIds` (1 query para todos los promedios) + helpers `calificacionesPorTrabajo`/`promediosPorProveedor` en `TrabajoService`; `getTrabajosByCliente`/`EnCola`/`Pendientes`/`Completados` unificados en `mapToDTOOptimized(... Map promedios)`. Sin cambio de esquema, sin drift. `UserService.mapToDTO` se dejó: solo se usa en contextos single-user.
- [x] #9 Cache de rol en `FirebaseAuthFilter` (Caffeine, TTL 5min, maxSize 10k; solo cachea usuarios existentes para no congelar ROLE_USER de altas en curso). Dep `caffeine` en build.gradle. Bonus: `System.out` → logger.
- [x] #14 Filtrado en query: `getTrabajosPendientes` usa `findByEstadoAndOficioIdAndProveedorNotificadoId`; `marcarTodasComoLeidas` ahora es un `@Modifying` bulk `UPDATE ... WHERE leida=false` (antes traía todo + saveAll).

### Email — migrado a Resend ✅ (2026-06-17, sesión 2)
- **SendGrid → Resend COMPLETO y verificado en prod** (log: `status 200`, mail entregado desde `noreply@convivirtech.com.ar`). Dominio verificado en Resend (SPF/DKIM vía Cloudflare).
- `EmailService` reescrito: API HTTP de Resend vía `RestTemplate` (sin SDK). Props `resend.*` en `application.properties`; vars Railway `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. Dep `sendgrid-java` eliminada.
- [x] Endpoint diagnóstico `POST /api/admin/test-email?to=...` (admin-only, devuelve status/body de Resend).
- [x] Endpoint **reenviar verificación** `POST /api/users/resend-verification` (público/permitAll): respuesta 200 genérica anti-enumeración, no reenvía si ya verificado, cooldown 60s en memoria (`ConcurrentHashMap` en `UserService`). Front: `CheckEmail.tsx` con botón + cooldown visual.
- Fix CORS: `allowedOriginPatterns` con `http://localhost:*` (`CorsConfig.java` + `WebSocketConfig.java`) — aplica tras deploy.
- [ ] Opcional futuro: envío `@Async`; cooldown a Redis si se escala a >1 instancia.

### Fase 4 — Robustez / calidad
- [x] #10 Excepciones tipadas + códigos HTTP correctos (2026-06-18). Jerarquía: `NotFoundException`(404)/`ForbiddenException`(403)/`ConflictException`(409) extends `RuntimeException`; `UserNotFoundException extends NotFoundException`. Handlers en `GlobalExceptionHandler`. Migrados: **65** `orElseThrow "no encontrado"` → 404; **15** "No autorizado"/"Solo el cliente puede calificar"/"No estás asignado" → 403; **4** "ya registrado" + doble-booking de turno → 409. Las **25** validaciones de estado de negocio restantes quedan en 400 (decisión: scope "balanceado", no full-409). Fix clave: se quitó el `catch (RuntimeException)→400` local de `/api/users/register` (se tragaba el 409); ahora los tipos llegan al handler global. `compileJava` OK. _Nota: el front muestra el `message` del body sin ramificar por status (salvo 401/403 en `/api/users/me`), así que el cambio de contrato es de bajo riesgo._
- [x] #11 Geocoding endurecido (2026-06-17, sesión 2): sacado de `permitAll` → ahora requiere auth (el front ya manda token vía `apiClient.get`, no rompe nada); URLs con `UriComponentsBuilder...encode()` (cierra inyección de params en `address`/`input`); `RestTemplate` bean compartido con timeouts (5s connect / 10s read) en `RestClientConfig`. Rate-limit por-usuario añadido: `RateLimiter` (ventana fija en memoria, `config/RateLimiter.java`), 60 req/min por UID en los 3 endpoints → 429 al exceder. `EmailService` migrado al `RestTemplate` bean (ya no usa `new`). _RateLimiter es in-memory → a Redis si se escala a >1 instancia._
- [x] #12 WS event listener (2026-06-18). (a) **Shutdown:** el `ScheduledExecutorService` ahora usa threads daemon (no bloquean la JVM) + `@PreDestroy` que hace `shutdown()`/`awaitTermination(2s)`/`shutdownNow()`. (b) **Flapping resuelto:** se captura `disconnectAt` al agendar y el check a los 5s solo marca OFFLINE si `lastSeenAt` NO es posterior al disconnect (si hubo reconexión, `updateUserStatus` refrescó `lastSeenAt` → se omite). BUSY sigue cubierto por su propio check. `compileJava` OK.
- [x] #13 Reusar Principal en heartbeat (2026-06-18). `UserStatusController` ya NO llama `verifyIdToken` por mensaje: los 3 handlers (`/heartbeat`, `/status`, `/authenticate`) toman el UID del `Principal` que `WebSocketAuthInterceptor` setea (y verifica) una sola vez en el CONNECT. Eliminado `extractFirebaseUid` + imports Firebase. También se quitó el `getSessionAttributes().put("firebaseUid", ...)` (nadie lo leía; `WebSocketEventListener` usa `event.getUser()`). `compileJava` OK. _Observación (no tocada, behavior preservado): `/app/status` es hoy un no-op — el front (`useWebSocket.changeStatus`) manda solo `{status}` sin `firebaseUid`, y el handler exige `principal.getName().equals(statusDTO.getFirebaseUid())`. Si se quiere reactivar el cambio de estado por WS, hay que sacar ese check obsoleto (el Principal ya es la identidad confiable) o que el front mande el UID. Hoy el estado se cambia por REST (`PATCH /api/users/me/status`)._
- [x] #15 Limpieza de tokens FCM muertos (2026-06-18). `PushNotificationService.enviarPush` (único sender FCM, llamado desde `NotificacionService`) ahora captura `FirebaseMessagingException`: si el `MessagingErrorCode` es `UNREGISTERED` o `INVALID_ARGUMENT` → `userRepository.clearFcmToken(id)` (query `@Modifying @Transactional`, propia porque el caller es `@Async`). El resto de errores FCM solo se loguean. `compileJava` OK.
- [x] #16 Mensaje de tarifa ya no hardcodeado (2026-06-18). `proponerTrabajo` arma la notificación con la **tarifa real** (`tarifaEfectiva`, default 15000 si null) formateada es-AR (`NumberFormat.getIntegerInstance(Locale.of("es","AR"))` → "15.000"), en vez del texto fijo "$15.000". `compileJava` OK.
- [x] #19 Logging bajado (2026-06-18). `logging.level.org.hibernate.SQL` DEBUG → **WARN** (ya no loguea cada query en prod: ruido/overhead/fuga). `ddl-auto=validate` y `show-sql=false` ya estaban (Fase 1). ✅ **Riesgo de ratio resuelto (2026-06-18):** `mudanza.ratio-tiempo` default flippeado de 180.0 → **1.0** (tiempo real, prod-seguro). El front (planes + timer de `ProviderMudanzaDetail`) opera en tiempo real sin ratio, así que con 180 prod facturaba 180x. Ahora prod es seguro aunque la env var no esté seteada. Testing debe setear `MUDANZA_RATIO_TIEMPO=180` explícitamente. (Es `@Value`, se inyecta al arrancar → cambiar la env var requiere redeploy.) **Estado actual: pre-launch (solo el dev + 2 testers), un único entorno = prod.** Railway tiene/tendrá `MUDANZA_RATIO_TIEMPO=180` para testear. ⚠️ **CHECKLIST PRE-LANZAMIENTO: borrar `MUDANZA_RATIO_TIEMPO` de Railway (o ponerla en 1.0) antes de tener usuarios reales**, si no las mudanzas se facturan 180x.
- [x] #17 Localidad normalizada al guardar (2026-06-18). Helper `normalizeLocalidad` (trim + Title Case por palabra: "rosario"/"ROSARIO"/" Rosario " → "Rosario") aplicado en `registerUser` y `updateProfile`. Así el query `findProveedoresDisponibles` (que usa `=` case-sensitive) matchea siempre, sin importar cómo lo escriba el usuario. DB ya estaba consistente (base limpia) → normalización forward alcanza. `compileJava` OK.
- [~] #18 `getMudanzasPendientesProveedor` (2026-06-18). **Auth endurecida (hecho):** el endpoint `/api/mudanzas/proveedor/pendientes` ahora recibe `Authentication` y el service exige que el caller sea PROVEEDOR de fletes/mudanzas (`esProveedorDeFletes`: oficio contiene "udanza"/"lete") → si no, 403. Antes lo veía cualquier autenticado (incluso clientes). **Pendiente (decisión de producto):** el modelo de distribución entre **múltiples** proveedores de fletes (hoy broadcast de todas las RESERVADO; sirve con un solo proveedor y ya está protegido contra doble-booking por #2). Rediseñar con brainstorming cuando se onboarden más proveedores.
- [ ] Menores (🟢): System.out→logger restantes, `Notificacion.tipo`→enum, helper bounding box duplicado, `@Transactional` faltantes (`saveFcmToken`/`updateProfile`), `enviarNotificacion` AFTER_COMMIT, `comisionPorcentaje` a config.

---

## Orden sugerido de impacto/esfuerzo
1. #1, #3 (fix rápido, alto impacto)
2. #5 (refactor acotado, gran ganancia)
3. Fase 1 Flyway + #6 índices + #7/#8 (rendimiento bajo carga)
4. #4 BigDecimal + #2 constraint (integridad/dinero)
5. #11 geocoding (seguridad/costos)
6. Resto como deuda planificada.
