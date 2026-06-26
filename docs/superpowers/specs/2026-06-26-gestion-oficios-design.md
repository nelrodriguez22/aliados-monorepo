# Diseño: Gestión de oficios (activar/desactivar) desde el admin

**Fecha:** 2026-06-26
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

Los oficios (rubros) se seedean en la DB y tienen un flag `activo`, pero no hay forma de
prenderlos/apagarlos desde la app — solo editando la DB a mano. El admin necesita controlar
qué rubros se ofrecen (ej. arrancar con plomería/electricidad y sumar a medida que hay
proveedores — launch escalonado).

La lógica de filtrado **ya existe**: `OficioController` (`GET /api/oficios`) devuelve
`oficioRepository.findByActivoTrueAndExclusivoFalse()`, y el front lo consume con
`useOficios`. Así que apagar un oficio (`activo=false`) lo saca solo del selector del
cliente — no hay que tocar ese flujo.

## Objetivos

1. El admin lista **todos** los oficios (activos e inactivos) desde el panel.
2. Puede **activar/desactivar** cada uno (toggle de `activo`).

## No-objetivos (YAGNI)

- **Crear / editar oficios** (nombre, ícono, exclusivo). Se evaluó; queda fuera. Los oficios
  se siguen seedeando; el admin solo prende/apaga.
- **Tocar `exclusivo`.** Se muestra read-only (informativo), no se edita.
- **Cambiar el filtrado del cliente.** Ya respeta `activo`; sin cambios.

---

## 1. Backend (`com.aliados.backend`)

### Controller `OficioAdminController`
Bajo `/api/admin/oficios` (ya gateado por `.hasRole("ADMIN")` en SecurityConfig — patrón
centralizado; comentar dónde vive el gate). Inyección por constructor de `OficioRepository`
(mismo estilo que `OficioController`, repo-direct).
- `GET /api/admin/oficios` → `List<OficioAdminDto>` con **todos** los oficios:
  `oficioRepository.findAll(Sort.by("nombre")).stream().map(OficioAdminDto::from).toList()`.
- `PATCH /api/admin/oficios/{id}` → body `UpdateOficioRequest`:
  - `Oficio o = oficioRepository.findById(id).orElseThrow(...)` → `ResponseStatusException(NOT_FOUND)` si no existe.
  - `o.setActivo(body.activo()); oficioRepository.save(o);`
  - Devuelve `OficioAdminDto.from(o)`.

### DTOs (`dto/`)
- `OficioAdminDto(Long id, String nombre, String icono, boolean activo, boolean exclusivo)`
  con `static from(Oficio)`.
- `UpdateOficioRequest(boolean activo)`.

`OficioRepository` ya extiende `JpaRepository<Oficio, Long>` → `findAll(Sort)`, `findById`,
`save` disponibles. No se agregan métodos.

## 2. Frontend (`apps/app`)

### `features/aliados/OficiosPanel.tsx`
Sección en `AliadosDashboard` (pestaña Configuración, junto a los otros paneles):
- `useQuery` a `GET /api/admin/oficios` → lista de oficios.
- Por cada oficio: el **ícono** + **nombre**, un badge **"exclusivo"** si `exclusivo` (read-only),
  y un **switch** (checkbox) que refleja `activo`.
- Al togglear → `useMutation` `PATCH /api/admin/oficios/{id}` con `{ activo }`; toast de
  éxito/error; invalida la query (`['admin-oficios']`) al volver.
- Reusa `apiClient` (`get`/`patch`), React Query y `react-hot-toast`.

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Oficio inexistente (PATCH) | 404 (`ResponseStatusException(NOT_FOUND)`) |
| Falla el toggle (red/server) | toast de error; la query se mantiene; el usuario reintenta |

## 4. Testing

- **Backend:** el toggle es trivial (`findById` → `setActivo` → `save`), sin lógica de
  dominio que un unit test aporte; se verifica por **compile + curl manual** (igual que el
  `OficioController` actual, que no tiene test). El gate ADMIN ya está cubierto por SecurityConfig.
- **Frontend:** sin helper nuevo que justifique vitest (es un panel de lista + toggle).

## 5. Seguridad

- Endpoints bajo `/api/admin/**` → ya gateados por `.hasRole("ADMIN")` (SecurityConfig).
  Sin cambios de seguridad. El `OficiosPanel` se renderiza dentro de `AliadosDashboard`,
  ya detrás de `<ProtectedRoute allowedRoles={['ADMIN']}>`.

## 6. Notas de rollout

- Sin migración ni env nuevas. Los oficios ya existen (seed). El feature solo agrega la
  superficie admin para togglear `activo`.
- Verificación manual: `GET /api/admin/oficios` lista todos; `PATCH .../{id}` con
  `{"activo":false}` → el oficio desaparece de `GET /api/oficios` (el del cliente).
