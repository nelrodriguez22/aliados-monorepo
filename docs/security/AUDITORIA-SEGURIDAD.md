# Auditoría de seguridad — Aliados (front + back)

> Documento vivo. Última auditoría: **2026-07-16** (backend, superficie nueva desde la del
> 2026-07-04: chat, presupuestos, eventos de ciclo de vida, código QR, MdcLoggingFilter).
> Hallazgos A1–A5 más abajo. Auditoría original: **2026-07-04**, rama `ci/docs-no-disparan-build`.
> Metodología: revisión manual de código (SecurityConfig, filtros, controllers, servicios,
> WebSocket, store del front y manejo de secretos). **No** se ejecutaron exploits contra el
> entorno; los PoC descritos son teóricos y deben validarse en un entorno controlado.
>
> Contexto: la app está en **pre-launch** (prod sin usuarios reales, solo dev + 2 testers).
> Es la ventana ideal para arreglar esto antes de que haya datos reales expuestos.

## Cómo usar este documento

Cada hallazgo tiene: severidad, ubicación (`archivo:línea`), descripción, impacto, PoC teórico
y fix propuesto. Al arreglar uno, marcá el checkbox y dejá el commit/PR al lado.

Resumen de estado:

- [x] **SEC-1** (CRÍTICO) — Escalada de privilegios por auto-registro como ADMIN — ✅ resuelto (rama `fix/seguridad-sec1-a-sec4`)
- [x] **SEC-2** (ALTO) — IDOR: lectura de cualquier trabajo por ID — ✅ resuelto (rama `fix/seguridad-sec1-a-sec4`)
- [x] **SEC-3** (MEDIO) — WebSocket: CONNECT no rechaza tokens inválidos → suscripción anónima a `/topic/**` — ✅ resuelto (rama `fix/seguridad-sec1-a-sec4`)
- [x] **SEC-4** (MEDIO) — Fuga de mensajes internos de excepción al cliente — ✅ resuelto (rama `fix/seguridad-sec1-a-sec4`)
- [x] **SEC-5** (BAJO) — "Cifrado" de localStorage con clave embebida en el bundle — ✅ resuelto (rama `fix/seguridad-sec5-a-sec8`): ya no se persiste el `user`; se quitó el AES decorativo
- [x] **SEC-6** (BAJO) — Token de WebSocket viajando por query param del handshake — ✅ resuelto (rama `fix/seguridad-sec5-a-sec8`): eliminado el `WebSocketHandshakeInterceptor` (código muerto)
- [x] **SEC-7** (BAJO) — Logging ruidoso en producción expone UIDs y flujo de auth — ✅ resuelto (rama `fix/seguridad-sec5-a-sec8`): `info`→`debug` en el happy-path que expone UID/email/nombre
- [x] **SEC-8** (BAJO) — `proponerTrabajo` parsea `Map` crudo sin validar tipos → 500 en vez de 400 — ✅ resuelto (rama `fix/seguridad-sec5-a-sec8`): `ProponerTrabajoDTO` con `@Valid`
- [x] **SEC-9** (MEDIO) — La Google Maps API key puede terminar en los logs al loguear `e.getMessage()` — ✅ resuelto (rama `fix/seguridad-sec5-a-sec8`): `redactApiKey()` sanitiza la key antes de loguear
- [x] **SEC-10** (BAJO) — Scope de autorización obsoleto: un proveedor con oferta ya `DURMIO` sigue viendo el trabajo — ✅ resuelto (rama `fix/seguridad-sec5-a-sec8`): acceso limitado a ofertas `OFRECIDA`/`PROPUSO`

> **Nota SEC-7 (parcial):** al arreglar SEC-3 se bajaron a `DEBUG`/`WARN` los logs ruidosos del
> `WebSocketAuthInterceptor` (antes `INFO` con UIDs y emojis). Queda pendiente barrer el resto del código.
>
> **SEC-9 y SEC-10** los detectó la revisión de seguridad automática sobre el PR #6 (los propios fixes
> SEC-2/SEC-4). Como esta rama (`fix/seguridad-sec5-a-sec8`) está apilada sobre PR #6, se resolvieron acá
> junto con SEC-5–8.

---

## SEC-1 — Escalada de privilegios por auto-registro como ADMIN 🔴 CRÍTICO

**Ubicación:**
- `backend/src/main/java/com/aliados/backend/dto/RegisterDTO.java` (`private UserRole role;`)
- `backend/src/main/java/com/aliados/backend/service/UserService.java:89` (`user.setRole(dto.getRole());`)
- `backend/src/main/java/com/aliados/backend/controller/UserController.java:41` (`POST /api/users/register`)
- `backend/src/main/java/com/aliados/backend/entity/UserRole.java` (`CLIENT, PROVIDER, ADMIN`)

**Descripción:** el endpoint público-para-autenticados `POST /api/users/register` acepta el campo
`role` directamente del body y `registerUser` hace `user.setRole(dto.getRole())` **sin validar
que el rol no sea `ADMIN`**. La única verificación es que el token de Firebase corresponda al
`firebaseUid` reclamado — cualquiera puede crearse una cuenta de Firebase y obtener un token válido
para su propio UID.

Como el rol de autorización (`ROLE_ADMIN`) se deriva del rol persistido en la BD
(`FirebaseAuthFilter.resolveAuthority`), un atacante que se registre como `ADMIN` obtiene acceso
total a `/api/admin/**`.

**Impacto:** cualquier persona con capacidad de registrarse (self-signup de Firebase) puede
convertirse en administrador: ver stats, forzar proveedores offline, mandar emails (`/api/admin/test-email`),
gestionar usuarios/oficios/flags, broadcast, etc. **Toma total del panel de administración.**

**PoC teórico:**
1. Crear cuenta en Firebase Auth (email/pass) → obtener ID token del propio UID.
2. `POST /api/users/register` con `{ "firebaseUid": "<propio-uid>", "email": "x@x.com", "role": "ADMIN", "nombre": "x" }` y `Authorization: Bearer <token>`.
3. El usuario queda con `role = ADMIN` en la BD. Tras el TTL del cache de rol (≤5 min), o inmediatamente en instancia fría, `/api/admin/**` responde 200.

**Fix propuesto:**
- Sacar `role` del `RegisterDTO`, o forzarlo server-side a `CLIENT`/`PROVIDER` según el flujo de onboarding.
- **Rechazar explícitamente** `ADMIN` en el registro: `if (dto.getRole() == UserRole.ADMIN) throw new ForbiddenException(...)`.
- Los ADMIN deben crearse solo por un camino privilegiado (seed/migración/endpoint admin-only), nunca por self-service.

---

## SEC-2 — IDOR: lectura de cualquier trabajo por ID 🟠 ALTO

**Ubicación:**
- `backend/src/main/java/com/aliados/backend/controller/TrabajoController.java:45` (`GET /api/trabajos/{id}`)
- `backend/src/main/java/com/aliados/backend/service/TrabajoService.java:139` (`getTrabajoById`)

**Descripción:** `getTrabajoById` recibe solo `@PathVariable Long id`, **no** toma `Authentication`
y **no** verifica que el usuario autenticado sea el cliente o el proveedor asignado. Hace
`findById(id)` y devuelve el DTO. Cualquier usuario autenticado puede iterar IDs (`1, 2, 3, …`)
y leer todos los trabajos.

**Impacto:** exposición de PII y datos de negocio de terceros: nombre del cliente, dirección,
teléfono, precio/tarifa, ubicación (lat/lng), estado. Enumerable secuencialmente (ID `Long`
autoincremental).

**PoC teórico:** con cualquier token válido, `GET /api/trabajos/1`, `/2`, `/3`… → datos de
trabajos ajenos.

**Fix propuesto:**
- Pasar `Authentication` al método y verificar que `uid` sea el cliente **o** el proveedor del trabajo; si no, `403`/`404`.
- Comparar contra el patrón ya usado en `completarTrabajo`/`cancelarTrabajo`, que sí reciben `uid`.
- Revisar si el front realmente necesita este endpoint "abierto"; si es solo para el detalle propio, la verificación de propiedad no rompe nada.

---

## SEC-3 — WebSocket: CONNECT no rechaza tokens inválidos → suscripción anónima 🟡 MEDIO

**Ubicación:**
- `backend/src/main/java/com/aliados/backend/websockets/WebSocketAuthInterceptor.java:44-47`
- `backend/src/main/java/com/aliados/backend/config/WebSocketConfig.java`

**Descripción:** en el `preSend` del canal STOMP, cuando el token es inválido o falta, el
interceptor solo loguea el error y **deja pasar el mensaje** (`return message`) sin setear un
`Principal`. No hay ningún interceptor que rechace `CONNECT` ni `SUBSCRIBE`. El broker simple
expone `/topic` y `/queue`. Las colas por-usuario (`/user/**`) sí quedan protegidas de facto
(sin `Principal` no hay routing), pero **cualquier cliente puede conectarse y suscribirse a
`/topic/**`** (broadcasts). El `allowedOriginPatterns` solo frena browsers; un script/curl ignora
el header `Origin`.

**Impacto:** un cliente no autenticado puede recibir todo lo que se publique en destinos `/topic/*`.
La severidad real depende de qué se emita ahí (verificar los `convertAndSend("/topic/...")` del
código). Si hay datos por-usuario o de negocio en topics compartidos, es fuga de información.

**Fix propuesto:**
- En el interceptor, si el `CONNECT` no trae token válido → **lanzar excepción / no dejar pasar**
  (devolver `null` o `throw`), de modo que la conexión se rechace.
- Migrar cualquier dato sensible de `/topic/{algoCompartido}` a destinos por-usuario (`/user/queue/...`)
  que exigen `Principal`.
- Considerar un `ChannelInterceptor` que exija autenticación también en `SUBSCRIBE`.

---

## SEC-4 — Fuga de mensajes internos de excepción al cliente 🟡 MEDIO

**Ubicación:**
- `backend/src/main/java/com/aliados/backend/controller/GeocodingController.java:57,77,113` (`Map.of("error", e.getMessage())`)
- `backend/src/main/java/com/aliados/backend/controller/UserController.java:58` (`"Token inválido: " + e.getMessage()`)

**Descripción:** varios `catch` devuelven `e.getMessage()` directo al cliente en respuestas 500/401.
Esto puede filtrar detalles internos (rutas, mensajes de librerías, config) útiles para un atacante.

**Impacto:** information disclosure de bajo/medio impacto; ayuda al fingerprinting del stack.

**Fix propuesto:**
- Devolver un mensaje genérico ("Error procesando la solicitud") y loguear el detalle server-side.
- Centralizar en `GlobalExceptionHandler` para no repetir el patrón.

---

## SEC-5 — "Cifrado" de localStorage con clave embebida en el bundle 🟢 BAJO

**Ubicación:** `apps/app/src/shared/store/useStore.ts:8-28`

**Descripción:** el store se persiste "cifrado" con AES usando `VITE_STORAGE_KEY`
(fallback hardcodeado `'aliados-key'`). Cualquier variable `VITE_*` se **inyecta en build y es
visible en el bundle** que corre en el browser. La clave viaja junto al dato cifrado → el cifrado
no aporta confidencialidad real contra alguien con acceso al dispositivo/bundle.

**Impacto:** falsa sensación de seguridad. No es una fuga directa (el store solo guarda el perfil
del usuario, no el token de Firebase, que lo maneja el SDK en IndexedDB), pero puede llevar a
guardar datos sensibles ahí creyendo que están protegidos.

**Fix propuesto:**
- No tratar el localStorage como almacenamiento seguro. Guardar solo datos no sensibles en claro,
  o eliminar el cifrado decorativo para no inducir a error.
- Nunca persistir secretos/tokens en `localStorage`.

---

## SEC-6 — Token de WebSocket por query param del handshake 🟢 BAJO

**Ubicación:** `backend/src/main/java/com/aliados/backend/websockets/WebSocketHandshakeInterceptor.java:18-22`

**Descripción:** el handshake lee `?token=` de la query string y lo guarda en `attributes`.
Los tokens en URLs tienden a quedar en logs de acceso, proxies e historial. Además, ese `token`
guardado en attributes **no se usa** para autenticar (la auth real es por header `Authorization`
en el frame `CONNECT`, SEC-3), así que es código muerto que solo agrega superficie.

**Fix propuesto:** eliminar la lectura del token por query param; usar siempre el header `CONNECT`.
Si se necesita por limitación de SockJS, preferir un token de un solo uso y corta vida.

---

## SEC-7 — Logging ruidoso en producción expone UIDs y flujo de auth 🟢 BAJO

**Ubicación:** `backend/src/main/java/com/aliados/backend/websockets/WebSocketAuthInterceptor.java:24,28,43`

**Descripción:** el interceptor loguea a nivel `INFO` cada `preSend`, la presencia del header de
auth y el UID autenticado (con emojis). En producción esto ensucia logs y expone identificadores
de usuario y el flujo de autenticación.

**Fix propuesto:** bajar a `DEBUG` (o quitar), y evitar loguear UIDs en `INFO`.

---

## SEC-8 — `proponerTrabajo` parsea `Map` crudo sin validar tipos 🟢 BAJO

**Ubicación:** `backend/src/main/java/com/aliados/backend/controller/TrabajoController.java:111-128`

**Descripción:** el body llega como `Map<String, Object>` y se castea a mano
(`(Integer) body.get(...)`, `(Number) body.get(...)`). Tipos inesperados producen
`ClassCastException` → `500` en vez de un `400` de validación. No es una vuln grave, pero es
robustez/DoS menor y superficie de error mal manejada.

**Fix propuesto:** usar un DTO con `@Valid` (como en `crearTrabajo`) en vez de `Map` crudo, con
tipos y validaciones declarativas.

---

## SEC-9 — La Google Maps API key puede filtrarse a los logs 🟡 MEDIO

**Ubicación:** `backend/src/main/java/com/aliados/backend/controller/GeocodingController.java`
(los tres `catch` de `reverse`/`forward`/`autocomplete`)

**Descripción:** al resolver SEC-4 se movió `e.getMessage()` de la respuesta al cliente hacia
`logger.warn("... {}", e.getMessage())`. La URI que arma el controller incluye
`.queryParam("key", apiKey)`. Si `RestTemplate` falla con una excepción de red
(`ResourceAccessException`), su mensaje puede incluir la URL completa **con `?key=<GOOGLE_MAPS_API_KEY>`**,
que termina persistida en los logs.

**Impacto:** exposición del secreto (API key de Google Maps) a cualquiera con acceso a los logs.
Regresión introducida por el propio fix de SEC-4.

**PoC teórico:** provocar un timeout/IO error hacia `maps.googleapis.com` (p. ej. red caída) →
el `logger.warn` escribe la URL con la key.

**Fix propuesto:** no loguear `e.getMessage()` crudo. Redactar la `apiKey` del mensaje antes de
loguear (o loguear solo `e.getClass().getSimpleName()`). Idealmente, un helper que sanitice el
secreto de cualquier string de log.

> Detectado por la revisión de seguridad automática del PR #6. ✅ Resuelto en `fix/seguridad-sec5-a-sec8`.

---

## SEC-10 — Scope de autorización obsoleto en `getTrabajoById` 🟢 BAJO

**Ubicación:** `backend/src/main/java/com/aliados/backend/service/TrabajoService.java`
(`puedeVerTrabajo`, introducido en SEC-2)

**Descripción:** el chequeo de acceso usa
`trabajoOfertaRepository.findByTrabajoIdAndProveedorId(...).isPresent()` sin filtrar por
`ResultadoOferta`. Una oferta que ya terminó en `DURMIO` (el trabajo se resolvió sin ese proveedor)
**deja la fila en la tabla**, así que ese proveedor sigue autorizado a ver el trabajo de forma
indefinida (dirección del cliente, quién lo tomó, desenlace).

**Impacto:** fuga de información acotada a proveedores que en algún momento recibieron la oferta.
Menor (ya habían visto el trabajo al ser ofertados), pero el acceso debería expirar con la oferta.

**Fix propuesto:** limitar el acceso a ofertas activas (`OFRECIDA` o `PROPUSO`), excluyendo `DURMIO`.
El proveedor finalmente asignado ya está cubierto por la rama `trabajo.getProveedor()`.

> Detectado por la revisión de seguridad automática del PR #6. ✅ Resuelto en `fix/seguridad-sec5-a-sec8`.

---

## Auditoría 2026-07-16 — superficie nueva del backend

Re-verificado y sólido: SEC-1 sigue cerrado (`UserService` rechaza `role=ADMIN` en el registro);
SEC-3 sigue cerrado (CONNECT del WS rechaza tokens ausentes/inválidos); chat con IDOR cubierto
(`ChatService.autorizar()` en los 4 paths, `SecurityException`→403 con handler dedicado; contenido
capado a 2000, imagenUrl con prefijo Cloudinary + 500 chars, paginación capada a 100, log inmutable);
presupuestos con `@Valid` + `@Positive` + authz de dueño; actuator expone solo `health,info`;
`/api/admin/**` (incl. eventos #45) bajo `hasRole(ADMIN)`; firma de Cloudinary pinnea el folder.

- [x] **A1** (MEDIO-BAJO) — `MdcLoggingFilter` reflejaba `X-Request-Id` sin sanitizar (input del
  cliente → cada línea de log + response header, sin límite de largo ni charset) — ✅ resuelto:
  allowlist `[A-Za-z0-9_-]{1,64}`, lo que no matchea se descarta y se genera UUID propio.
- [x] **A2** (BAJO) — `POST /api/uploads/signature` sin `tipo` hacía `valueOf(null)` → NPE: el
  handler devolvía 400 pero lo reportaba a Sentry como bug y con mensaje opaco — ✅ resuelto:
  null-check explícito → `IllegalArgumentException` con mensaje claro, sin ruido en Sentry.
- [ ] **A3** (BAJO) — Sin rate limiting en ningún endpoint (envío de chat, firma de uploads
  → costo Cloudinary, registro). Aceptado en pre-launch; **item obligatorio del checklist de
  lanzamiento** (bucket4j o rate limit del edge).
- [x] **A4** (INFO) — `permitAll` fantasma en `SecurityConfig`: `/app/**`, `/topic/**`,
  `/queue/**`, `/user/**` son destinos STOMP, no rutas HTTP; no hacían nada hoy pero un
  controller futuro mapeado ahí nacería público — ✅ resuelto: removidos (queda solo `/ws/**`,
  el handshake real; la auth del WS vive en el interceptor de CONNECT).
- [x] **A5** (INFO) — Spring Security imprimía el password generado del usuario default en cada
  arranque (inutilizable acá, pero un secreto-que-no-es-secreto en los logs de Railway) —
  ✅ resuelto: `@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)`.

## Cosas que se revisaron y están OK (para no re-auditar)

- **CORS**: allowlist explícita de orígenes (app + landing + localhost), sin `*` con credenciales. ✅
- **Secretos backend**: `application.properties` usa `${ENV_VAR}`, sin valores hardcodeados. ✅
- **`.env` / credenciales**: no hay `.env` ni service-accounts versionados; `.gitignore` los cubre. ✅
- **Mass-assignment en `PUT /api/users/me`**: `updateProfile` usa allowlist explícita (nombre, teléfono, localidad, foto), no permite tocar `role`/`activo`. ✅
- **Rol de seguridad**: se deriva del rol en BD, no del cliente (`FirebaseAuthFilter`). ✅ (pero ver SEC-1: el rol en BD se puede envenenar en el registro).
- **Inyección en geocoding**: `UriComponentsBuilder` + `.encode()` evita inyección de parámetros. ✅
- **XSS front**: no se encontró `dangerouslySetInnerHTML`, `eval`, `innerHTML` ni `document.write`. ✅
- **Anti-enumeración**: `resend-verification` responde genérico y con cooldown por email. ✅
- **CSRF**: deshabilitado correctamente (API stateless con Bearer token, sin cookies de sesión). ✅
</content>
