# Diseño: Broadcast a usuarios desde el admin

**Fecha:** 2026-06-25
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

No hay forma de mandar un aviso a los usuarios desde la app. `NotificacionService`
solo notifica **a un usuario** (`enviarNotificacion`). Para avisos de launch, cortes
o promos, el admin necesita mandar una notificación masiva (push + campanita) a todos
o a un segmento.

## Objetivos

1. El admin manda un aviso (segmento + título + mensaje) desde el panel.
2. Llega como **push + notificación in-app** a cada usuario del segmento.
3. Segmentos: **todos** (clientes + proveedores activos), **clientes**, **proveedores**.
4. El envío es **asíncrono**: el endpoint responde al instante con el conteo de destinatarios.

## No-objetivos (YAGNI)

- **Email.** Se eligió push + in-app; el email (Resend) queda para una iteración futura.
- **FCM topics / multicast.** Pre-launch con pocos usuarios → se itera. A escala se migra
  a multicast (500 tokens/llamada) o topics; no ahora.
- **Programar envíos / plantillas / segmentos avanzados.** Solo envío inmediato y 3 segmentos.
- **Tracking de entrega/apertura.** Fuera de alcance.

---

## 1. Backend (`com.aliados.backend`)

### Enum `TipoNotificacion`
- Agregar `ANUNCIO` (tipo de la notificación in-app del broadcast).

### Repository `UserRepository`
- Agregar `List<User> findByRoleInAndActivoTrue(java.util.Collection<UserRole> roles);`
  (derivado de Spring Data). Cubre los 3 segmentos con una sola query.

### Service `BroadcastService` (nuevo)
Bean separado (necesario para que `@Async` aplique vía proxy de Spring; `@EnableAsync`
ya está activo). Inyecta `UserRepository` y `NotificacionService`.

- `List<User> resolverDestinatarios(String segmento)`:
  - Mapea el segmento a roles: `TODOS` → `[CLIENT, PROVIDER]`, `CLIENTES` → `[CLIENT]`,
    `PROVEEDORES` → `[PROVIDER]`. (ADMIN nunca recibe.)
  - Segmento inválido → `IllegalArgumentException`.
  - Devuelve `userRepository.findByRoleInAndActivoTrue(roles)`.

- `@Async void enviarAsync(List<String> firebaseUids, String titulo, String mensaje, String adminUid)`:
  - `log.info("Broadcast a {} usuarios por admin={}", firebaseUids.size(), adminUid)`.
  - Por cada uid: `try { notificacionService.enviarNotificacion(uid, TipoNotificacion.ANUNCIO, titulo, mensaje, null, null); } catch (Exception e) { log.error(...); }` — un fallo no corta el resto.
  - Reusa el camino existente: `enviarNotificacion` crea la `Notificacion` (campanita) y
    dispara el push AFTER_COMMIT. Usuario sin `fcmToken` → `enviarPush` lo saltea solo;
    la campanita igual se crea.

### Controller `BroadcastAdminController` (nuevo)
Bajo `/api/admin/broadcast` (ya gateado por `.hasRole("ADMIN")` en SecurityConfig; comentar
dónde vive el gate, igual que los otros controllers admin nuevos):
- `POST /api/admin/broadcast` → body `BroadcastRequest(String segmento, String titulo, String mensaje)`.
  - Valida `titulo`/`mensaje` no vacíos (en blanco → 400 vía `ResponseStatusException`).
  - `List<User> destinatarios = broadcastService.resolverDestinatarios(body.segmento())` (400 si inválido).
  - `broadcastService.enviarAsync(uids, titulo, mensaje, authentication.getName())` (fire-and-forget).
  - Devuelve `BroadcastResultDto(int targetCount)` con `destinatarios.size()`.

### DTOs (`dto/`)
- `BroadcastRequest(String segmento, String titulo, String mensaje)`.
- `BroadcastResultDto(int targetCount)`.

## 2. Frontend (`apps/app`)

### `features/aliados/BroadcastPanel.tsx`
Sección en `AliadosDashboard` (junto a los otros paneles admin):
- Selector de segmento: Todos / Clientes / Proveedores (mapea a `TODOS|CLIENTES|PROVEEDORES`).
- Inputs título + mensaje.
- Botón **Enviar** con **confirmación** (`window.confirm`: "Vas a enviar un aviso a todos los
  usuarios del segmento. ¿Confirmás?") antes del POST.
- `useMutation` → `apiClient.post('/api/admin/broadcast', { segmento, titulo, mensaje })`.
- Toast de éxito usando el `targetCount` de la respuesta ("Enviado a N usuarios"); toast de error.
- Reusa `apiClient` + React Query + `react-hot-toast`.

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Segmento inválido | 400 (`IllegalArgumentException` → `ResponseStatusException`) |
| Título o mensaje vacío | 400 |
| Usuario sin `fcmToken` | la campanita se crea igual; el push se saltea (lo maneja `enviarPush`) |
| Falla el envío a un usuario | try/catch + log por usuario; el broadcast sigue con el resto |
| Lista de destinatarios vacía | responde `targetCount: 0`; el async no hace nada |

## 4. Testing

- **Backend (sin DB → corre en el CI):** unit test de `BroadcastService` con `UserRepository`
  y `NotificacionService` mockeados. Casos:
  - `resolverDestinatarios("TODOS")` consulta con `[CLIENT, PROVIDER]`; `"CLIENTES"` con `[CLIENT]`;
    `"PROVEEDORES"` con `[PROVIDER]`; segmento inválido → `IllegalArgumentException`.
  - `enviarAsync` llama `enviarNotificacion` una vez por uid, con `TipoNotificacion.ANUNCIO` y el
    título/mensaje dados; un `enviarNotificacion` que tira excepción no corta los demás.
- **Frontend:** la lógica del panel es un form simple; sin helper nuevo que justifique vitest
  (la validación de no-vacío la hace el backend, fuente de verdad).

## 5. Seguridad

- `/api/admin/**` ya gateado por `.hasRole("ADMIN")` (SecurityConfig). Sin cambios de seguridad.
  El `BroadcastPanel` se renderiza dentro de `AliadosDashboard`, ya detrás de
  `<ProtectedRoute allowedRoles={['ADMIN']}>`.

## 6. Notas de rollout

- Pre-launch con pocos usuarios → iterar está bien. Si la base crece, migrar `enviarAsync`
  a FCM multicast/topics (documentar como follow-up, no ahora).
- `@Async` corre en el pool por defecto de Spring; para volúmenes grandes convendría un
  `TaskExecutor` dedicado (follow-up).
