# Informe de mejoras — Backend Aliados

> Documento vivo para retomar entre sesiones. Marcá los TODOs a medida que se resuelven.
> Última actualización: 2026-07-04

Stack: Spring Boot 3.4.2 · Java 21 · PostgreSQL · Firebase Auth · WebSocket STOMP · SendGrid · FCM.

---

## 🗓️ Resumen sesión 2026-07-02 → 04

**Qué se hizo:**

1. **`/me` responde 200 en vez de 404 para usuario nuevo** (`fcd6e05`, en `main`): el chequeo de "¿existe en backend?" usaba el 404 de `GET /api/users/me` como señal → onboarding, y el navegador lo logueaba en consola aunque el código lo manejara. Ahora `/me` devuelve `200 { registered:false }`; `UserResponseDTO.registered` default `true` (retrocompatible). Front detecta el flag en `fetchProfile` y `Login`.
2. **CI ahora corre los tests del backend** (`729a92b`, `45f3663`, `bd793dd`, en `main`): antes solo compilaba. Se arregló un test obsoleto (`UsuarioAdminServiceTest` afirmaba `null` en vez de `""` tras el fix `lower(bytea)`) y se reemplazó el `contextLoads` roto por `SchemaMigrationIT` (`@DataJpaTest` + **Testcontainers Postgres**, `@Tag("integration")`). El job `backend` del CI corre `./gradlew test` + `integrationTest` (los runners de GitHub traen Docker). ⚠️ Local no hay Docker → la validación real del esquema es en CI.
3. **Feature: ofertas por grupos + penalización de no-respuesta** (PR **#2**, mergeado a `main` como `f7dde1b`). Reemplaza la asignación 1:1 por ofertas en grupos. Resuelve el hallazgo "ofertas dormidas" (ver abajo). Diseño y plan en `docs/superpowers/`. 14 commits, 68 tests, implementado tarea-por-tarea con review por-tarea + review final de rama.
4. **Limpieza de flags admin** (PR **#3**, _abierto_): `V9` elimina los flags huérfanos `trabajo_oferta_timeout1_min`/`timeout2_min` (sin uso tras el modelo nuevo) y se agregan descripciones de los 3 flags nuevos en `FeatureFlagsPanel`.

**Modelo nuevo de asignación (reemplaza `proveedorNotificadoId` 1:1):**
- Nueva tabla `trabajo_oferta` (proveedor × trabajo: `grupo`, `ofrecidoAt`, `respondioAt`, `resultado` ∈ OFRECIDA/PROPUSO/DURMIO). Es a la vez estado vivo (grupo actual = filas OFRECIDA) e historial para el score.
- El trabajo se ofrece al **top-N por score** (`trabajo_oferta_grupo_tamano`, default 10); si en **N min** (`trabajo_oferta_grupo_intervalo_min`, default 5) nadie propone, se marca DURMIO al grupo y se avanza al siguiente; se agota → cancela. Dentro del grupo es **carrera**: el 1º que propone gana (lock atómico `tomarTrabajoSiPendiente`).
- **Score:** nuevo 4º factor `tasaRespuestaOfertas = PROPUSO/(PROPUSO+DURMIO)`, peso `score_peso_respuesta_ofertas` (default 0.20), configurable en admin. La velocidad se calcula sobre `trabajo_oferta`.
- **Concurrencia:** el marcado DURMIO del scheduler es un UPDATE condicional (`marcarGrupoDurmioSiPendiente`) que no pisa un PROPUSO y solo actúa si el trabajo sigue PENDIENTE (cierra la carrera scheduler-vs-propose que detectó el review final).

**⚠️ Deploys pendientes:**
- **Mergear PR #3** (limpieza de flags).
- **Deploy backend (Railway):** corre las migraciones V7/V8 (y V9 al mergear #3) y activa los flags nuevos. Verificar que el CI (`integrationTest`) quedó verde en `main` tras el merge de #2.

**Follow-ups del review final** (documentados, no bloquean) → ver "⏭️ Próxima sesión (pendiente)".

---

## 🗓️ Resumen sesión 2026-06-26 → 29

**Qué se hizo (todo commiteado y pusheado a `main`):**

1. **Dashboard admin — proveedores en tiempo real:** paginado de a 10 (`« ‹ N › »`) + filtro de búsqueda sobre todos los activos. (`02d5da0`)
2. **Sistema de ponderación (scoring) — testeado y validado en prod:** 8 tests en `ProviderScoreServiceTest` (orden por calificación, proveedor nuevo neutral, cruces multifactor 1★-rápido vs 5★-lento, ambos 5★). Prueba E2E real con cuentas: confirmado que excelente (5★, score 70) le gana al medio (3★, 50). (`02d5da0`)
3. **Bugs reales cazados y arreglados (validados en prod):**
   - **Trabajo activo del proveedor** no aparecía tras aceptar: la query `['trabajo-activo']` tiene `enabled: isBusy` y `isBusy` no se actualizaba en vivo → se invalida `auth-profile` en `PROPUESTA_ACEPTADA`. (`99389ff`)
   - **Aceptar propuesta** no iba al seguimiento (mostraba "no disponible"): rebote por cache `['trabajo', id]` stale → `setQueryData` con la respuesta. (`6f3217b`) + **back-button**: la propuesta consumida ahora redirige por estado en vez de cartel muerto + `replace:true`. (`a6c4182`)
   - **`/api/admin/usuarios` 400** con `q` vacío (`lower(bytea)`): el `q` null reventaba en `LOWER(:q)` → viaja como `""`. (`00ae97b`)
4. **Hallazgo de seguridad (review de commit) — fuga de datos entre usuarios:** el `api-cache` del SW (por-origen) cacheaba respuestas autenticadas → `/api` pasó a **network-only** + purga del cache legacy en arranque/logout. (`96a7ff7`)
5. **Hardening del Service Worker (3 capas):** (1) api-cache → network-only; (2) `autoUpdate → prompt` con banner "Nueva versión disponible" + chequeo de updates 5min + `window.focus`; (3) **version-gate forzado** vía Remote Config + panel admin (`__APP_VERSION__`, `/version.json`, `VersionGate`, `AppVersionGateService`, `VersionGatePanel`). (`d8e0d85`, `ebecaf0`, `1fe782d`)
6. **Payloads / redes lentas:** compresión gzip en el backend; slim de DTOs (`OficioResponseDTO` reemplaza la entidad embebida, `UserResponseDTO` sin `firebaseUid/createdAt/updatedAt`); **timeout de 15s en `apiClient`**; estados de **error con reintento** en `ClientDashboard`/`ProviderDashboard`; usuarios admin **on-demand**; `staleTime` en oficios admin. (`fe06bc2`, `e6407a8`, `fe043e5`, `f338c0a`)
7. **UX admin:** tooltips de ayuda detallados en feature flags (por flag) y en cada sección del tab Estadísticas; variante `multiline` del `Tooltip`. (`2055148`)
8. **Otros:** posición del toast; auto-online del proveedor al entrar al dashboard (interino hasta la feature de horario). (`eff4869`, `d2c5700`)

**⚠️ Deploys pendientes para que tome efecto todo:**
- **Backend (Railway):** compresión gzip, DTOs slim, endpoint `/api/admin/version-gate`, fix `lower(bytea)`. Hasta redeployar, esos cambios no están vivos.
- **Remote Config:** el param `min_app_version` se crea con el primer PUT desde el `VersionGatePanel` (o a mano en la consola de Firebase).
- FE se viene desplegando solo con cada push (Firebase Hosting via CI).

**Qué resta** → ver "⏭️ Próxima sesión (pendiente)" abajo (features grandes: multi-oficio hasta 3, horario de trabajo; hallazgo de producto: validación de matrícula). _Ofertas dormidas: RESUELTO (2026-07-02, ver abajo)._

---

## ⏭️ Próxima sesión (pendiente)
- [ ] **Feature: hasta 3 servicios (oficios) por proveedor (2026-06-28).** Hoy el modelo es de **un solo oficio** (`User.oficio` único). Pasar a **multi-oficio con tope 3**. **Impacto:** (1) **Datos:** `users` 1:1 oficio → **N:M** vía tabla `usuario_oficios` (FK user + FK oficio), con validación de **máx 3**. Migración Flyway + backfill (mover el `oficio_id` actual a una fila). (2) **Matching:** `findProveedoresDisponibles` filtra por `u.oficio.id = :oficioId` → cambiar a "el oficio del trabajo está **entre los del proveedor**" (join a `usuario_oficios`). El trabajo sigue teniendo **un** oficio; lo que se vuelve lista es el proveedor. (3) **DTOs:** `UserResponseDTO.oficio` (single) → `oficios` (lista). El front lee `profile.oficio` en onboarding/perfil (cambia a lista) y `trabajo.oficio` (queda single, no se toca). (4) **Onboarding:** selección de **hasta 3** oficios (hoy 1). (5) **Límites/scoring:** el límite de trabajos es por proveedor (no por oficio), así que no cambia; revisar `getLimiteTrabajos`. (6) **Auth de fletes** (`esProveedorDeFletes`) hoy mira el oficio único → revisar con la lista.
- [ ] **Feature: horario de trabajo del proveedor → auto online/offline (2026-06-27).** Que el proveedor configure una franja (ej. 9-18, opcional por día) y el sistema lo ponga ONLINE/OFFLINE solo. **Reemplazaría** el "auto-online al entrar" (interino, ya hecho en `ProviderDashboard`). **Impacto backend evaluado:** (1) **datos** (chico): columnas en `users` o tabla `horario_trabajo` (`activo`, `inicio`/`fin` TIME, opc. `dias`) + migración Flyway + `PATCH /api/users/me/horario`. (2) **Scheduler** (medio, el corazón): `@Scheduled` (~5 min, estilo `TrabajoEscalationScheduler`) que pone ONLINE/OFFLINE según la franja; **no toca BUSY**. (3) **Timezone** (cuidado): el horario es hora AR pero el server corre en UTC → comparar con `ZoneId.of("America/Argentina/Buenos_Aires")`. (4) **⚠️ Precedencia manual vs auto (el diseño clave):** el scheduler debe actuar **solo en los bordes** (a las 9 online una vez, a las 18 offline una vez) y respetar lo manual dentro de la franja, si no pelea con el toggle (ej. proveedor que se va a almorzar). Requiere trackear la transición ya aplicada (cruce de borde entre ticks). (5) **WS notify** (chico): emitir el cambio de status como los demás. Bordes: franjas que cruzan medianoche, días libres, proveedor sin horario (queda manual). _El 80% del diseño está en la regla manual-vs-automático; conviene brainstorming antes de codear._

- [~] **Payloads de endpoints + UX de redes lentas (2026-06-27).** Auditoría del hot path + primer batch HECHO:
  - **[x] Compresión HTTP gzip** (`application.properties`): `server.compression.enabled` + mime-types JSON + `min-response-size=1024` → ~70-80% menos bytes. _Mayor impacto/menor esfuerzo._
  - **[x] Slim de `oficio`**: nuevo `OficioResponseDTO {id,nombre,icono}` reemplaza la entidad `Oficio` embebida en `TrabajoResponseDTO` y `UserResponseDTO` (saca los flags internos `activo`/`exclusivo` de cada item de cada lista). Shape anidado igual → front no se toca (lee `oficio.nombre/icono/id`).
  - **[x] Slim de `UserResponseDTO`**: sacados `firebaseUid`, `createdAt`, `updatedAt` (el front no los consume; `firebaseUid` lo toma del SDK).
  - **[x] DTO "resumen" para listas (#3) — ya estaba resuelto:** las listas usan `mapToDTOOptimized`, que **ya excluye `fotos`** (el campo grande). Además `fotos` **ya no es base64** sino URLs de Cloudinary (migración #20 hecha) → se corrigió el comentario stale que decía "base64 ~MB". Lo único de más en listas (`descripcion`/coords) son cientos de bytes/item → no rentable, se deja.
  - **[~] UX redes lentas:**
    - **[x] Timeout en `apiClient`** (15s, AbortController): sin esto, en red lenta/caída la UI quedaba cargando indefinidamente. Al vencer aborta y (en GET) reintenta con el backoff existente, o lanza error claro ("La conexión está lenta…"). Crítico ahora que `/api` es network-only.
    - **[x] Ya existía:** retry con backoff de GETs ante 5xx/error de red (`apiClient`), skeletons en dashboards, `retry:1` en React Query.
    - **[x] Estados de error con reintento en los dashboards:** `ClientDashboard` (Trabajos activos + Historial) y `ProviderDashboard` (Trabajos disponibles + Historial) ahora muestran `ErrorState` compact con botón "Reintentar" (refetch de la query) cuando una query falla/vence, en vez del estado vacío engañoso ("No tenés trabajos" cuando en realidad falló).
- [x] **Capa 3 del SW: version-gate forzado vía Remote Config — HECHA (2026-06-28).** Para deploys rompedores: bumpeás el mínimo y los clientes viejos quedan forzados a actualizar. **Cómo funciona:** (FE) `vite.config` inyecta `__APP_VERSION__` = `github.run_number` (monotónico; build local = 0) y emite `/version.json` (no se precachea → lectura a la red real). `VersionGate.tsx` (en `App.tsx`, envuelve todo) compara `__APP_VERSION__` vs `min_app_version` (Remote Config, vía `remoteConfig.ts::fetchMinAppVersion`, poll 5min+focus, fail-open=0); si es menor, pantalla "Actualizá la app" con hard-reset de SW+cachés (evita loop). (BE) `AppVersionGateService` + `VersionGateAdminController` (`GET/PUT /api/admin/version-gate`) escriben `min_app_version` en el template de Remote Config (mismo patrón que `MaintenanceService`). (Admin) `VersionGatePanel` en el tab Configuración: lee `/version.json` en vivo (cache-busted) y un botón "Forzar a la versión deployada (N)" → setea `min_app_version=N` con el número que SÍ está sirviendo (imposible bumpear a una versión no-online → sin loop) + "Desactivar forzado". **Uso:** deploy rompedor → esperar a que esté vivo → admin → "Forzar a N". Normales → banner suave (Capa 2). _Pendiente: crear el param `min_app_version` en Remote Config (o lo crea el primer PUT) + redeploy._
- [x] **Capas 1 y 2 del SW — HECHAS (2026-06-26).** (1) **`/api` ya NO se cachea (network-only)** — se quitó el `runtimeCaching` del `api-cache`. _Decisión por seguridad:_ el review de commit detectó **fuga de datos entre usuarios** — el Cache Storage es por-origen (no por-usuario), así que cachear respuestas autenticadas podía servirle a un usuario datos cacheados de otro en el mismo dispositivo (vector preexistente; primero se acotó a TTL 60s, después se eliminó). Se purga el `api-cache` legacy en el arranque (`main.tsx`) y en logout (`useStore`) para limpiar dispositivos que vienen de versiones previas. El app-shell sigue precacheado (abre offline); las llamadas de API fallan con su error normal. (2) `registerType: 'autoUpdate' → 'prompt'` (sin `skipWaiting` automático): `PWAUpdateProvider.tsx` registra el SW y expone el estado; `PWAUpdateBanner.tsx` muestra un **banner "Hay una nueva versión disponible / Recargar"** en `MainLayout` (mismo lugar que el banner de mantenimiento, en tono brand para distinguirlo del amber). Chequea updates al volver el foco + cada 30 min (las pestañas largas detectan deploys sin recarga completa). Verificado en `dist/sw.js` (skipWaiting solo por mensaje; api-cache con maxAge 60). _Pendiente: redeploy FE._
- [x] **Dashboard del proveedor no mostraba el trabajo activo tras aceptar la propuesta — RESUELTO (2026-06-26).** Reproducible **siempre** (no intermitente): al aceptar el cliente la propuesta (trabajo → EN_CURSO, proveedor → BUSY), el dashboard del proveedor **no mostraba el trabajo activo hasta recargar**. **Root cause:** la query del trabajo activo (`ProviderDashboard.tsx:134`) tiene `enabled: isBusy`, e `isBusy` sale de `user.status` del store (`:124-126`). Al aceptar, el backend pasa el proveedor a BUSY pero el front **no se entera en vivo** → `isBusy` sigue `false` → la invalidación de `['trabajo-activo']` del handler WS (`useWebSocket.ts`, caso `PROPUESTA_ACEPTADA`) es **no-op** (React Query no refetchea una query con `enabled:false`). Solo al recargar, `useProfile` re-fetchea `/api/users/me`, llama `login(user)` con `status:BUSY` → `isBusy` true → la query se habilita y carga. **Fix:** en el handler `PROPUESTA_ACEPTADA` agregar `invalidateQueries(['auth-profile'])` → refetch del perfil → `login(user)` BUSY → `isBusy` true → la query `trabajo-activo` se habilita y carga sola. `tsc` OK. _Pendiente: redeploy FE._ _A verificar (posible bug simétrico): al completar (BUSY→ONLINE) que el trabajo activo se limpie solo; y revisar otras queries con `enabled:isBusy`/`isOnline` que dependan de un cambio de status server-side no notificado._
- [x] **UX: pantalla de propuesta tras aceptar — RESUELTO de verdad (2026-06-26).** Al aceptar una propuesta, `ClientProposal.tsx` quedaba mostrando "Esta propuesta ya no está disponible" en vez de ir al seguimiento. **(Primer intento equivocado:** se creyó que `data.id` venía undefined y se cambió a `jobId` — pero `apiClient.patch` devuelve el body y el DTO trae `id`, así que era un no-op; commit `99389ff` no arregló nada.) **Causa real — carrera de caché:** `useTrabajo` comparte la key `['trabajo', id]`. Al aceptar, `onSuccess` invalidaba solo `['trabajos-cliente']`, NO esa key → al navegar a `/seguimiento/:id`, `JobTracking` (`:45-46`) leía el trabajo cacheado **todavía en `PROPUESTO`** y su `useEffect` **redirige a `/propuesta/:id` si estado === 'PROPUESTO'** → rebote → `/propuesta` re-fetchea (ya EN_CURSO/EN_COLA) → cartel "no disponible". **Fix:** en `onSuccess(data)` sembrar `queryClient.setQueryData(['trabajo', jobId], data)` con la respuesta (estado ya EN_CURSO/EN_COLA) antes de navegar, así `JobTracking` lee el estado fresco y no rebota. `tsc` OK. _Pendiente: redeploy FE._ _Lección: verificar la premisa antes de "arreglar" (el primer fix se basó en una suposición sin comprobar)._
- [ ] **Nota de testing — denormalizados por SQL directo causan lecturas stale (2026-06-26).** Editar `users.promedio_calificacion`/`cantidad_calificaciones` con un `UPDATE` directo en la DB **no se refleja de inmediato** en el scoring: el backend puede tener la entidad `User` cacheada con el valor viejo hasta que el caché se refresca (~minutos). Vivido en la prueba de ponderación: el primer trabajo se asignó al "medio" porque el "excelente" se leyó con su calificación pre-`UPDATE` (empate en 50). **No es bug de prod** — el flujo real crea calificaciones vía `CalificacionService.crearCalificacion`, que recalcula y persiste el denormalizado por Hibernate (lecturas frescas). Solo aplica a ediciones manuales de testing: tras un `UPDATE` manual, esperar/refrescar antes de probar.
- [ ] **Validación de la matrícula del proveedor (2026-06-26).** Hoy la `matrícula` se guarda en `User` (`RegisterDTO`/`UserService:93`) y se pide en el onboarding del proveedor (`OnboardingGoogle.tsx`), pero la **única validación es que no esté vacía** (`!matricula.trim()`) — no se valida formato ni que sea real/exista. Definir: ¿validación de formato?, ¿chequeo contra un registro/padrón oficial?, ¿revisión manual del admin antes de habilitar al proveedor? Hoy cualquiera se registra como proveedor con una matrícula inventada.
- [x] **Ofertas "dormidas" no tienen costo en el score — RESUELTO (2026-07-02, PR #2).** Cuando una oferta llega al proveedor y la deja sin aceptar ni rechazar:
  - **Comportamiento actual:** el `TrabajoEscalationScheduler` corre cada 60s. Tras `trabajo_oferta_timeout1_min` (prod 30 min) re-ofrece al **siguiente mejor disponible** (excluye al que durmió), `reintentos=1`, avisa al cliente "seguimos buscando". Tras `trabajo_oferta_timeout2_min` (prod +15 min) **cancela** el trabajo. → **un solo re-ofrecimiento** antes de cancelar (aunque haya #3, #4 disponibles); el cliente puede esperar ~45 min.
  - **Hallazgo:** dormir **o rechazar** una oferta **no afecta el score** del proveedor. Los 3 factores se calculan sobre `t.proveedor` (asignado, solo se setea al **aceptar**, `TrabajoService:564`) o sobre `propuesto_at`. Una oferta ignorada/rechazada deja el trabajo `PENDIENTE` sin `proveedor` y sin `propuesto_at` → **invisible** al scoring (`rechazarTrabajo:156` pone `proveedorNotificadoId=null` sin tocar `t.proveedor`).
  - **Implicancia:** la "tasa de aceptación" (`countPropuestasEnviadasByProveedorId`/`...Aceptadas`) **no** mide "ofertas aceptadas/recibidas" sino, de los trabajos **que tomó**, cuántos completó vs canceló. Incentivo perverso: ignorar ofertas no convenientes y agarrar solo las jugosas no baja el score.
  - **Opciones a decidir:** (a) penalizar la no-respuesta con una "tasa de respuesta a ofertas" real (registrar ofertas vencidas por proveedor); (b) más reintentos antes de cancelar (escalar al #3, #4…); (c) acortar timeout1 (30 min es mucho); (d) dejarlo así para el volumen pre-launch.
  - **✅ RESUELTO (PR #2):** se hizo (a) + (b) juntas con un rediseño del modelo de asignación. Nueva tabla `trabajo_oferta` (registra cada oferta por proveedor con `resultado` PROPUSO/DURMIO). El trabajo se ofrece al **top-10 por score a la vez**; si nadie propone en 5 min, se marca DURMIO al grupo y se pasa al siguiente (hasta agotar → cancela) — ya no un solo re-ofrecimiento. Nuevo 4º factor de score `tasaRespuestaOfertas = PROPUSO/(PROPUSO+DURMIO)`, peso `score_peso_respuesta_ofertas` (0.20) configurable en admin → dormir/rechazar **sí** baja el ranking. Detalle en el resumen de sesión 2026-07-02 arriba y en `docs/superpowers/{specs,plans}/2026-07-02-ofertas-por-grupos*`.
  - **Follow-ups del review final (pendientes, no bloquean):**
    - [ ] **Timeout de aceptación del cliente.** El scheduler solo escala trabajos `PENDIENTE`. Si el cliente nunca resuelve una propuesta (`PROPUESTO`), las ofertas del resto del grupo quedan `OFRECIDA` colgadas sin cerrar. Falta un barrido de propuestas `PROPUESTO` estancadas (gap pre-existente: no hay timeout de aceptación del cliente).
    - [ ] **`Trabajo.reintentos` vestigial** — ya no se lee/escribe en el modelo nuevo; drop de columna cuando convenga.
    - [ ] **`RuntimeException` desnuda** para "el trabajo ya no está disponible" (perdedor de la carrera en `proponerTrabajo`) → excepción tipada 409 (`ConflictException`).
    - [ ] **Pulidos de tests** menores (bordes de velocidad null→50/0→100 con la nueva fuente; `ArgumentCaptor` de identidad en vez de conteo; comentarios/nombres de test stale).
- [x] **Login con botón de Google — RESUELTO (2026-06-20).** Tenía **3 capas** que se fueron destapando una por una:
  1. **CSP `frame-src`**: no permitía el iframe de Firebase Auth → agregado `https://aliados-web-22.firebaseapp.com` + `https://apis.google.com` en `firebase.json` (ambas políticas).
  2. **Google Cloud Console (`redirect_uri_mismatch`)**: el cliente OAuth `578160153411-...` no tenía registrado el redirect URI `https://aliados-web-22.firebaseapp.com/__/auth/handler` ni los JavaScript origins (los 3 dominios + localhost). Se habían "perdido"; se re-registraron.
  3. **App auth-flow (código)**: el post-login se manejaba **solo en el `.then()` del popup**, pero en mobile/incógnito Google cae a **signInWithRedirect** → recarga la página → ese callback nunca corría → el usuario nuevo quedaba en `/login`. Fix: `Login.tsx` rutea reactivamente a onboarding cuando `useProfile` detecta usuario nuevo (404), y `OnboardingGoogle.tsx` usa `useFirebaseAuth()` reactivo (en vez de `auth.currentUser` síncrono que rebotaba durante el limbo de init tras el reload).
  - Verificado end-to-end: Google → onboarding (rol → teléfono → zona) → registro OK.
  - Mejora opcional a futuro: usar `authDomain` = dominio propio (`aliados-app.convivirtech.com.ar`) para evitar el hop a `firebaseapp.com`.

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
- [x] #19 Logging bajado (2026-06-18). `logging.level.org.hibernate.SQL` DEBUG → **WARN** (ya no loguea cada query en prod: ruido/overhead/fuga). `ddl-auto=validate` y `show-sql=false` ya estaban (Fase 1). ✅ **Riesgo de ratio resuelto (2026-06-18, refactorizado como feature flag):** `mudanza_ratio_tiempo` ya **no** es `@Value`/env-var. Es un **feature flag en DB** (tipo NUMBER), sembrado en `1.0` (prod-seguro por Flyway). Se gestiona en tiempo real desde el panel de administración sin redeploy. La variable de entorno `MUDANZA_RATIO_TIEMPO` ya no es leída; eliminarla de Railway si aún está seteada. El flag en prod debe estar en `1.0` (confirmado por seed).
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

## Load testing / Capacidad (2026-06-19)

Tests con **k6** (`/loadtest/`) contra prod (Railway + Neon pooled), tras las mejoras de esta semana. Scripts: `dashboard.js` (lecturas), `websocket.js` (conexiones STOMP), `write.js` (transaccional, opcional).

**Resultados (no se alcanzó el techo en ninguno):**

| Test | Carga | Resultado |
|---|---|---|
| **Lecturas** (`dashboard.js`) | 600 VUs, SLEEP=4s → 62 batches/s (~**7.500 usuarios-equivalente** a polling 120s) | p95 **541ms**, p99 786ms, **0% errores** (125k checks). No es el cuello. |
| **WebSocket** (`websocket.js`) | **1.000 conexiones STOMP simultáneas** (HOLD 120s) | **0 errores**, handshake p95 680ms, time-to-CONNECTED p95 936ms. No se cayó ninguna. |
| Baseline (50 VUs) | 50 VUs, SLEEP=5s | p95 285ms, avg≈min (sin contención) |

**Conclusión:** la plataforma soporta **≥1.000 usuarios online simultáneos** (límite real = conexiones WS = RAM de la instancia) en una sola instancia, sin errores y con margen (no se rompió). El throughput de requests no es restricción (~7.500 equiv). Valida —por el lado optimista— la estimación de 500-1.500.

**Señales de saturación incipiente:** a 600 VUs el `avg` de requests se despegó del `min` (288 vs 117ms) y a 1.000 WS el tiempo de conexión subió a ~0.9s p95. Son la "rampa" antes del knee; el techo está por encima.

**Caveats:** dataset de un solo usuario de prueba (optimista vs datos reales variados); una sola instancia (escala vertical → más RAM = más conexiones; horizontal recién con Redis/broker, ver Email opcional y notas de in-memory state). El escenario de **escritura** no se corrió (rate de creación bajo en este negocio → no es riesgo de capacidad).

## Observabilidad (2026-06-19)

**Sentry** integrado en backend y frontend (error monitoring + tracing). Se activa por **env var**; si el DSN está vacío queda apagado (cero overhead).

- **Backend** (`sentry-spring-boot-starter-jakarta` 8.44.1): config en `application.properties` (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` default 0.2, `send-default-pii=false`). **NO se incluyó `sentry-logback`** a propósito: el `GlobalExceptionHandler` loguea los errores de negocio (400) en ERROR, así que capturar por logback sería ruido. En su lugar, captura explícita: `handleGenericException` (500) siempre; `handleRuntimeException` solo si es **subclase** de RuntimeException (NPE/IllegalState = bugs reales), no el `new RuntimeException("msg")` pelado (negocio).
- **Frontend** (`@sentry/react` 10.59): `src/instrument.ts` (init gateado por `VITE_SENTRY_DSN`), importado primero en `main.tsx`; `reactErrorHandler` en `createRoot` (React 19); tracing de navegación con `reactRouterV7BrowserTracingIntegration` (+ `withSentryReactRouterV7Routing` en `AppRouter`); Session Replay (10% sesiones / 100% con error, texto y media enmascarados); `tracePropagationTargets` a los dominios del backend (trace distribuido front→back). Source maps vía `@sentry/vite-plugin` **condicional** a `SENTRY_AUTH_TOKEN` (no rompe el build local).
- **Pendiente de activación (env vars):** crear cuenta Sentry + 2 proyectos → setear `SENTRY_DSN` en Railway y `VITE_SENTRY_DSN` en el build del front; opcional `SENTRY_AUTH_TOKEN/ORG/PROJECT` para subir source maps.
- **Uptime monitor** (BetterStack/UptimeRobot) sobre `/actuator/health` → pendiente de configurar (fuera del repo).
- **Activación (2026-06-19):** el DSN del front se inyecta en el build de CI vía `deploy.yml` (estaba fallando porque `.env.production` está gitignoreado y el CI buildea con secrets, no con ese archivo). Proyectos Sentry: `convivir/<react>` (front, DSN ...4511298063761408) y `convivir/java-backend` (back, DSN ...4511595138777088 → env `SENTRY_DSN` en Railway). ⚠️ **NO usar** el agente OTel (`-javaagent`) — usamos el starter de Spring; **`send-default-pii=false`** (no el `true` que sugiere el wizard).
- ⚠️ **Source context de Java descartado:** el plugin `io.sentry.jvm.gradle` 6.12.0 rompe el build con Gradle 8.x del proyecto (`Could not create task ':sentryUploadSourceBundleJava' … SentryCliExecTask.setIgnoreExitValue`). Se removió. Error monitoring funciona igual (vía starter); los stacktraces de Java van sin snippets de fuente. Revisar una versión compatible del plugin a futuro si se quiere source context.

### Decisión: ELK (Elasticsearch + Kibana) — NO por ahora (2026-07-16)

Se evaluó sumar ELK "porque el backend creció". **Descartado en pre-launch**: el problema
que ELK resuelve (volumen de logs ingrepeable, múltiples instancias, varios devs buscando)
no existe hoy — una instancia, dev + 2 testers, y lo que sí importa ya está cubierto:
errores/tracing por Sentry, auditoría de negocio por `trabajo_evento`/`mudanza_evento`
(PR #45, visible en el panel admin), logs crudos en Railway. El costo de ELK es real:
2-4GB de RAM solo para Elasticsearch (más que el backend entero), ~USD 80-100/mes en
Elastic Cloud o ser SRE de índices/retention/upgrades self-hosted, más el cableado de
shippers.

**Escalera acordada** (cada paso recién cuando el anterior duela):
1. **Structured logging JSON** (logstash-logback-encoder + correlation ID por MDC).
   Barato, y es prerequisito de CUALQUIER destino futuro — trabajo que no se tira.
2. **Hosted liviano** si hace falta retención/búsqueda: Axiom / Better Stack (drain de
   Railway, cero infra) o Grafana Loki (free tier).
3. **ELK** recién con: lanzamiento + tráfico real, más de una instancia, o equipo que
   necesite dashboards de logs.

Señales de "llegó el momento del paso 2/3": buscar en logs > 1 vez/semana y tardar,
Railway rotó logs que se necesitaban, correlacionar entre instancias a mano.

## Orden sugerido de impacto/esfuerzo
1. #1, #3 (fix rápido, alto impacto)
2. #5 (refactor acotado, gran ganancia)
3. Fase 1 Flyway + #6 índices + #7/#8 (rendimiento bajo carga)
4. #4 BigDecimal + #2 constraint (integridad/dinero)
5. #11 geocoding (seguridad/costos)
6. Resto como deuda planificada.
