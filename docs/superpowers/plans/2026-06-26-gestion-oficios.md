# Gestión de oficios (activar/desactivar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al admin listar todos los oficios y activar/desactivar cada uno desde el panel.

**Architecture:** Endpoints admin (`/api/admin/oficios` GET + PATCH) que listan todos los oficios y togglean `activo`, repo-direct (mismo estilo que el `OficioController` existente). Panel en la pestaña Configuración. El filtrado para el cliente (`/api/oficios`) ya respeta `activo` — sin cambios.

**Tech Stack:** Spring Boot 3.4.2 (Java 21, JPA), React 19 + React Query.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21. Sin migración nueva.
- `Oficio` (`@Data`): `Long id`, `String nombre`, `String icono`, `Boolean activo`, `Boolean exclusivo`.
- `OficioRepository extends JpaRepository<Oficio, Long>` → `findAll(Sort)`, `findById`, `save`.
- Seguridad: `/api/admin/**` ya exige ADMIN (SecurityConfig). No tocar seguridad.
- Frontend: `apiClient` (`get`/`patch`), React Query, `react-hot-toast`. El panel va en la pestaña Configuración del `AliadosDashboard` (junto a `FeatureFlagsPanel`/`MaintenancePanel`/`BroadcastPanel`).

---

### Task 1: Backend — DTOs + OficioAdminController

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/OficioAdminDto.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/UpdateOficioRequest.java`
- Create: `backend/src/main/java/com/aliados/backend/controller/OficioAdminController.java`

**Interfaces:**
- Consumes: `OficioRepository.findAll(Sort)`, `findById`, `save`; `Oficio` getters/setters.
- Produces: `GET /api/admin/oficios` → `List<OficioAdminDto>`; `PATCH /api/admin/oficios/{id}` body `UpdateOficioRequest` → `OficioAdminDto`.

- [ ] **Step 1: DTO de respuesta**

`backend/src/main/java/com/aliados/backend/dto/OficioAdminDto.java`:
```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.Oficio;

public record OficioAdminDto(Long id, String nombre, String icono, boolean activo, boolean exclusivo) {
    public static OficioAdminDto from(Oficio o) {
        return new OficioAdminDto(
                o.getId(),
                o.getNombre(),
                o.getIcono(),
                Boolean.TRUE.equals(o.getActivo()),
                Boolean.TRUE.equals(o.getExclusivo()));
    }
}
```

- [ ] **Step 2: DTO de request**

`backend/src/main/java/com/aliados/backend/dto/UpdateOficioRequest.java`:
```java
package com.aliados.backend.dto;

public record UpdateOficioRequest(boolean activo) {}
```

- [ ] **Step 3: Controller**

`backend/src/main/java/com/aliados/backend/controller/OficioAdminController.java`:
```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.OficioAdminDto;
import com.aliados.backend.dto.UpdateOficioRequest;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.repository.OficioRepository;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig
// (patrón centralizado, igual que el resto de controllers admin).
@RestController
@RequestMapping("/api/admin/oficios")
public class OficioAdminController {

    private final OficioRepository oficioRepository;

    public OficioAdminController(OficioRepository oficioRepository) {
        this.oficioRepository = oficioRepository;
    }

    @GetMapping
    public ResponseEntity<List<OficioAdminDto>> list() {
        List<OficioAdminDto> oficios = oficioRepository.findAll(Sort.by("nombre")).stream()
                .map(OficioAdminDto::from)
                .toList();
        return ResponseEntity.ok(oficios);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<OficioAdminDto> update(@PathVariable Long id, @RequestBody UpdateOficioRequest body) {
        Oficio o = oficioRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Oficio no encontrado"));
        o.setActivo(body.activo());
        oficioRepository.save(o);
        return ResponseEntity.ok(OficioAdminDto.from(o));
    }
}
```

- [ ] **Step 4: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Verificación manual (backend + token ADMIN)**

```bash
# Listar todos:
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:8080/api/admin/oficios
# Esperado: JSON con todos los oficios (activos e inactivos), con id/nombre/icono/activo/exclusivo

# Desactivar uno (id 1):
curl -s -X PATCH -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"activo":false}' http://localhost:8080/api/admin/oficios/1
# Esperado: 200 con activo:false. Y GET /api/oficios (el del cliente) ya no lo incluye.

# Id inexistente:
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{"activo":true}' http://localhost:8080/api/admin/oficios/999999
# Esperado: 404
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/OficioAdminDto.java \
        backend/src/main/java/com/aliados/backend/dto/UpdateOficioRequest.java \
        backend/src/main/java/com/aliados/backend/controller/OficioAdminController.java
git commit -m "feat(backend): endpoints admin /api/admin/oficios (listar + toggle activo)"
```

---

### Task 2: Frontend — panel de oficios

**Files:**
- Create: `apps/app/src/features/aliados/OficiosPanel.tsx`
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/oficios`, `PATCH /api/admin/oficios/{id}` (Task 1); `apiClient` (`get`, `patch`).
- Produces: componente `<OficiosPanel />`.

- [ ] **Step 1: Crear el panel**

`apps/app/src/features/aliados/OficiosPanel.tsx`:
```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

interface OficioAdmin {
  id: number;
  nombre: string;
  icono: string;
  activo: boolean;
  exclusivo: boolean;
}

export function OficiosPanel() {
  const queryClient = useQueryClient();
  const { data: oficios = [], isLoading } = useQuery<OficioAdmin[]>({
    queryKey: ['admin-oficios'],
    queryFn: () => apiClient.get('/api/admin/oficios'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiClient.patch(`/api/admin/oficios/${id}`, { activo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-oficios'] }),
    onError: () => toast.error('No se pudo actualizar el oficio'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Cargando oficios…</p>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Oficios</h2>
      <div className="flex flex-col gap-2">
        {oficios.map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-dark-border"
          >
            <span className="text-lg">{o.icono}</span>
            <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">{o.nombre}</span>
            {o.exclusivo && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-dark-bg dark:text-slate-400">
                exclusivo
              </span>
            )}
            <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={o.activo}
                disabled={toggle.isPending}
                onChange={(e) => toggle.mutate({ id: o.id, activo: e.target.checked })}
              />
              {o.activo ? 'activo' : 'inactivo'}
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Embeber el panel en la pestaña Configuración**

En `apps/app/src/features/aliados/AliadosDashboard.tsx`:
- Agregar el import: `import { OficiosPanel } from './OficiosPanel';`
- Dentro del bloque `{tab === 'config' && (...)}` (el `<div className="flex flex-col gap-4">` que contiene `<FeatureFlagsPanel />`, `<MaintenancePanel />`, `<BroadcastPanel />`), agregar `<OficiosPanel />` como una sección más (ej. al final).

- [ ] **Step 3: Typecheck + tests + build**

Run: `pnpm --filter aliados-app exec tsc -b && pnpm --filter aliados-app test && pnpm --filter aliados-app build`
Expected: tsc 0 · vitest PASS · build OK

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/aliados/OficiosPanel.tsx \
        apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(app): panel de gestión de oficios en el admin dashboard"
```

---

## Deploy notes

- Sin migración ni env nuevas. Los oficios ya existen (seed); el feature solo agrega la superficie admin para togglear `activo`.
