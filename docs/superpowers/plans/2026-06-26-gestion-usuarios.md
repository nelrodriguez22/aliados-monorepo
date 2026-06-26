# Gestión de usuarios/proveedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buscar/listar usuarios y suspender/reactivar (toggle `activo`), con el suspend como ban real (403 en el auth filter).

**Architecture:** `UsuarioAdminService` busca (query con filtros opcionales) y togglea `activo` (guard: no suspende ADMIN). Endpoints `/api/admin/usuarios`. El `FirebaseAuthFilter` rechaza (403) a usuarios `activo=false`. Panel en la pestaña Configuración.

**Tech Stack:** Spring Boot 3.4.2 (Java 21, JPA), Mockito 5.14, React 19 + React Query.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21. Sin migración.
- `User` (`@Data`): `getId/getNombre/getEmail/getRole(UserRole)/getActivo(Boolean)/getTelefono/getLocalidad/getStatus(UserStatus)/getPromedioCalificacion(Double)/getCreatedAt(LocalDateTime)`, `setActivo`. `UserRole` = CLIENT|PROVIDER|ADMIN.
- `UserRepository extends JpaRepository<User, Long>`.
- Reglas: no se puede suspender un ADMIN (400); usuario inexistente → 404; rol inválido en GET → 400; usuario suspendido → 403 "Cuenta suspendida".
- Seguridad: `/api/admin/**` ya exige ADMIN (SecurityConfig). El enforcement de `activo` aplica a TODOS los requests autenticados.
- Backend tests SIN DB (Mockito) → CI. Frontend: `apiClient`, React Query, `react-hot-toast`. Panel en la pestaña Configuración del `AliadosDashboard`.

---

### Task 1: Backend — repo + service + DTOs (TDD)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/UserRepository.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/UsuarioAdminDto.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/SuspenderRequest.java`
- Create: `backend/src/main/java/com/aliados/backend/service/UsuarioAdminService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/UsuarioAdminServiceTest.java`

**Interfaces:**
- Produces: `UserRepository.searchUsuarios(String, UserRole)`; `UsuarioAdminService.buscar(String, UserRole) -> List<User>`, `actualizarActivo(Long, boolean) -> User` (lanza `NoSuchElementException` / `IllegalArgumentException`); DTOs `UsuarioAdminDto` (con `from(User)`), `SuspenderRequest(boolean activo)`.

- [ ] **Step 1: Agregar la query al repository**

En `UserRepository.java` agregar (imports `UserRole`, `List`, `@Query`, `@Param` ya presentes o agregarlos):
```java
    @org.springframework.data.jpa.repository.Query("SELECT u FROM User u WHERE " +
           "(:q IS NULL OR LOWER(u.nombre) LIKE LOWER(CONCAT('%', :q, '%')) " +
           " OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))) " +
           "AND (:role IS NULL OR u.role = :role) ORDER BY u.createdAt DESC")
    java.util.List<com.aliados.backend.entity.User> searchUsuarios(
            @org.springframework.data.repository.query.Param("q") String q,
            @org.springframework.data.repository.query.Param("role") com.aliados.backend.entity.UserRole role);
```

- [ ] **Step 2: DTOs**

`backend/src/main/java/com/aliados/backend/dto/UsuarioAdminDto.java`:
```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.User;

import java.time.LocalDateTime;

public record UsuarioAdminDto(
        Long id, String nombre, String email, String role, boolean activo,
        String telefono, String localidad, String status,
        Double promedioCalificacion, LocalDateTime createdAt) {

    public static UsuarioAdminDto from(User u) {
        return new UsuarioAdminDto(
                u.getId(), u.getNombre(), u.getEmail(),
                u.getRole() != null ? u.getRole().name() : null,
                Boolean.TRUE.equals(u.getActivo()),
                u.getTelefono(), u.getLocalidad(),
                u.getStatus() != null ? u.getStatus().name() : null,
                u.getPromedioCalificacion(), u.getCreatedAt());
    }
}
```

`backend/src/main/java/com/aliados/backend/dto/SuspenderRequest.java`:
```java
package com.aliados.backend.dto;

public record SuspenderRequest(boolean activo) {}
```

- [ ] **Step 3: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/UsuarioAdminServiceTest.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
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
class UsuarioAdminServiceTest {

    @Mock UserRepository userRepository;
    @InjectMocks UsuarioAdminService service;

    private User user(Long id, UserRole role) {
        User u = new User();
        u.setId(id);
        u.setRole(role);
        u.setActivo(true);
        return u;
    }

    @Test
    void actualizarActivo_suspendeCliente() {
        User u = user(1L, UserRole.CLIENT);
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));
        when(userRepository.save(u)).thenReturn(u);

        service.actualizarActivo(1L, false);

        assertThat(u.getActivo()).isFalse();
        verify(userRepository).save(u);
    }

    @Test
    void actualizarActivo_admin_lanzaIllegalArgument() {
        User u = user(1L, UserRole.ADMIN);
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> service.actualizarActivo(1L, false))
                .isInstanceOf(IllegalArgumentException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void actualizarActivo_noExiste_lanzaNoSuchElement() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.actualizarActivo(99L, false))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void buscar_normalizaQEnBlancoANull() {
        service.buscar("  ", UserRole.CLIENT);
        verify(userRepository).searchUsuarios(null, UserRole.CLIENT);
    }
}
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*UsuarioAdminServiceTest' --no-daemon`
Expected: FAIL (no compila: `UsuarioAdminService` no existe)

- [ ] **Step 5: Implementar el service**

`backend/src/main/java/com/aliados/backend/service/UsuarioAdminService.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Service
public class UsuarioAdminService {

    private final UserRepository userRepository;

    public UsuarioAdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public List<User> buscar(String q, UserRole role) {
        String query = (q == null || q.isBlank()) ? null : q.trim();
        return userRepository.searchUsuarios(query, role);
    }

    @Transactional
    public User actualizarActivo(Long id, boolean activo) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Usuario no encontrado: " + id));
        if (user.getRole() == UserRole.ADMIN) {
            throw new IllegalArgumentException("No se puede suspender un admin");
        }
        user.setActivo(activo);
        return userRepository.save(user);
    }
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*UsuarioAdminServiceTest' --no-daemon`
Expected: PASS (4 tests). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/UserRepository.java \
        backend/src/main/java/com/aliados/backend/dto/UsuarioAdminDto.java \
        backend/src/main/java/com/aliados/backend/dto/SuspenderRequest.java \
        backend/src/main/java/com/aliados/backend/service/UsuarioAdminService.java \
        backend/src/test/java/com/aliados/backend/service/UsuarioAdminServiceTest.java
git commit -m "feat(backend): UsuarioAdminService (buscar + suspender, guard ADMIN)"
```

---

### Task 2: Backend — controller + enforce activo en el auth filter

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/controller/UsuarioAdminController.java`
- Modify: `backend/src/main/java/com/aliados/backend/config/FirebaseAuthFilter.java`

**Interfaces:**
- Consumes: `UsuarioAdminService.buscar(String, UserRole)`, `actualizarActivo(Long, boolean)`; `UsuarioAdminDto.from(User)`.
- Produces: `GET /api/admin/usuarios?q=&role=`, `PATCH /api/admin/usuarios/{id}`.

- [ ] **Step 1: Controller**

`backend/src/main/java/com/aliados/backend/controller/UsuarioAdminController.java`:
```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.SuspenderRequest;
import com.aliados.backend.dto.UsuarioAdminDto;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.service.UsuarioAdminService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/usuarios")
public class UsuarioAdminController {

    private final UsuarioAdminService usuarioAdminService;

    public UsuarioAdminController(UsuarioAdminService usuarioAdminService) {
        this.usuarioAdminService = usuarioAdminService;
    }

    @GetMapping
    public ResponseEntity<List<UsuarioAdminDto>> buscar(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String role) {
        UserRole rol = null;
        if (role != null && !role.isBlank()) {
            try {
                rol = UserRole.valueOf(role);
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol inválido");
            }
        }
        List<UsuarioAdminDto> usuarios = usuarioAdminService.buscar(q, rol).stream()
                .map(UsuarioAdminDto::from)
                .toList();
        return ResponseEntity.ok(usuarios);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<UsuarioAdminDto> actualizar(
            @PathVariable Long id, @RequestBody SuspenderRequest body) {
        try {
            return ResponseEntity.ok(
                    UsuarioAdminDto.from(usuarioAdminService.actualizarActivo(id, body.activo())));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
```

- [ ] **Step 2: Enforce `activo` en FirebaseAuthFilter**

En `FirebaseAuthFilter.java`:
- Agregar la constante (junto a los otros campos):
  ```java
      private static final String SUSPENDED = "__SUSPENDED__";
  ```
- Reemplazar el cuerpo de `resolveAuthority` para detectar suspendidos (sin cachear el sentinel, para que reactivar tome efecto inmediato):
  ```java
      private String resolveAuthority(String uid) {
          String cached = roleCache.getIfPresent(uid);
          if (cached != null) return cached;

          return userRepository.findByFirebaseUid(uid)
                  .map(u -> {
                      if (Boolean.FALSE.equals(u.getActivo())) {
                          return SUSPENDED; // no cachear → reactivación inmediata
                      }
                      String authority = "ROLE_" + u.getRole().name();
                      roleCache.put(uid, authority);
                      return authority;
                  })
                  .orElse("ROLE_USER");
      }
  ```
- En `doFilterInternal`, justo después de `String authority = resolveAuthority(uid);`, agregar el corte:
  ```java
              if (SUSPENDED.equals(authority)) {
                  response.sendError(HttpServletResponse.SC_FORBIDDEN, "Cuenta suspendida");
                  return;
              }
  ```

- [ ] **Step 3: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Verificación manual (backend + token ADMIN)**

```bash
# Buscar (todos / por texto / por rol):
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:8080/api/admin/usuarios?q=&role=PROVIDER"
# Suspender (id 2):
curl -s -X PATCH -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"activo":false}' http://localhost:8080/api/admin/usuarios/2   # 200, activo:false
# Ese usuario, en su próximo request (con SU token), debe recibir 403 "Cuenta suspendida".
# Suspender un admin → 400; id inexistente → 404; role inválido en GET → 400.
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/controller/UsuarioAdminController.java \
        backend/src/main/java/com/aliados/backend/config/FirebaseAuthFilter.java
git commit -m "feat(backend): endpoints admin usuarios + ban real (403 si activo=false)"
```

---

### Task 3: Frontend — panel de usuarios

**Files:**
- Create: `apps/app/src/features/aliados/UsuariosPanel.tsx`
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/usuarios?q=&role=`, `PATCH /api/admin/usuarios/{id}` (Task 2); `apiClient`.
- Produces: componente `<UsuariosPanel />`.

- [ ] **Step 1: Crear el panel**

`apps/app/src/features/aliados/UsuariosPanel.tsx`:
```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

interface UsuarioAdmin {
  id: number;
  nombre: string | null;
  email: string;
  role: string;
  activo: boolean;
  telefono: string | null;
  localidad: string | null;
  status: string | null;
  promedioCalificacion: number | null;
}

type RoleFiltro = '' | 'CLIENT' | 'PROVIDER';
const ROLES: { key: RoleFiltro; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'CLIENT', label: 'Clientes' },
  { key: 'PROVIDER', label: 'Proveedores' },
];

export function UsuariosPanel() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleFiltro>('');
  const [applied, setApplied] = useState<{ q: string; role: RoleFiltro }>({ q: '', role: '' });

  const { data: usuarios = [], isFetching } = useQuery<UsuarioAdmin[]>({
    queryKey: ['admin-usuarios', applied.q, applied.role],
    queryFn: () =>
      apiClient.get(`/api/admin/usuarios?q=${encodeURIComponent(applied.q)}&role=${applied.role}`),
  });

  const toggle = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiClient.patch(`/api/admin/usuarios/${id}`, { activo }),
    onSuccess: () => {
      toast.success('Usuario actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-usuarios'] });
    },
    onError: () => toast.error('No se pudo actualizar el usuario'),
  });

  const handleToggle = (u: UsuarioAdmin) => {
    if (u.activo && !window.confirm(`¿Suspender a ${u.nombre || u.email}? No podrá usar la app.`)) return;
    toggle.mutate({ id: u.id, activo: !u.activo });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Usuarios</h2>
      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ q, role });
        }}
      >
        <input
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o email" />
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={role} onChange={(e) => setRole(e.target.value as RoleFiltro)}>
          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <button type="submit" className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700">
          Buscar
        </button>
      </form>
      {isFetching ? (
        <p className="text-sm text-slate-500">Buscando…</p>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-slate-500">Sin resultados</p>
      ) : (
        <div className="flex flex-col gap-2">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-dark-border">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {u.nombre || '(sin nombre)'} {!u.activo && <span className="text-xs text-red-500">· suspendido</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email} · {u.role}</p>
              </div>
              <button
                onClick={() => handleToggle(u)}
                disabled={toggle.isPending}
                className={`rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${
                  u.activo
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400'
                }`}
              >
                {u.activo ? 'Suspender' : 'Reactivar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Embeber el panel en la pestaña Configuración**

En `apps/app/src/features/aliados/AliadosDashboard.tsx`:
- Agregar el import: `import { UsuariosPanel } from './UsuariosPanel';`
- Dentro del bloque `{tab === 'config' && (<div className="flex flex-col gap-4"> ... </div>)}`, agregar `<UsuariosPanel />` como una sección más.

- [ ] **Step 3: Typecheck + tests + build**

Run: `pnpm --filter aliados-app exec tsc -b && pnpm --filter aliados-app test && pnpm --filter aliados-app build`
Expected: tsc 0 · vitest PASS · build OK

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/aliados/UsuariosPanel.tsx \
        apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(app): panel de gestión de usuarios en el admin dashboard"
```

---

## Deploy notes

- Sin migración ni env nuevas.
- El enforcement de `activo` aplica a todos los requests: suspender tarda hasta 5 min en cortar (cache de authority); reactivar es inmediato.
