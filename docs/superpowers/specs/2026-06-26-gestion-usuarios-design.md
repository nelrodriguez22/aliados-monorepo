# Diseño: Gestión de usuarios/proveedores desde el admin

**Fecha:** 2026-06-26
**Estado:** Aprobado (autónomo, opción recomendada) — pendiente de plan

## Problema

No hay forma de moderar usuarios desde la app: buscar a alguien, ver sus datos, o
suspender una cuenta problemática. El único control existente es "forzar offline" a un
proveedor. Pre-launch necesitamos al menos: **buscar usuarios y suspender/reactivar**.

`User` tiene `activo` (Boolean), pero hoy es un flag **blando**: saca a proveedores del
matching (queries `...AndActivoTrue`), pero **no bloquea el login** (no hay check en
`FirebaseAuthFilter`). No existe un campo "verificado" propio (la verificación es por
Firebase/email), así que "verificar proveedor" queda fuera por falta de soporte del modelo.

## Objetivos

1. **Buscar/listar** usuarios (por nombre o email, filtrable por rol).
2. **Suspender/reactivar** (toggle `activo`).
3. Que suspender sea un **ban real**: un usuario con `activo=false` recibe 403 en el auth filter.

## No-objetivos (YAGNI)

- **Verificar/aprobar proveedores.** Sin campo en el modelo. Fuera.
- **Editar datos del usuario** (nombre, rol, etc.). Solo toggle de `activo`.
- **Paginación.** Pre-launch con pocos usuarios → la búsqueda devuelve todos los matches.
  (Follow-up al escalar.)

---

## 1. Backend (`com.aliados.backend`)

### Repository `UserRepository`
Agregar búsqueda con filtros opcionales (q + rol):
```java
@Query("SELECT u FROM User u WHERE " +
       "(:q IS NULL OR LOWER(u.nombre) LIKE LOWER(CONCAT('%', :q, '%')) " +
       " OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))) " +
       "AND (:role IS NULL OR u.role = :role) ORDER BY u.createdAt DESC")
List<User> searchUsuarios(@Param("q") String q, @Param("role") UserRole role);
```

### Service `UsuarioAdminService` (nuevo)
- `User actualizarActivo(Long id, boolean activo)`:
  - `findById` → `NoSuchElementException` si no existe.
  - Si `user.getRole() == UserRole.ADMIN` → `IllegalArgumentException("No se puede suspender un admin")`
    (evita que un admin se autobloquee o bloquee a otro admin).
  - `user.setActivo(activo); userRepository.save(user); return user;`
- `List<User> buscar(String q, UserRole role)` → `userRepository.searchUsuarios(q, role)`.
  (Normaliza `q` en blanco a `null` para que el filtro lo ignore.)

### Controller `UsuarioAdminController`
Bajo `/api/admin/usuarios` (ya gateado por ADMIN en SecurityConfig; comentar el gate):
- `GET /api/admin/usuarios?q=&role=` → `List<UsuarioAdminDto>`. `q` y `role` opcionales;
  `role` se parsea a `UserRole` (inválido → 400).
- `PATCH /api/admin/usuarios/{id}` → body `SuspenderRequest`:
  - `IllegalArgumentException` (suspender admin) → 400; `NoSuchElementException` → 404.
  - Devuelve el `UsuarioAdminDto` actualizado.

### DTOs (`dto/`)
- `UsuarioAdminDto(Long id, String nombre, String email, String role, boolean activo,
  String telefono, String localidad, String status, Double promedioCalificacion, Instant/LocalDateTime createdAt)`
  con `static from(User)`.
- `SuspenderRequest(boolean activo)`.

### `FirebaseAuthFilter` — enforce `activo`
En `resolveAuthority(uid)`: al cargar el user, si `Boolean.FALSE.equals(u.getActivo())`,
devolver un sentinel `SUSPENDED` **sin cachearlo** (para que la reactivación tome efecto
inmediato). En `doFilterInternal`, si `authority == SUSPENDED` → `response.sendError(403,
"Cuenta suspendida")` y `return` (no setea autenticación, no sigue la cadena).
- **Lag:** suspender tarda hasta 5 min en cortar si la authority del user ya estaba cacheada
  (mismo TTL/tradeoff que el cambio de rol que ya documentan). Reactivar es inmediato.

## 2. Frontend (`apps/app`)

### `features/aliados/UsuariosPanel.tsx`
Sección en `AliadosDashboard` (pestaña Configuración):
- Input de búsqueda (`q`) + selector de rol (Todos / Clientes / Proveedores → `''|CLIENT|PROVIDER`).
- `useQuery` a `GET /api/admin/usuarios?q=&role=` (keyed por q+role; debounce simple del input
  con estado, o fetch on submit/Enter).
- Lista: por usuario → nombre, email, rol, estado (`status`), promedio (si proveedor), y un
  botón **Suspender** / **Reactivar** según `activo`. Suspender pide **confirmación**
  (`window.confirm`). Toggle → `PATCH`; toast; invalida la query.
- Reusa `apiClient` (`get`/`patch`), React Query, `react-hot-toast`.

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Suspender un ADMIN | 400 (`IllegalArgumentException`) |
| Usuario inexistente (PATCH) | 404 |
| `role` inválido en el GET | 400 |
| Usuario suspendido hace un request | 403 "Cuenta suspendida" (auth filter) |

## 4. Testing

- **Backend (sin DB → CI):** unit test de `UsuarioAdminService.actualizarActivo` con
  `UserRepository` mockeado: suspende un CLIENT (setActivo(false) + save), rechaza suspender
  un ADMIN (`IllegalArgumentException`), y `NoSuchElementException` si no existe.
- El cambio en `FirebaseAuthFilter` se verifica por **compile + manual** (el filtro depende de
  Firebase token verification, difícil de unit-testear sin mockear FirebaseAuth).
- **Frontend:** sin helper nuevo que justifique vitest.

## 5. Seguridad

- `/api/admin/**` ya ADMIN-gated. El nuevo enforcement de `activo` en el auth filter aplica a
  TODOS los requests autenticados (no solo admin) — es el ban real. Guard: no se puede suspender
  un ADMIN (no se autobloquean).

## 6. Notas de rollout

- Sin migración ni env nuevas (el campo `activo` ya existe).
- Verificación manual: suspender un usuario de prueba → sus requests devuelven 403; reactivar →
  vuelve a entrar (inmediato).
