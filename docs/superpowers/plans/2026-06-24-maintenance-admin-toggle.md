# Maintenance toggle en admin panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ **Corrección post-implementación (2026-06-24):** Este plan se escribió usando un
> parámetro `maintenance_eta` que el cliente **no lee**. El review final detectó que el
> cliente real (`apps/app/src/shared/lib/remoteConfig.ts`) usa **`maintenance_schedule`** y
> **`maintenance_duration`** (defaults `""`), y que ya existe el tipo canónico
> `MaintenanceState { level, title, message, schedule, duration }` + `resolveLevel` en
> `apps/app/src/shared/lib/maintenance.ts`. La implementación final (y el spec corregido)
> reflejan **schedule + duration** (5 params) y **reusan** los tipos canónicos del front
> (sin crear `features/aliados/maintenance.ts` ni `isValidLevel`). Los bloques de código de
> abajo conservan el `eta` original como registro histórico — el código real diverge a
> propósito. Fuente de verdad: el código + el spec.

**Goal:** Permitir leer y editar el maintenance mode (nivel + textos) desde el admin panel, escribiendo Firebase Remote Config vía el Admin SDK del backend.

**Architecture:** El backend escribe los 4 parámetros de Remote Config con `FirebaseRemoteConfig` (getTemplate → upsert params → publishTemplate). Endpoints `/api/admin/maintenance` (GET/PUT, ADMIN). El front agrega un panel en `AliadosDashboard`. La lectura de usuarios (banner/gate) sigue client-side, sin cambios.

**Tech Stack:** Spring Boot 3.4.2 (Java 21, `firebase-admin:9.4.2`), Mockito 5.14 (mockea finals), React 19 + React Query + Vitest.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21.
- Remote Config params (exactos): `maintenance_level` (`off`|`warning`|`blocked`), `maintenance_title`, `maintenance_message`, `maintenance_eta`.
- Defaults espejan `apps/app/src/shared/lib/remoteConfig.ts`: level `off`, title `Estamos en mantenimiento`, message `Estamos realizando tareas de mantenimiento, volveremos a la brevedad.`, eta `""`.
- Backend tests SIN base de datos (Mockito sobre `FirebaseRemoteConfig`, no `@SpringBootTest`) → corren en el CI.
- Seguridad: `/api/admin/**` ya exige ADMIN (SecurityConfig). No tocar seguridad.
- La lectura client-side (`useMaintenance`) NO se modifica.
- Frontend: usar `apiClient` (`get`/`put`), React Query y `react-hot-toast` existentes.
- uid admin: `Authentication.getName()`.

---

### Task 1: Backend — bean + MaintenanceService (TDD)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/config/FirebaseConfig.java`
- Create: `backend/src/main/java/com/aliados/backend/service/MaintenanceService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/MaintenanceServiceTest.java`

**Interfaces:**
- Produces:
  - `@Bean FirebaseRemoteConfig firebaseRemoteConfig(FirebaseApp app)`.
  - `MaintenanceService` con `MaintenanceState get() throws FirebaseRemoteConfigException`, `MaintenanceState update(String level, String title, String message, String eta, String adminUid) throws FirebaseRemoteConfigException` (lanza `IllegalArgumentException` si el nivel es inválido), y el record anidado `MaintenanceService.MaintenanceState(String level, String title, String message, String eta)`.

- [ ] **Step 1: Agregar el bean FirebaseRemoteConfig**

En `FirebaseConfig.java`, agregar imports y un `@Bean` que dependa del `FirebaseApp` ya definido:
```java
import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
```
```java
    @Bean
    public FirebaseRemoteConfig firebaseRemoteConfig(FirebaseApp app) {
        return FirebaseRemoteConfig.getInstance(app);
    }
```

- [ ] **Step 2: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/MaintenanceServiceTest.java`:
```java
package com.aliados.backend.service;

import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
import com.google.firebase.remoteconfig.Parameter;
import com.google.firebase.remoteconfig.ParameterValue;
import com.google.firebase.remoteconfig.Template;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MaintenanceServiceTest {

    private FirebaseRemoteConfig rc;
    private MaintenanceService service;

    @BeforeEach
    void setUp() {
        rc = mock(FirebaseRemoteConfig.class);
        service = new MaintenanceService(rc);
    }

    private Template templateWith(Map<String, String> values) {
        Template t = new Template("etag");
        Map<String, Parameter> params = new HashMap<>();
        values.forEach((k, v) -> params.put(k, new Parameter().setDefaultValue(ParameterValue.of(v))));
        t.setParameters(params);
        return t;
    }

    @Test
    void get_leeLosParametros() throws Exception {
        when(rc.getTemplate()).thenReturn(templateWith(Map.of(
                "maintenance_level", "warning",
                "maintenance_title", "Hola",
                "maintenance_message", "Mensaje",
                "maintenance_eta", "10 min")));
        MaintenanceService.MaintenanceState s = service.get();
        assertThat(s.level()).isEqualTo("warning");
        assertThat(s.title()).isEqualTo("Hola");
        assertThat(s.message()).isEqualTo("Mensaje");
        assertThat(s.eta()).isEqualTo("10 min");
    }

    @Test
    void get_parametrosAusentes_usaDefaults() throws Exception {
        when(rc.getTemplate()).thenReturn(templateWith(Map.of()));
        MaintenanceService.MaintenanceState s = service.get();
        assertThat(s.level()).isEqualTo("off");
        assertThat(s.title()).isEqualTo("Estamos en mantenimiento");
        assertThat(s.eta()).isEqualTo("");
    }

    @Test
    void update_nivelInvalido_lanzaIllegalArgument() {
        assertThatThrownBy(() -> service.update("apagado", "t", "m", "e", "admin"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_publicaTemplateActualizado() throws Exception {
        when(rc.getTemplate()).thenReturn(templateWith(Map.of("maintenance_level", "off")));
        when(rc.publishTemplate(any(Template.class))).thenAnswer(inv -> inv.getArgument(0));

        MaintenanceService.MaintenanceState s =
                service.update("blocked", "Caído", "Volvemos", "5 min", "admin-uid");

        assertThat(s.level()).isEqualTo("blocked");
        verify(rc).getTemplate(); // re-lee antes de publicar
        ArgumentCaptor<Template> captor = ArgumentCaptor.forClass(Template.class);
        verify(rc).publishTemplate(captor.capture());
        Parameter p = captor.getValue().getParameters().get("maintenance_level");
        assertThat(((ParameterValue.Explicit) p.getDefaultValue()).getValue()).isEqualTo("blocked");
    }
}
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*MaintenanceServiceTest' --no-daemon`
Expected: FAIL (no compila: `MaintenanceService` no existe)

- [ ] **Step 4: Implementar el service**

`backend/src/main/java/com/aliados/backend/service/MaintenanceService.java`:
```java
package com.aliados.backend.service;

import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException;
import com.google.firebase.remoteconfig.Parameter;
import com.google.firebase.remoteconfig.ParameterValue;
import com.google.firebase.remoteconfig.Template;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Service
public class MaintenanceService {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceService.class);

    private static final String LEVEL = "maintenance_level";
    private static final String TITLE = "maintenance_title";
    private static final String MESSAGE = "maintenance_message";
    private static final String ETA = "maintenance_eta";

    private static final Set<String> VALID_LEVELS = Set.of("off", "warning", "blocked");

    // Defaults espejan el DEFAULTS del front (remoteConfig.ts).
    private static final String DEFAULT_LEVEL = "off";
    private static final String DEFAULT_TITLE = "Estamos en mantenimiento";
    private static final String DEFAULT_MESSAGE =
            "Estamos realizando tareas de mantenimiento, volveremos a la brevedad.";
    private static final String DEFAULT_ETA = "";

    private final FirebaseRemoteConfig remoteConfig;

    public MaintenanceService(FirebaseRemoteConfig remoteConfig) {
        this.remoteConfig = remoteConfig;
    }

    public MaintenanceState get() throws FirebaseRemoteConfigException {
        Map<String, Parameter> params = remoteConfig.getTemplate().getParameters();
        return new MaintenanceState(
                read(params, LEVEL, DEFAULT_LEVEL),
                read(params, TITLE, DEFAULT_TITLE),
                read(params, MESSAGE, DEFAULT_MESSAGE),
                read(params, ETA, DEFAULT_ETA));
    }

    public MaintenanceState update(String level, String title, String message, String eta, String adminUid)
            throws FirebaseRemoteConfigException {
        if (level == null || !VALID_LEVELS.contains(level)) {
            throw new IllegalArgumentException("Nivel inválido: " + level + " (off|warning|blocked)");
        }
        String safeEta = eta == null ? "" : eta;

        Template t = remoteConfig.getTemplate(); // versión actual → evita conflicto de ETag
        Map<String, Parameter> params = new HashMap<>(t.getParameters());
        params.put(LEVEL, param(level));
        params.put(TITLE, param(title));
        params.put(MESSAGE, param(message));
        params.put(ETA, param(safeEta));
        t.setParameters(params);
        remoteConfig.publishTemplate(t);

        log.info("Maintenance actualizado a level={} por admin={}", level, adminUid);
        return new MaintenanceState(level, title, message, safeEta);
    }

    private static Parameter param(String value) {
        return new Parameter().setDefaultValue(ParameterValue.of(value == null ? "" : value));
    }

    private static String read(Map<String, Parameter> params, String key, String fallback) {
        Parameter p = params.get(key);
        if (p == null) return fallback;
        if (p.getDefaultValue() instanceof ParameterValue.Explicit explicit) {
            String value = explicit.getValue();
            return value != null ? value : fallback;
        }
        return fallback;
    }

    public record MaintenanceState(String level, String title, String message, String eta) {}
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*MaintenanceServiceTest' --no-daemon`
Expected: PASS (4 tests). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/config/FirebaseConfig.java \
        backend/src/main/java/com/aliados/backend/service/MaintenanceService.java \
        backend/src/test/java/com/aliados/backend/service/MaintenanceServiceTest.java
git commit -m "feat(backend): MaintenanceService (Remote Config vía Admin SDK)"
```

---

### Task 2: Backend — DTOs + controller

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/MaintenanceStateDto.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/UpdateMaintenanceRequest.java`
- Create: `backend/src/main/java/com/aliados/backend/controller/MaintenanceAdminController.java`

**Interfaces:**
- Consumes: `MaintenanceService.get()`, `MaintenanceService.update(...)`, `MaintenanceService.MaintenanceState` (Task 1).
- Produces: `GET /api/admin/maintenance` → `MaintenanceStateDto`; `PUT /api/admin/maintenance` body `UpdateMaintenanceRequest` → `MaintenanceStateDto`.

- [ ] **Step 1: DTO de respuesta**

`backend/src/main/java/com/aliados/backend/dto/MaintenanceStateDto.java`:
```java
package com.aliados.backend.dto;

public record MaintenanceStateDto(String level, String title, String message, String eta) {}
```

- [ ] **Step 2: DTO de request**

`backend/src/main/java/com/aliados/backend/dto/UpdateMaintenanceRequest.java`:
```java
package com.aliados.backend.dto;

public record UpdateMaintenanceRequest(String level, String title, String message, String eta) {}
```

- [ ] **Step 3: Controller**

`backend/src/main/java/com/aliados/backend/controller/MaintenanceAdminController.java`:
```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.MaintenanceStateDto;
import com.aliados.backend.dto.UpdateMaintenanceRequest;
import com.aliados.backend.service.MaintenanceService;
import com.aliados.backend.service.MaintenanceService.MaintenanceState;
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

// Autorización: bajo /api/admin/** → gateado por .hasRole("ADMIN") en SecurityConfig
// (patrón centralizado, igual que AdminController). No se usa @PreAuthorize por método.
@RestController
@RequestMapping("/api/admin/maintenance")
public class MaintenanceAdminController {

    private final MaintenanceService maintenanceService;

    public MaintenanceAdminController(MaintenanceService maintenanceService) {
        this.maintenanceService = maintenanceService;
    }

    @GetMapping
    public ResponseEntity<MaintenanceStateDto> get() {
        try {
            return ResponseEntity.ok(toDto(maintenanceService.get()));
        } catch (FirebaseRemoteConfigException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo leer Remote Config: " + e.getMessage());
        }
    }

    @PutMapping
    public ResponseEntity<MaintenanceStateDto> update(
            @RequestBody UpdateMaintenanceRequest body,
            Authentication authentication) {
        try {
            MaintenanceState s = maintenanceService.update(
                    body.level(), body.title(), body.message(), body.eta(), authentication.getName());
            return ResponseEntity.ok(toDto(s));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (FirebaseRemoteConfigException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo publicar Remote Config: " + e.getMessage());
        }
    }

    private static MaintenanceStateDto toDto(MaintenanceState s) {
        return new MaintenanceStateDto(s.level(), s.title(), s.message(), s.eta());
    }
}
```

- [ ] **Step 4: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Verificación manual (backend levantado + token ADMIN)**

```bash
# Leer estado:
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:8080/api/admin/maintenance
# Esperado: {"level":"off",...}

# Activar warning:
curl -s -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"level":"warning","title":"Aviso","message":"Mantenimiento programado","eta":"30 min"}' \
  http://localhost:8080/api/admin/maintenance
# Esperado: 200 con level "warning"

# Nivel inválido:
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{"level":"xxx","title":"","message":"","eta":""}' \
  http://localhost:8080/api/admin/maintenance
# Esperado: 400
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/MaintenanceStateDto.java \
        backend/src/main/java/com/aliados/backend/dto/UpdateMaintenanceRequest.java \
        backend/src/main/java/com/aliados/backend/controller/MaintenanceAdminController.java
git commit -m "feat(backend): endpoints admin /api/admin/maintenance"
```

---

### Task 3: Frontend — panel de mantenimiento

**Files:**
- Create: `apps/app/src/features/aliados/maintenance.ts`
- Test: `apps/app/src/features/aliados/__tests__/maintenance.test.ts`
- Create: `apps/app/src/features/aliados/MaintenancePanel.tsx`
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/maintenance`, `PUT /api/admin/maintenance` (Task 2); `apiClient` (`get`, `put`).
- Produces: `isValidLevel(value: string): boolean`, types `MaintenanceLevel` / `MaintenanceState`; componente `<MaintenancePanel />`.

- [ ] **Step 1: Escribir el test que falla**

`apps/app/src/features/aliados/__tests__/maintenance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isValidLevel } from '../maintenance';

describe('isValidLevel', () => {
  it('acepta los niveles válidos', () => {
    expect(isValidLevel('off')).toBe(true);
    expect(isValidLevel('warning')).toBe(true);
    expect(isValidLevel('blocked')).toBe(true);
  });
  it('rechaza cualquier otro valor', () => {
    expect(isValidLevel('apagado')).toBe(false);
    expect(isValidLevel('')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter aliados-app exec vitest run src/features/aliados/__tests__/maintenance.test.ts`
Expected: FAIL (`isValidLevel` no existe)

- [ ] **Step 3: Implementar el helper**

`apps/app/src/features/aliados/maintenance.ts`:
```ts
export type MaintenanceLevel = 'off' | 'warning' | 'blocked';

export interface MaintenanceState {
  level: MaintenanceLevel;
  title: string;
  message: string;
  eta: string;
}

const LEVELS: MaintenanceLevel[] = ['off', 'warning', 'blocked'];

export function isValidLevel(value: string): value is MaintenanceLevel {
  return (LEVELS as string[]).includes(value);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter aliados-app exec vitest run src/features/aliados/__tests__/maintenance.test.ts`
Expected: PASS

- [ ] **Step 5: Crear el panel**

`apps/app/src/features/aliados/MaintenancePanel.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';
import { type MaintenanceLevel, type MaintenanceState, isValidLevel } from './maintenance';

const LEVEL_META: Record<MaintenanceLevel, { label: string; dot: string }> = {
  off: { label: 'Operativo', dot: 'bg-green-500' },
  warning: { label: 'Aviso', dot: 'bg-amber-500' },
  blocked: { label: 'Bloqueado', dot: 'bg-red-500' },
};

export function MaintenancePanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<MaintenanceState>({
    queryKey: ['admin-maintenance'],
    queryFn: () => apiClient.get('/api/admin/maintenance'),
  });

  const [level, setLevel] = useState<MaintenanceLevel>('off');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [eta, setEta] = useState('');

  useEffect(() => {
    if (data) {
      // Sanitiza el nivel que viene del backend antes de usarlo.
      setLevel(isValidLevel(data.level) ? data.level : 'off');
      setTitle(data.title);
      setMessage(data.message);
      setEta(data.eta);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (body: MaintenanceState) => apiClient.put('/api/admin/maintenance', body),
    onSuccess: () => {
      toast.success('Mantenimiento actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-maintenance'] });
    },
    onError: () => toast.error('No se pudo actualizar el mantenimiento'),
  });

  const handleSave = () => {
    if (level === 'blocked' &&
        !window.confirm('Esto bloquea el acceso a TODOS los usuarios. ¿Confirmás?')) {
      return;
    }
    save.mutate({ level, title, message, eta });
  };

  if (isLoading) return <p className="text-sm text-slate-500">Cargando mantenimiento…</p>;

  const meta = LEVEL_META[level];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Mantenimiento · {meta.label}
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(['off', 'warning', 'blocked'] as MaintenanceLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                level === l
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-dark-bg dark:text-slate-200'
              }`}
            >
              {LEVEL_META[l].label}
            </button>
          ))}
        </div>
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        <textarea
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensaje" rows={2} />
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={eta} onChange={(e) => setEta(e.target.value)} placeholder="ETA (ej. ~15 min)" />
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="self-start rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Embeber el panel en AliadosDashboard**

En `apps/app/src/features/aliados/AliadosDashboard.tsx`:
- Agregar el import: `import { MaintenancePanel } from './MaintenancePanel';`
- Renderizar `<MaintenancePanel />` junto al `<FeatureFlagsPanel />` (misma zona del dashboard, en un wrapper consistente con el espaciado existente, ej. `<div className="mt-4">`).

- [ ] **Step 7: Typecheck + tests + build**

Run: `pnpm --filter aliados-app exec tsc -b && pnpm --filter aliados-app test && pnpm --filter aliados-app build`
Expected: tsc 0 · vitest PASS (incluye maintenance) · build OK

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/features/aliados/maintenance.ts \
        apps/app/src/features/aliados/__tests__/maintenance.test.ts \
        apps/app/src/features/aliados/MaintenancePanel.tsx \
        apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(app): panel de mantenimiento en el admin dashboard"
```

---

## Deploy notes

- El service account del backend (Firebase Admin) necesita permiso para publicar Remote Config (rol **Firebase Remote Config Admin** o equivalente). Si falta, `publishTemplate` devuelve 403 → el PUT responde 502. Verificar/asignar el rol antes de usar en prod.
- La primera escritura crea los parámetros en el template publicado si aún no existían.
