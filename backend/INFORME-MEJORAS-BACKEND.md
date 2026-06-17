# Informe de mejoras — Backend Aliados

> Documento vivo para retomar entre sesiones. Marcá los TODOs a medida que se resuelven.
> Última actualización: 2026-06-17

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
- [x] #2 Constraint único `(fecha_confirmada, turno)` creado en V1. _Pendiente endurecer el código para capturar la violación en vez de solo el chequeo previo._

### Fase 3 — Rendimiento
- [x] #6 Índices (incluidos en `V1__init_schema.sql`).
- [ ] #7 EAGER→LAZY + JOIN FETCH puntuales.
- [ ] #8 Denormalizar promedio de calificación / reducir N+1 en DTOs.
- [ ] #9 Cache de rol en `FirebaseAuthFilter`.
- [ ] #14 Filtrado en query en vez de memoria.

### Email — migrado a Resend ✅ (2026-06-17, sesión 2)
- **SendGrid → Resend COMPLETO y verificado en prod** (log: `status 200`, mail entregado desde `noreply@convivirtech.com.ar`). Dominio verificado en Resend (SPF/DKIM vía Cloudflare).
- `EmailService` reescrito: API HTTP de Resend vía `RestTemplate` (sin SDK). Props `resend.*` en `application.properties`; vars Railway `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. Dep `sendgrid-java` eliminada.
- [x] Endpoint diagnóstico `POST /api/admin/test-email?to=...` (admin-only, devuelve status/body de Resend).
- [x] Endpoint **reenviar verificación** `POST /api/users/resend-verification` (público/permitAll): respuesta 200 genérica anti-enumeración, no reenvía si ya verificado, cooldown 60s en memoria (`ConcurrentHashMap` en `UserService`). Front: `CheckEmail.tsx` con botón + cooldown visual.
- Fix CORS: `allowedOriginPatterns` con `http://localhost:*` (`CorsConfig.java` + `WebSocketConfig.java`) — aplica tras deploy.
- [ ] Opcional futuro: envío `@Async`; cooldown a Redis si se escala a >1 instancia.

### Fase 4 — Robustez / calidad
- [ ] #10 Excepciones tipadas + códigos HTTP correctos.
- [x] #11 Geocoding endurecido (2026-06-17, sesión 2): sacado de `permitAll` → ahora requiere auth (el front ya manda token vía `apiClient.get`, no rompe nada); URLs con `UriComponentsBuilder...encode()` (cierra inyección de params en `address`/`input`); `RestTemplate` bean compartido con timeouts (5s connect / 10s read) en `RestClientConfig`. _Rate-limit por-usuario diferido: con auth requerida la superficie de abuso baja mucho; agregar bucket si hace falta. EmailService aún usa `new RestTemplate()` — migrar al bean es cleanup opcional._
- [ ] #12 WS event listener (pool, lastSeenAt).
- [ ] #13 Reusar Principal en heartbeat.
- [ ] #15 Limpieza de tokens FCM muertos.
- [ ] #16–#19 + menores.

---

## Orden sugerido de impacto/esfuerzo
1. #1, #3 (fix rápido, alto impacto)
2. #5 (refactor acotado, gran ganancia)
3. Fase 1 Flyway + #6 índices + #7/#8 (rendimiento bajo carga)
4. #4 BigDecimal + #2 constraint (integridad/dinero)
5. #11 geocoding (seguridad/costos)
6. Resto como deuda planificada.
