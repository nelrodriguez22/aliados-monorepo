# Broadcast a usuarios desde el admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al admin enviar un aviso (push + in-app) a todos los usuarios o a un segmento (clientes/proveedores), de forma asíncrona.

**Architecture:** `BroadcastService` resuelve los destinatarios por segmento y, en un método `@Async`, itera el `enviarNotificacion` existente (campanita + push) por usuario. El endpoint `POST /api/admin/broadcast` responde al instante con el conteo. Un panel en `AliadosDashboard` con confirmación.

**Tech Stack:** Spring Boot 3.4.2 (Java 21), Mockito 5.14, React 19 + React Query + Vitest.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21. `@EnableAsync` ya está activo.
- Segmentos: `TODOS` → roles `[CLIENT, PROVIDER]`; `CLIENTES` → `[CLIENT]`; `PROVEEDORES` → `[PROVIDER]`. ADMIN nunca recibe. Solo usuarios `activo = true`.
- Canal: push + in-app reusando `NotificacionService.enviarNotificacion(firebaseUid, tipo, titulo, mensaje, trabajoId, actionUrl)` con `tipo = TipoNotificacion.ANUNCIO`, `trabajoId = null`, `actionUrl = null`.
- Envío asíncrono; el endpoint devuelve `targetCount` al instante. Un fallo por usuario no corta el resto (try/catch + log).
- Seguridad: `/api/admin/**` ya exige ADMIN (SecurityConfig). No tocar seguridad.
- Backend tests SIN base de datos (Mockito `@InjectMocks`, no `@SpringBootTest`) → corren en el CI.
- Frontend: `apiClient`, React Query y `react-hot-toast` existentes.
- uid admin: `Authentication.getName()`.

---

### Task 1: Backend — enum + repo + BroadcastService (TDD)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java`
- Modify: `backend/src/main/java/com/aliados/backend/repository/UserRepository.java`
- Create: `backend/src/main/java/com/aliados/backend/service/BroadcastService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/BroadcastServiceTest.java`

**Interfaces:**
- Produces: `TipoNotificacion.ANUNCIO`; `UserRepository.findByRoleInAndActivoTrue(Collection<UserRole>)`; `BroadcastService.resolverDestinatarios(String) -> List<User>` (lanza `IllegalArgumentException` si el segmento es inválido); `BroadcastService.enviarAsync(List<String>, String, String, String)`.

- [ ] **Step 1: Agregar el valor al enum**

En `TipoNotificacion.java`, agregar al final de la lista (con la coma en el valor anterior):
```java
    ANUNCIO
```

- [ ] **Step 2: Agregar el método al repository**

En `UserRepository.java` agregar (los imports `List`, `User`, `UserRole` ya están en el archivo; `Collection` es `java.util.Collection`):
```java
    java.util.List<com.aliados.backend.entity.User> findByRoleInAndActivoTrue(
            java.util.Collection<com.aliados.backend.entity.UserRole> roles);
```

- [ ] **Step 3: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/BroadcastServiceTest.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BroadcastServiceTest {

    @Mock UserRepository userRepository;
    @Mock NotificacionService notificacionService;

    @InjectMocks BroadcastService broadcastService;

    @Test
    void resolverDestinatarios_todos_usaClientesYProveedores() {
        broadcastService.resolverDestinatarios("TODOS");
        verify(userRepository).findByRoleInAndActivoTrue(List.of(UserRole.CLIENT, UserRole.PROVIDER));
    }

    @Test
    void resolverDestinatarios_clientes() {
        broadcastService.resolverDestinatarios("CLIENTES");
        verify(userRepository).findByRoleInAndActivoTrue(List.of(UserRole.CLIENT));
    }

    @Test
    void resolverDestinatarios_proveedores() {
        broadcastService.resolverDestinatarios("PROVEEDORES");
        verify(userRepository).findByRoleInAndActivoTrue(List.of(UserRole.PROVIDER));
    }

    @Test
    void resolverDestinatarios_invalido_lanza() {
        assertThatThrownBy(() -> broadcastService.resolverDestinatarios("XXX"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void enviarAsync_notificaACadaUid_conTipoAnuncio() {
        broadcastService.enviarAsync(List.of("u1", "u2"), "Titulo", "Mensaje", "admin-uid");
        verify(notificacionService).enviarNotificacion("u1", TipoNotificacion.ANUNCIO, "Titulo", "Mensaje", null, null);
        verify(notificacionService).enviarNotificacion("u2", TipoNotificacion.ANUNCIO, "Titulo", "Mensaje", null, null);
    }

    @Test
    void enviarAsync_unFalloNoCortaElResto() {
        doThrow(new RuntimeException("boom")).when(notificacionService)
                .enviarNotificacion(eq("u1"), any(), any(), any(), any(), any());
        broadcastService.enviarAsync(List.of("u1", "u2"), "Titulo", "Mensaje", "admin-uid");
        verify(notificacionService).enviarNotificacion("u2", TipoNotificacion.ANUNCIO, "Titulo", "Mensaje", null, null);
    }
}
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*BroadcastServiceTest' --no-daemon`
Expected: FAIL (no compila: `BroadcastService` no existe)

- [ ] **Step 5: Implementar el service**

`backend/src/main/java/com/aliados/backend/service/BroadcastService.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class BroadcastService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastService.class);

    private final UserRepository userRepository;
    private final NotificacionService notificacionService;

    public BroadcastService(UserRepository userRepository, NotificacionService notificacionService) {
        this.userRepository = userRepository;
        this.notificacionService = notificacionService;
    }

    /** Usuarios activos del segmento. ADMIN nunca recibe. */
    public List<User> resolverDestinatarios(String segmento) {
        List<UserRole> roles = switch (segmento == null ? "" : segmento) {
            case "TODOS" -> List.of(UserRole.CLIENT, UserRole.PROVIDER);
            case "CLIENTES" -> List.of(UserRole.CLIENT);
            case "PROVEEDORES" -> List.of(UserRole.PROVIDER);
            default -> throw new IllegalArgumentException("Segmento inválido: " + segmento);
        };
        return userRepository.findByRoleInAndActivoTrue(roles);
    }

    /** Envío asíncrono: una notificación (campanita + push) por usuario. Tolera fallos. */
    @Async
    public void enviarAsync(List<String> firebaseUids, String titulo, String mensaje, String adminUid) {
        log.info("Broadcast a {} usuarios por admin={}", firebaseUids.size(), adminUid);
        for (String uid : firebaseUids) {
            try {
                notificacionService.enviarNotificacion(uid, TipoNotificacion.ANUNCIO, titulo, mensaje, null, null);
            } catch (Exception e) {
                log.error("Error enviando broadcast a {}: {}", uid, e.getMessage());
            }
        }
    }
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*BroadcastServiceTest' --no-daemon`
Expected: PASS (6 tests). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java \
        backend/src/main/java/com/aliados/backend/repository/UserRepository.java \
        backend/src/main/java/com/aliados/backend/service/BroadcastService.java \
        backend/src/test/java/com/aliados/backend/service/BroadcastServiceTest.java
git commit -m "feat(backend): BroadcastService (push + in-app a segmentos de usuarios)"
```

---

### Task 2: Backend — DTOs + controller

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/BroadcastRequest.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/BroadcastResultDto.java`
- Create: `backend/src/main/java/com/aliados/backend/controller/BroadcastAdminController.java`

**Interfaces:**
- Consumes: `BroadcastService.resolverDestinatarios(String)`, `BroadcastService.enviarAsync(List<String>, String, String, String)` (Task 1); `User.getFirebaseUid()`.
- Produces: `POST /api/admin/broadcast` body `BroadcastRequest` → `BroadcastResultDto`.

- [ ] **Step 1: DTO de request**

`backend/src/main/java/com/aliados/backend/dto/BroadcastRequest.java`:
```java
package com.aliados.backend.dto;

public record BroadcastRequest(String segmento, String titulo, String mensaje) {}
```

- [ ] **Step 2: DTO de respuesta**

`backend/src/main/java/com/aliados/backend/dto/BroadcastResultDto.java`:
```java
package com.aliados.backend.dto;

public record BroadcastResultDto(int targetCount) {}
```

- [ ] **Step 3: Controller**

`backend/src/main/java/com/aliados/backend/controller/BroadcastAdminController.java`:
```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.BroadcastRequest;
import com.aliados.backend.dto.BroadcastResultDto;
import com.aliados.backend.entity.User;
import com.aliados.backend.service.BroadcastService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig
// (patrón centralizado, igual que el resto de controllers admin). No se usa @PreAuthorize.
@RestController
@RequestMapping("/api/admin/broadcast")
public class BroadcastAdminController {

    private final BroadcastService broadcastService;

    public BroadcastAdminController(BroadcastService broadcastService) {
        this.broadcastService = broadcastService;
    }

    @PostMapping
    public ResponseEntity<BroadcastResultDto> broadcast(
            @RequestBody BroadcastRequest body,
            Authentication authentication) {
        if (body.titulo() == null || body.titulo().isBlank()
                || body.mensaje() == null || body.mensaje().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título y mensaje son obligatorios");
        }
        List<User> destinatarios;
        try {
            destinatarios = broadcastService.resolverDestinatarios(body.segmento());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        List<String> uids = destinatarios.stream().map(User::getFirebaseUid).toList();
        broadcastService.enviarAsync(uids, body.titulo(), body.mensaje(), authentication.getName());
        return ResponseEntity.ok(new BroadcastResultDto(uids.size()));
    }
}
```

- [ ] **Step 4: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Verificación manual (backend + token ADMIN)**

```bash
curl -s -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"segmento":"CLIENTES","titulo":"Hola","mensaje":"Aviso de prueba"}' \
  http://localhost:8080/api/admin/broadcast
# Esperado: {"targetCount": N}  (y las notificaciones llegan a los clientes activos)

# Segmento inválido / título vacío → 400:
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{"segmento":"XXX","titulo":"x","mensaje":"y"}' \
  http://localhost:8080/api/admin/broadcast   # 400
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/BroadcastRequest.java \
        backend/src/main/java/com/aliados/backend/dto/BroadcastResultDto.java \
        backend/src/main/java/com/aliados/backend/controller/BroadcastAdminController.java
git commit -m "feat(backend): endpoint admin POST /api/admin/broadcast"
```

---

### Task 3: Frontend — panel de broadcast

**Files:**
- Create: `apps/app/src/features/aliados/BroadcastPanel.tsx`
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/broadcast` (Task 2) → `{ targetCount: number }`; `apiClient.post`.
- Produces: componente `<BroadcastPanel />`.

- [ ] **Step 1: Crear el panel**

`apps/app/src/features/aliados/BroadcastPanel.tsx`:
```tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';

type Segmento = 'TODOS' | 'CLIENTES' | 'PROVEEDORES';
const SEGMENTOS: { key: Segmento; label: string }[] = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'CLIENTES', label: 'Clientes' },
  { key: 'PROVEEDORES', label: 'Proveedores' },
];

export function BroadcastPanel() {
  const [segmento, setSegmento] = useState<Segmento>('TODOS');
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');

  const send = useMutation({
    mutationFn: (body: { segmento: Segmento; titulo: string; mensaje: string }) =>
      apiClient.post<{ targetCount: number }>('/api/admin/broadcast', body),
    onSuccess: (res) => {
      toast.success(`Enviado a ${res.targetCount} usuarios`);
      setTitulo('');
      setMensaje('');
    },
    onError: () => toast.error('No se pudo enviar el aviso'),
  });

  const handleSend = () => {
    if (!titulo.trim() || !mensaje.trim()) {
      toast.error('Completá título y mensaje');
      return;
    }
    const label = SEGMENTOS.find((s) => s.key === segmento)!.label;
    if (!window.confirm(`Vas a enviar un aviso a "${label}". ¿Confirmás?`)) return;
    send.mutate({ segmento, titulo, mensaje });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Aviso a usuarios</h2>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {SEGMENTOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegmento(s.key)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                segmento === s.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-dark-bg dark:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
        <textarea
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje" rows={3} />
        <button
          onClick={handleSend}
          disabled={send.isPending}
          className="self-start rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {send.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Embeber el panel en AliadosDashboard**

En `apps/app/src/features/aliados/AliadosDashboard.tsx`:
- Agregar el import: `import { BroadcastPanel } from './BroadcastPanel';`
- Renderizar `<BroadcastPanel />` junto a los otros paneles admin (ej. cerca de `<FeatureFlagsPanel />` / `<MaintenancePanel />`), en un wrapper consistente con el espaciado existente.

- [ ] **Step 3: Typecheck + tests + build**

Run: `pnpm --filter aliados-app exec tsc -b && pnpm --filter aliados-app test && pnpm --filter aliados-app build`
Expected: tsc 0 · vitest PASS · build OK

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/aliados/BroadcastPanel.tsx \
        apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(app): panel de broadcast a usuarios en el admin dashboard"
```

---

## Deploy notes

- Sin migración ni env nuevas. `@EnableAsync` ya está activo.
- A escala (muchos usuarios) migrar `enviarAsync` a FCM multicast/topics y un `TaskExecutor` dedicado — follow-up, no ahora.
