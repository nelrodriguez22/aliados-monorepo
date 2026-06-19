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
- ✅ **Denormalizar** `promedioCalificacion`/`cantidad` en `users` → hecho (2026-06-19, #8).

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
    - **[x] Fix de fondo C (hecho, 2026-06-19):** signed upload a **Cloudinary** — el backend firma (`POST /api/uploads/signature`, `CloudinaryService.firmar`/`borrarFotos`/`borrarUrl`, carpetas `aliados/trabajos|mudanzas|avatars`), los bytes van directo cliente→Cloudinary (`uploadToCloudinary` helper) y se guarda solo la `secure_url`. Borrado best-effort al cancelar trabajo/mudanza y al reemplazar avatar. Frontend migrado: `ServiceRequest`, `MudanzaRequest`, avatar en `ClientProfile`. CSP de `firebase.json` actualizada (`api.cloudinary.com`). **Verificado en prod (2026-06-19):** bundle desplegado usa el endpoint + `api.cloudinary.com`, sin `readAsDataURL`; `/api/uploads/signature` responde 403 (vivo). Requiere env vars `CLOUDINARY_*` en Railway. _⚠️ Mientras `firebase.json` no se redeploye con `Cache-Control: no-cache` en `index.html`, navegadores con bundle viejo cacheado (1h) pueden seguir creando fotos base64; ver fix de caché de hosting._
    - **[x] #20-B Paginación del historial del cliente (hecho, 2026-06-19):** `/api/trabajos/cliente` ahora devuelve **solo activos** (PENDIENTE/EN_CURSO/PROPUESTO/EN_COLA) y el historial completado va por el nuevo `GET /api/trabajos/cliente/historial?page=&size=` (`PagedTrabajosResponse{content, hasNext, total, sinCalificar}`, size acotado 1–50, orden `completedAt DESC`). El badge "sin calificar" se calcula con `countSinCalificarByCliente` (NOT EXISTS calificación) en vez de derivarse de toda la lista. FE: `ClientDashboard` usa `useInfiniteQuery` con botón **"Cargar más"** (reemplaza el toggle "Ver todos"); invalidaciones de `trabajos-historial` agregadas en WS `TRABAJO_COMPLETADO`, en la calificación (`JobCompleted`) y en el logout (`UserMenu`). `compileJava` + `tsc` + `build` OK. _Pendiente: redeploy backend + frontend._
    - **[x] Historial del proveedor paginado (hecho, 2026-06-19):** `GET /api/trabajos/completados?page=&size=` ahora devuelve `PagedTrabajosResponse` (se agregó `total` al DTO para el stat "N completados"; `sinCalificar`=0). Repo `findByProveedorIdAndEstado(..., Pageable)`. FE: `ProviderDashboard` con `useInfiniteQuery` + "Cargar más" (reemplaza toggle "Ver todos"); el stat usa `total`, no la longitud cargada. Las invalidaciones WS existentes de `trabajos-completados` (CALIFICACION_RECIBIDA, TRABAJO_COMPLETADO_PROVEEDOR, ActiveJob) siguen funcionando sin cambios (misma queryKey). `compileJava`+`tsc`+`build` OK. _Pendiente: redeploy BE+FE._
    - **[x] Compresión de imágenes en el cliente (hecho, 2026-06-19):** `uploadToCloudinary` ahora reescala + re-encodea a JPEG en el navegador **antes** de subir (Canvas + `createImageBitmap` con `imageOrientation:'from-image'` para corregir rotación EXIF; sin dependencias). Targets: trabajo/mudanza máx 1600px q0.8, avatar máx 512px q0.8 → una foto de 3MB queda en ~40–300kB (el `upload` a Cloudinary pasó de ~2.3s a fracciones de segundo). Fallback al original si falla la decodificación (ej. HEIC/navegador viejo); topes 25MB (entrada) y 10MB (límite Cloudinary free) con mensajes claros. Feedback de subida unificado con spinner (`Loader2`) en tiles de servicio/mudanza y overlay sobre el avatar. _Pendiente: redeploy FE._
    - **[x] Limpieza de avatares pesados pre-compresión (2026-06-19):** los avatares subidos antes de la compresión seguían siendo el original (~3MB). Decisión: **borrar y que re-suban** (pre-launch, 3 usuarios) → `UPDATE users SET foto_perfil = NULL WHERE foto_perfil LIKE '%cloudinary%'` (preserva fotos de Google del OAuth) + borrar carpeta `aliados/avatars` desde el dashboard de Cloudinary (orden: DB primero para no mostrar imágenes rotas). Sin cambios de código.

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
- [x] #8 N+1 en DTOs — batch (sesión 2) **→ reemplazado por denormalización (2026-06-19)**. Fase intermedia (2026-06-17): `getPromediosByProveedorIds` (1 query) + helpers en `TrabajoService`. **Denormalización final (2026-06-19):** nuevas columnas `users.promedio_calificacion` (double) y `users.cantidad_calificaciones` (bigint), migración `V2__denormalize_calificacion_users.sql` (ADD COLUMN NOT NULL DEFAULT 0 + backfill desde `calificaciones`). Entidad `User` con los campos (Lombok). **Write-on-recompute:** `CalificacionService.crearCalificacion` (ya `@Transactional`) recalcula AVG/COUNT y persiste en el proveedor tras guardar la calificación → cero drift (las calificaciones son inmutables: solo alta). **Lecturas sin query:** `UserService.mapToDTO` y `TrabajoService.mapToDTO`/`promediosPorProveedor` leen la columna de la entidad `proveedor` (ya cargada vía `@EntityGraph`); `ProviderScoreService.calcularCalificacionNormalizada(User)` usa `cantidad==0` para el caso "proveedor nuevo → 50 neutral". Eliminado el batch `getPromediosByProveedorIds` y el campo `calificacionRepository` de `ProviderScoreService` (dead code). Los endpoints `CalificacionService.getPromedio/getCantidad` se dejan con query live (no son hot path, sirven de cross-check). `compileJava` OK. _Pendiente: redeploy backend (corre Flyway V2)._
- [x] Pool de conexiones Hikari configurado (2026-06-19): el default era **10** (cuello bajo concurrencia). Seteado a `maximum-pool-size=20`, `minimum-idle=5`, `connection-timeout=10000`, `max-lifetime=300000` en `application.properties`. ✅ **DB = Neon con endpoint *pooled* (pgBouncer) confirmado** (`...-pooler...neon.tech`), así que el pool de 20 es seguro (pgBouncer multiplexa, no agota `max_connections`). Se puede subir a 30–50 si un load test muestra cola; el límite real pasa a ser la CPU del compute de Neon. _Caveat pgBouncer transaction-mode: no soporta estado de sesión Postgres (prepared statements server-side, SET, advisory locks); la app ya corre así sin problema._
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
- [x] #18 `getMudanzasPendientesProveedor` (2026-06-18). **Cerrado (no había problema de escala):** las mudanzas son **exclusivas de una sola empresa de fletes** → el modelo broadcast (todas las RESERVADO a ese proveedor) es el diseño final, no provisional. Auth endurecida: el endpoint recibe `Authentication` y el service exige que el caller sea proveedor de fletes/mudanzas (`esProveedorDeFletes`: oficio contiene "udanza"/"lete") → si no, 403 (antes lo veía cualquier autenticado, incluso clientes). Doble-booking ya cubierto por #2.
- [x] #21 Loop al rechazar trabajo con un solo proveedor (2026-06-19). **Bug:** `rechazarTrabajo` llamaba `notificarProveedorDisponible`, que reelegía al mejor de `findProveedoresDisponibles` **sin excluir al que acababa de rechazar** → con un único plomero online se re-asignaba el trabajo a sí mismo al instante y reaparecía en su dashboard (síntoma: "no puedo rechazar, lo sigo viendo"). **Fix:** `notificarProveedorDisponible(Trabajo)` ahora delega en una sobrecarga `(Trabajo, Long excluirProveedorId)`; `rechazarTrabajo` pasa `proveedor.getId()` y se lo excluye de la lista (`removeIf`). Si tras excluirlo no queda nadie, el trabajo queda **PENDIENTE sin notificar** (decisión de producto: "queda sin asignar") y desaparece del dashboard de quien rechazó, hasta que otro proveedor se conecte. `crearTrabajo` y `rechazarPropuesta` siguen sin exclusión (en este último, re-ofrecer al mismo tras el rechazo del cliente es el comportamiento deseado). `compileJava` OK. _Pendiente: redeploy backend en Railway. El trabajo ya pegado se libera con `UPDATE trabajos SET proveedor_notificado_id=NULL, notificado_at=NULL WHERE id=...`._
- Menores (🟢) — estado al 2026-06-18:
  - [x] System.out→logger: ya no quedan `System.out`/`err`/`printStackTrace` (resuelto en #9).
  - [x] `@Transactional` en `saveFcmToken`/`updateProfile`: ya los tienen.
  - [x] `fotos` JSON→jsonb: hecho en Fase 1.
  - [x] Helper bounding box Rosario (2026-06-18): extraído a `util/RegionRosario.contiene(lat,lng)`; `TrabajoService` y `MudanzaService` lo usan (antes el check con magic numbers estaba duplicado).
  - [x] `comisionPorcentaje` a config (2026-06-18): `@Value("${app.mudanza.comision-porcentaje:10.00}")` en MudanzaService; se setea al crear la mudanza (se persiste por fila para histórico). Nunca se seteaba antes → era global de hecho.
  - [x] cors `cors.configure(http)`: **verificado, se deja**. Funciona (el front conecta vía el bean `WebMvcConfigurer` de `CorsConfig`). Modernizarlo a `Customizer.withDefaults()` + `CorsConfigurationSource` es riesgo de romper CORS por poco valor; no se toca pre-launch.
  - [x] `Notificacion.tipo` String→enum (2026-06-18): nuevo `entity/TipoNotificacion` (18 valores = exactamente los `case` del front en `useWebSocket`). `Notificacion.tipo` y `NotificacionResponseDTO.tipo` → enum con `@Enumerated(STRING)` (columna sigue varchar → Flyway/validate OK; Jackson serializa el `name()` → el front recibe el mismo string). 18 call sites convertidos (Trabajo 9, Mudanza 8, Calif 1). `NotificacionDTO` (legacy) sin tocar. ⚠️ **Caveat DB:** filas existentes en `notificaciones` con un `tipo` fuera del enum tirarían error al leerse (`Enum.valueOf`); como es pre-launch (data de prueba), si hay registros viejos conviene vaciar la tabla. `compileJava` OK.
  - [x] `enviarNotificacion` → `@TransactionalEventListener(AFTER_COMMIT)` (2026-06-18): la notif se guarda en la tx del caller; el WS + push se emiten vía `NotificacionCreatedEvent` en `NotificacionEventListener` (`AFTER_COMMIT`, `fallbackExecution=true`). Si la tx hace rollback, no se manda nada (no más notificaciones "fantasma"). `compileJava` OK.

---

## Orden sugerido de impacto/esfuerzo
1. #1, #3 (fix rápido, alto impacto)
2. #5 (refactor acotado, gran ganancia)
3. Fase 1 Flyway + #6 índices + #7/#8 (rendimiento bajo carga)
4. #4 BigDecimal + #2 constraint (integridad/dinero)
5. #11 geocoding (seguridad/costos)
6. Resto como deuda planificada.
