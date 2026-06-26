# Diseño: Workflow de bug reports (estado/resolución)

**Fecha:** 2026-06-26
**Estado:** Aprobado (autónomo, opción recomendada) — pendiente de plan

## Problema

Los bug reports se listan read-only en el admin dashboard y la lista solo crece — no hay
forma de marcar uno como en progreso o resuelto, así que no se distingue lo pendiente de lo
ya atendido. `BugReport` no tiene campo de estado.

## Objetivos

1. Darle un **estado** a cada bug report: `NUEVO` → `EN_PROGRESO` → `RESUELTO`.
2. El admin puede **cambiar el estado** desde el panel.
3. Mostrar el estado (badge) y poder **filtrar** por estado (ocultar resueltos).

## No-objetivos (YAGNI)

- Asignar el bug a un responsable, comentarios, historial de cambios. Solo el estado.
- Notificar al usuario que reportó. Fuera.

---

## 1. Backend (`com.aliados.backend`)

### Enum `BugEstado` (nuevo)
`NUEVO`, `EN_PROGRESO`, `RESUELTO`.

### Migración `V6__bug_report_estado.sql`
```sql
ALTER TABLE bug_reports ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'NUEVO';
```
(Aditiva; las filas existentes quedan en `NUEVO`.)

### Entity `BugReport`
- Agregar `@Enumerated(EnumType.STRING) @Column(nullable = false) private BugEstado estado = BugEstado.NUEVO;`

### DTO `BugReportResponseDTO`
- Agregar `private String estado;` y mapearlo en `mapToDTO` (`dto.setEstado(b.getEstado().name())`).
  (Así el `GET /api/bug-reports` existente ya devuelve el estado — el dashboard lo muestra sin endpoint nuevo.)

### Service `BugReportService`
- `BugReportResponseDTO actualizarEstado(Long id, BugEstado estado)`:
  - `bugReportRepository.findById(id)` → `NoSuchElementException` si no existe.
  - `bug.setEstado(estado); bugReportRepository.save(bug); return mapToDTO(bug);`

### Controller `BugReportAdminController` (nuevo)
Bajo `/api/admin/bug-reports` (URL-gated ADMIN por SecurityConfig; comentar el gate):
- `PATCH /api/admin/bug-reports/{id}` → body `UpdateBugEstadoRequest(String estado)`:
  - Parsear `estado` a `BugEstado` (inválido → 400).
  - `NoSuchElementException` → 404.
  - Devuelve el `BugReportResponseDTO` actualizado.

### DTO `UpdateBugEstadoRequest(String estado)`.

## 2. Frontend (`apps/app`)

Los bug reports se muestran en la pestaña **Estadísticas** del `AliadosDashboard`
(componente `BugRow` + la `SectionCard` "Bug reports"). Cambios:
- **Badge de estado** por bug (color: NUEVO=ámbar, EN_PROGRESO=sky, RESUELTO=verde).
- **Cambiar estado:** un `<select>` con los 3 estados en cada `BugRow`; al cambiar →
  `PATCH /api/admin/bug-reports/{id}` con `{ estado }`; toast; invalida la query
  `['admin-bug-reports']`.
- **Filtro** a nivel sección: botones/select Todos / Nuevo / En progreso / Resuelto
  (client-side sobre la lista ya traída). Default: Todos.
- La mutación vive en `AliadosDashboard` (`useMutation`); `BugRow` recibe un callback
  `onEstadoChange(id, estado)` y el `estado` actual.

## 3. Manejo de errores

| Situación | Comportamiento |
|---|---|
| `estado` inválido (PATCH) | 400 |
| Bug inexistente | 404 |
| Falla el cambio | toast de error; la query se mantiene |

## 4. Testing

- **Backend (sin DB → CI):** unit test de `BugReportService.actualizarEstado` con
  `BugReportRepository` mockeado: cambia el estado (setEstado + save) y devuelve el DTO;
  `NoSuchElementException` si no existe.
- **Frontend:** sin helper nuevo que justifique vitest.

## 5. Seguridad

- `/api/admin/**` ya ADMIN-gated. El `GET /api/bug-reports` existente ya valida ADMIN en el
  service. Sin cambios de seguridad.

## 6. Notas de rollout

- Migración V6 aditiva (columna con default). Sin env nuevas.
