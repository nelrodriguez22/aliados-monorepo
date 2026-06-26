# Workflow de bug reports (estado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar un estado (NUEVO/EN_PROGRESO/RESUELTO) a los bug reports, cambiable desde el admin, con badge + filtro en el dashboard.

**Architecture:** Columna `estado` en `bug_reports` (Flyway V6), expuesta en el DTO existente (`GET /api/bug-reports` ya la devuelve). `PATCH /api/admin/bug-reports/{id}` togglea el estado. El `BugRow` del dashboard muestra badge + select; filtro por estado client-side.

**Tech Stack:** Spring Boot 3.4.2 (Java 21, JPA, Flyway), Mockito 5.14, React 19 + React Query.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21. Próxima migración Flyway: `V6`.
- `BugEstado` = NUEVO | EN_PROGRESO | RESUELTO. Default NUEVO.
- `BugReportRepository extends JpaRepository<BugReport, Long>` → `findById`, `save`.
- Reglas: estado inválido → 400; bug inexistente → 404.
- Seguridad: `/api/admin/**` ya ADMIN-gated; `GET /api/bug-reports` ya valida ADMIN en el service. Sin cambios de seguridad.
- Backend tests SIN DB (Mockito). Frontend: `apiClient`, React Query, `react-hot-toast`. Los bug reports viven en la pestaña Estadísticas del `AliadosDashboard` (componente `BugRow` + `SectionCard` "Bug reports").

---

### Task 1: Persistencia — enum + migración + entity + DTO

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/entity/BugEstado.java`
- Create: `backend/src/main/resources/db/migration/V6__bug_report_estado.sql`
- Modify: `backend/src/main/java/com/aliados/backend/entity/BugReport.java`
- Modify: `backend/src/main/java/com/aliados/backend/dto/BugReportResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/BugReportService.java` (mapToDTO)

**Interfaces:**
- Produces: `BugEstado`; `BugReport.getEstado()/setEstado(BugEstado)`; `BugReportResponseDTO.getEstado()/setEstado(String)`; el `mapToDTO` ahora setea `estado`.

- [ ] **Step 1: Enum BugEstado**

`backend/src/main/java/com/aliados/backend/entity/BugEstado.java`:
```java
package com.aliados.backend.entity;

public enum BugEstado {
    NUEVO,
    EN_PROGRESO,
    RESUELTO
}
```

- [ ] **Step 2: Migración**

`backend/src/main/resources/db/migration/V6__bug_report_estado.sql`:
```sql
ALTER TABLE bug_reports ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'NUEVO';
```

- [ ] **Step 3: Campo en la entity**

En `BugReport.java`, agregar (es `@Data`):
```java
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BugEstado estado = BugEstado.NUEVO;
```

- [ ] **Step 4: Campo en el DTO**

En `BugReportResponseDTO.java`, agregar `private String estado;` (es `@Data`).

- [ ] **Step 5: Mapear estado en mapToDTO**

En `BugReportService.java`, dentro del método privado `mapToDTO(BugReport ...)`, agregar la línea que setea el estado (junto a los otros `dto.setX(...)`):
```java
        dto.setEstado(b.getEstado() != null ? b.getEstado().name() : com.aliados.backend.entity.BugEstado.NUEVO.name());
```
(Usar el nombre de la variable del parámetro real de `mapToDTO`; si es `report` en vez de `b`, ajustar.)

- [ ] **Step 6: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/BugEstado.java \
        backend/src/main/resources/db/migration/V6__bug_report_estado.sql \
        backend/src/main/java/com/aliados/backend/entity/BugReport.java \
        backend/src/main/java/com/aliados/backend/dto/BugReportResponseDTO.java \
        backend/src/main/java/com/aliados/backend/service/BugReportService.java
git commit -m "feat(backend): estado en bug reports (V6 + DTO)"
```

---

### Task 2: Service.actualizarEstado + request DTO + controller (TDD)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/BugReportService.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/UpdateBugEstadoRequest.java`
- Create: `backend/src/main/java/com/aliados/backend/controller/BugReportAdminController.java`
- Test: `backend/src/test/java/com/aliados/backend/service/BugReportEstadoTest.java`

**Interfaces:**
- Consumes: `BugReportRepository.findById`/`save`; `mapToDTO` (Task 1); `BugReport.setEstado`.
- Produces: `BugReportService.actualizarEstado(Long, BugEstado) -> BugReportResponseDTO`; `UpdateBugEstadoRequest(String estado)`; `PATCH /api/admin/bug-reports/{id}`.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/BugReportEstadoTest.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.dto.BugReportResponseDTO;
import com.aliados.backend.entity.BugCategoria;
import com.aliados.backend.entity.BugEstado;
import com.aliados.backend.entity.BugReport;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.BugReportRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BugReportEstadoTest {

    @Mock BugReportRepository bugReportRepository;
    @Mock UserRepository userRepository;

    @InjectMocks BugReportService bugReportService;

    private BugReport bug() {
        User u = new User();
        u.setNombre("Juan");
        u.setEmail("juan@x.com");
        BugReport b = new BugReport();
        b.setId(1L);
        b.setUser(u);
        b.setCategoria(BugCategoria.OTRO);
        b.setTitulo("titulo");
        b.setDescripcion("desc");
        b.setEstado(BugEstado.NUEVO);
        return b;
    }

    @Test
    void actualizarEstado_cambiaYDevuelveDTO() {
        BugReport b = bug();
        when(bugReportRepository.findById(1L)).thenReturn(Optional.of(b));
        when(bugReportRepository.save(b)).thenReturn(b);

        BugReportResponseDTO dto = bugReportService.actualizarEstado(1L, BugEstado.RESUELTO);

        assertThat(b.getEstado()).isEqualTo(BugEstado.RESUELTO);
        assertThat(dto.getEstado()).isEqualTo("RESUELTO");
        verify(bugReportRepository).save(b);
    }

    @Test
    void actualizarEstado_noExiste_lanzaNoSuchElement() {
        when(bugReportRepository.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> bugReportService.actualizarEstado(9L, BugEstado.RESUELTO))
                .isInstanceOf(NoSuchElementException.class);
    }
}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*BugReportEstadoTest' --no-daemon`
Expected: FAIL (no compila: `actualizarEstado` no existe)

- [ ] **Step 3: Agregar actualizarEstado al service**

En `BugReportService.java`, agregar el método (con import `java.util.NoSuchElementException` y `org.springframework.transaction.annotation.Transactional` si no están):
```java
    @Transactional
    public BugReportResponseDTO actualizarEstado(Long id, com.aliados.backend.entity.BugEstado estado) {
        com.aliados.backend.entity.BugReport bug = bugReportRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Bug report no encontrado: " + id));
        bug.setEstado(estado);
        return mapToDTO(bugReportRepository.save(bug));
    }
```

- [ ] **Step 4: Request DTO**

`backend/src/main/java/com/aliados/backend/dto/UpdateBugEstadoRequest.java`:
```java
package com.aliados.backend.dto;

public record UpdateBugEstadoRequest(String estado) {}
```

- [ ] **Step 5: Controller**

`backend/src/main/java/com/aliados/backend/controller/BugReportAdminController.java`:
```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.BugReportResponseDTO;
import com.aliados.backend.dto.UpdateBugEstadoRequest;
import com.aliados.backend.entity.BugEstado;
import com.aliados.backend.service.BugReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.NoSuchElementException;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/bug-reports")
public class BugReportAdminController {

    private final BugReportService bugReportService;

    public BugReportAdminController(BugReportService bugReportService) {
        this.bugReportService = bugReportService;
    }

    @PatchMapping("/{id}")
    public ResponseEntity<BugReportResponseDTO> updateEstado(
            @PathVariable Long id, @RequestBody UpdateBugEstadoRequest body) {
        BugEstado estado;
        try {
            estado = BugEstado.valueOf(body.estado());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado inválido");
        }
        try {
            return ResponseEntity.ok(bugReportService.actualizarEstado(id, estado));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*BugReportEstadoTest' --no-daemon`
Expected: PASS (2 tests). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/BugReportService.java \
        backend/src/main/java/com/aliados/backend/dto/UpdateBugEstadoRequest.java \
        backend/src/main/java/com/aliados/backend/controller/BugReportAdminController.java \
        backend/src/test/java/com/aliados/backend/service/BugReportEstadoTest.java
git commit -m "feat(backend): PATCH /api/admin/bug-reports/{id} (cambiar estado)"
```

---

### Task 3: Frontend — badge + cambiar estado + filtro

**Files:**
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/bug-reports/{id}` (Task 2); `apiClient.patch`.

- [ ] **Step 1: Estilos de estado + filtro state + mutación**

En `apps/app/src/features/aliados/AliadosDashboard.tsx`:
- Agregar (junto a `CAT_STYLE`, a nivel módulo) el mapa de estilos de estado:
  ```tsx
  const BUG_ESTADO_STYLE: Record<string, { label: string; cls: string }> = {
    NUEVO:       { label: 'Nuevo',        cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
    EN_PROGRESO: { label: 'En progreso',  cls: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400' },
    RESUELTO:    { label: 'Resuelto',     cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  };
  const BUG_ESTADOS = ['NUEVO', 'EN_PROGRESO', 'RESUELTO'] as const;
  ```
- Dentro del componente `AliadosDashboard`, agregar el estado del filtro y la mutación:
  ```tsx
    const [bugFiltro, setBugFiltro] = useState<string>('TODOS');
    const updateBugEstado = useMutation({
      mutationFn: ({ id, estado }: { id: number; estado: string }) =>
        apiClient.patch(`/api/admin/bug-reports/${id}`, { estado }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] }),
      onError: () => toast.error('No se pudo actualizar el estado'),
    });
  ```
  (Verificar que `toast` de `react-hot-toast` esté importado; si no, agregar `import toast from 'react-hot-toast';`.)

- [ ] **Step 2: `BugRow` con badge + select**

Reemplazar la firma y el render del componente `BugRow` para recibir `onEstadoChange` y mostrar el estado. Cambiar `function BugRow({ report }: { report: any }) {` por:
```tsx
function BugRow({ report, onEstadoChange }: { report: any; onEstadoChange: (id: number, estado: string) => void }) {
```
Y dentro del header del row (en la fila del título, después del `<span>` de la categoría o junto al título), agregar el badge de estado y el select. Por ejemplo, justo después del bloque que muestra `report.titulo`/`report.usuarioNombre`, antes del `<ChevronDown ... />`, insertar:
```tsx
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${(BUG_ESTADO_STYLE[report.estado] ?? BUG_ESTADO_STYLE.NUEVO).cls}`}>
          {(BUG_ESTADO_STYLE[report.estado] ?? BUG_ESTADO_STYLE.NUEVO).label}
        </span>
        <select
          value={report.estado ?? 'NUEVO'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onEstadoChange(report.id, e.target.value); }}
          className="mt-0.5 shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
        >
          {BUG_ESTADOS.map((s) => <option key={s} value={s}>{BUG_ESTADO_STYLE[s].label}</option>)}
        </select>
```
(El `e.stopPropagation()` evita que el click en el select dispare el toggle de abrir/cerrar del row, que está en el `<button>` contenedor.)

- [ ] **Step 3: Filtro de la sección + pasar el callback**

En la `SectionCard title="Bug reports"`, antes de la lista, agregar los botones de filtro y filtrar la lista. Reemplazar el bloque que renderiza `bugReports.map(...)` para: (a) calcular la lista filtrada, (b) renderizar los botones de filtro, (c) pasar `onEstadoChange` a cada `BugRow`:
```tsx
              {/* Filtro por estado */}
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {['TODOS', ...BUG_ESTADOS].map((f) => (
                  <button
                    key={f}
                    onClick={() => setBugFiltro(f)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      bugFiltro === f ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-dark-bg dark:text-slate-300'
                    }`}
                  >
                    {f === 'TODOS' ? 'Todos' : BUG_ESTADO_STYLE[f].label}
                  </button>
                ))}
              </div>
              {bugReports
                .filter((r: any) => bugFiltro === 'TODOS' || (r.estado ?? 'NUEVO') === bugFiltro)
                .map((r: any) => (
                  <BugRow key={r.id} report={r} onEstadoChange={(id, estado) => updateBugEstado.mutate({ id, estado })} />
                ))}
```
(Reemplaza el `{bugReports.map((r: any) => <BugRow key={r.id} report={r} />)}` existente, conservando el wrapper `<div>` que lo rodea.)

- [ ] **Step 4: Typecheck + tests + build**

Run: `pnpm --filter aliados-app exec tsc -b && pnpm --filter aliados-app test && pnpm --filter aliados-app build`
Expected: tsc 0 · vitest PASS · build OK

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(app): workflow de bug reports (estado + filtro) en el dashboard"
```

---

## Deploy notes

- Migración V6 aditiva (columna con default 'NUEVO'). Sin env nuevas.
