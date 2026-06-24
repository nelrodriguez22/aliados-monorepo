# Feature Flags operativos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de feature flags tipados en la DB del backend, manejable desde el admin dashboard, que reemplaza la env var `MUDANZA_RATIO_TIEMPO`.

**Architecture:** Tabla `feature_flags` (Flyway) + `FeatureFlagService` con cache en memoria y getters tipados con default seguro. Endpoints `/api/admin/feature-flags` (ADMIN) para listar/editar. `MudanzaService` lee el ratio del flag en vez de `@Value`. Panel en `AliadosDashboard` para togglear.

**Tech Stack:** Spring Boot 3 (Java 21, Lombok, JPA, Flyway), React 19 + React Query + Vitest, pnpm/turbo.

## Global Constraints

- Java 21, Gradle 8.5. Backend package raíz: `com.aliados.backend`.
- Flyway es la única fuente de verdad del esquema. Próxima versión: `V3`.
- Seguridad: `/api/admin/**` ya exige `.hasRole("ADMIN")` (SecurityConfig). No tocar seguridad.
- Default seguro: un flag ausente/disabled/ilegible nunca rompe — devuelve el fallback.
- Tests del backend deben correr **sin DB** (el CI no tiene Postgres) → usar Mockito, no `@SpringBootTest`.
- Frontend: usar `apiClient` (`@/shared/lib/apiClient`) y React Query existentes. Toasts con `react-hot-toast`.
- uid del admin: parámetro `Authentication authentication` en el controller → `authentication.getName()`.

---

### Task 1: Capa de persistencia (migración + entity + repository)

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__feature_flags.sql`
- Create: `backend/src/main/java/com/aliados/backend/entity/FeatureFlag.java`
- Create: `backend/src/main/java/com/aliados/backend/repository/FeatureFlagRepository.java`

**Interfaces:**
- Produces: entity `FeatureFlag` con getters/setters Lombok (`getKey`, `getEnabled`, `getValue`, `getValueType`, `getDescription`, `getUpdatedAt`, `getUpdatedBy` + setters); `FeatureFlagRepository extends JpaRepository<FeatureFlag, String>`.

- [ ] **Step 1: Crear la migración Flyway**

`backend/src/main/resources/db/migration/V3__feature_flags.sql`:
```sql
CREATE TABLE feature_flags (
    key         VARCHAR(100) PRIMARY KEY,
    enabled     BOOLEAN      NOT NULL DEFAULT false,
    value       TEXT,
    value_type  VARCHAR(20)  NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ,
    updated_by  VARCHAR(128)
);

-- Seed idempotente: no pisa cambios hechos en runtime por el admin.
INSERT INTO feature_flags (key, enabled, value, value_type, description)
VALUES (
    'mudanza_ratio_tiempo', true, '1.0', 'NUMBER',
    'Ratio de aceleración del tiempo en mudanzas (1.0 = real, 180 = testing).'
)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Crear la entity**

`backend/src/main/java/com/aliados/backend/entity/FeatureFlag.java`:
```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "feature_flags")
@Data
public class FeatureFlag {

    @Id
    @Column(name = "key", length = 100)
    private String key;

    @Column(nullable = false)
    private Boolean enabled = false;

    @Column(columnDefinition = "TEXT")
    private String value;

    @Column(name = "value_type", nullable = false, length = 20)
    private String valueType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;
}
```

- [ ] **Step 3: Crear el repository**

`backend/src/main/java/com/aliados/backend/repository/FeatureFlagRepository.java`:
```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.FeatureFlag;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeatureFlagRepository extends JpaRepository<FeatureFlag, String> {
}
```

- [ ] **Step 4: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V3__feature_flags.sql \
        backend/src/main/java/com/aliados/backend/entity/FeatureFlag.java \
        backend/src/main/java/com/aliados/backend/repository/FeatureFlagRepository.java
git commit -m "feat(backend): tabla feature_flags + entity + repository"
```

---

### Task 2: FeatureFlagService (cache + getters tipados + update) — TDD

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/service/FeatureFlagService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/FeatureFlagServiceTest.java`

**Interfaces:**
- Consumes: `FeatureFlag` entity, `FeatureFlagRepository` (Task 1).
- Produces:
  - `boolean isEnabled(String key)`
  - `double getNumber(String key, double fallback)`
  - `String getString(String key, String fallback)`
  - `List<FeatureFlag> getAll()`
  - `FeatureFlag update(String key, boolean enabled, String value, String updatedBy)` — lanza `NoSuchElementException` si la key no existe, `IllegalArgumentException` si el valor no valida contra `value_type`.
  - `void reload()` — recarga el cache desde la DB.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/FeatureFlagServiceTest.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.FeatureFlag;
import com.aliados.backend.repository.FeatureFlagRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeatureFlagServiceTest {

    private FeatureFlagRepository repo;
    private FeatureFlagService service;

    private FeatureFlag flag(String key, boolean enabled, String value, String type) {
        FeatureFlag f = new FeatureFlag();
        f.setKey(key);
        f.setEnabled(enabled);
        f.setValue(value);
        f.setValueType(type);
        return f;
    }

    @BeforeEach
    void setUp() {
        repo = mock(FeatureFlagRepository.class);
        when(repo.findAll()).thenReturn(List.of(
            flag("mudanza_ratio_tiempo", true, "180", "NUMBER"),
            flag("apagado", false, "5", "NUMBER"),
            flag("nombre", true, "hola", "STRING")
        ));
        service = new FeatureFlagService(repo, new ObjectMapper());
        service.reload();
    }

    @Test
    void getNumber_devuelveValorDelFlagHabilitado() {
        assertThat(service.getNumber("mudanza_ratio_tiempo", 1.0)).isEqualTo(180.0);
    }

    @Test
    void getNumber_flagDeshabilitado_devuelveFallback() {
        assertThat(service.getNumber("apagado", 1.0)).isEqualTo(1.0);
    }

    @Test
    void getNumber_flagAusente_devuelveFallback() {
        assertThat(service.getNumber("no_existe", 1.0)).isEqualTo(1.0);
    }

    @Test
    void isEnabled_reflejaElEstado() {
        assertThat(service.isEnabled("mudanza_ratio_tiempo")).isTrue();
        assertThat(service.isEnabled("apagado")).isFalse();
        assertThat(service.isEnabled("no_existe")).isFalse();
    }

    @Test
    void update_keyInexistente_lanzaNoSuchElement() {
        when(repo.findById("no_existe")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update("no_existe", true, "1", "admin-uid"))
            .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void update_valorNoNumerico_paraTipoNumber_lanzaIllegalArgument() {
        when(repo.findById("mudanza_ratio_tiempo"))
            .thenReturn(Optional.of(flag("mudanza_ratio_tiempo", true, "1.0", "NUMBER")));
        assertThatThrownBy(() -> service.update("mudanza_ratio_tiempo", true, "abc", "admin-uid"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_valido_persisteYActualizaCache() {
        FeatureFlag existing = flag("mudanza_ratio_tiempo", true, "1.0", "NUMBER");
        when(repo.findById("mudanza_ratio_tiempo")).thenReturn(Optional.of(existing));
        when(repo.save(existing)).thenReturn(existing);

        service.update("mudanza_ratio_tiempo", true, "180", "admin-uid");

        assertThat(service.getNumber("mudanza_ratio_tiempo", 1.0)).isEqualTo(180.0);
        assertThat(existing.getUpdatedBy()).isEqualTo("admin-uid");
        verify(repo).save(existing);
    }
}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*FeatureFlagServiceTest' --no-daemon`
Expected: FAIL (no compila: `FeatureFlagService` no existe)

- [ ] **Step 3: Implementar el service**

`backend/src/main/java/com/aliados/backend/service/FeatureFlagService.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.FeatureFlag;
import com.aliados.backend.repository.FeatureFlagRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FeatureFlagService {

    private static final Logger log = LoggerFactory.getLogger(FeatureFlagService.class);

    private final FeatureFlagRepository repository;
    private final ObjectMapper objectMapper;
    private final Map<String, FeatureFlag> cache = new ConcurrentHashMap<>();

    public FeatureFlagService(FeatureFlagRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    // Carga inicial + recarga periódica (robustez ante multi-instancia a futuro).
    @PostConstruct
    @Scheduled(fixedDelay = 60_000)
    public void reload() {
        Map<String, FeatureFlag> fresh = new HashMap<>();
        for (FeatureFlag f : repository.findAll()) {
            fresh.put(f.getKey(), f);
        }
        cache.clear();
        cache.putAll(fresh);
    }

    public boolean isEnabled(String key) {
        FeatureFlag f = cache.get(key);
        return f != null && Boolean.TRUE.equals(f.getEnabled());
    }

    public double getNumber(String key, double fallback) {
        FeatureFlag f = cache.get(key);
        if (f == null || !Boolean.TRUE.equals(f.getEnabled()) || f.getValue() == null) {
            return fallback;
        }
        try {
            return Double.parseDouble(f.getValue());
        } catch (NumberFormatException e) {
            log.warn("Flag {} con valor '{}' no es NUMBER; usando fallback {}", key, f.getValue(), fallback);
            return fallback;
        }
    }

    public String getString(String key, String fallback) {
        FeatureFlag f = cache.get(key);
        if (f == null || !Boolean.TRUE.equals(f.getEnabled()) || f.getValue() == null) {
            return fallback;
        }
        return f.getValue();
    }

    public List<FeatureFlag> getAll() {
        return repository.findAll();
    }

    @Transactional
    public FeatureFlag update(String key, boolean enabled, String value, String updatedBy) {
        FeatureFlag f = repository.findById(key)
            .orElseThrow(() -> new NoSuchElementException("Feature flag no encontrado: " + key));
        validateValue(f.getValueType(), value);
        f.setEnabled(enabled);
        f.setValue(value);
        f.setUpdatedBy(updatedBy);
        f.setUpdatedAt(Instant.now());
        FeatureFlag saved = repository.save(f);
        cache.put(key, saved); // write-through
        return saved;
    }

    private void validateValue(String valueType, String value) {
        if (value == null) return; // el valor es opcional
        switch (valueType) {
            case "NUMBER" -> {
                try {
                    Double.parseDouble(value);
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("El valor debe ser un número");
                }
            }
            case "BOOLEAN" -> {
                if (!value.equals("true") && !value.equals("false")) {
                    throw new IllegalArgumentException("El valor debe ser 'true' o 'false'");
                }
            }
            case "JSON" -> {
                try {
                    objectMapper.readTree(value);
                } catch (Exception e) {
                    throw new IllegalArgumentException("El valor debe ser JSON válido");
                }
            }
            case "STRING" -> { /* cualquier string es válido */ }
            default -> { /* tipo desconocido: no validar */ }
        }
    }
}
```

- [ ] **Step 4: Habilitar @Scheduled (si no estaba)**

Verificar que la app tenga `@EnableScheduling`. Run:
`grep -rn "@EnableScheduling" backend/src/main/java`
Si no aparece, agregarlo a `AliadosWebBackendApplication.java` debajo de `@SpringBootApplication`:
```java
import org.springframework.scheduling.annotation.EnableScheduling;
// ...
@SpringBootApplication
@EnableScheduling
public class AliadosWebBackendApplication {
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*FeatureFlagServiceTest' --no-daemon`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/FeatureFlagService.java \
        backend/src/test/java/com/aliados/backend/service/FeatureFlagServiceTest.java \
        backend/src/main/java/com/aliados/backend/AliadosWebBackendApplication.java
git commit -m "feat(backend): FeatureFlagService con cache y getters tipados"
```

---

### Task 3: Endpoints admin (DTOs + controller)

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/FeatureFlagDto.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/UpdateFeatureFlagRequest.java`
- Create: `backend/src/main/java/com/aliados/backend/controller/FeatureFlagAdminController.java`

**Interfaces:**
- Consumes: `FeatureFlagService.getAll()`, `FeatureFlagService.update(...)` (Task 2).
- Produces: `GET /api/admin/feature-flags` → `List<FeatureFlagDto>`; `PUT /api/admin/feature-flags/{key}` body `UpdateFeatureFlagRequest` → `FeatureFlagDto`.

- [ ] **Step 1: Crear el DTO de respuesta**

`backend/src/main/java/com/aliados/backend/dto/FeatureFlagDto.java`:
```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.FeatureFlag;

import java.time.Instant;

public record FeatureFlagDto(
        String key,
        boolean enabled,
        String value,
        String valueType,
        String description,
        Instant updatedAt,
        String updatedBy
) {
    public static FeatureFlagDto from(FeatureFlag f) {
        return new FeatureFlagDto(
                f.getKey(),
                Boolean.TRUE.equals(f.getEnabled()),
                f.getValue(),
                f.getValueType(),
                f.getDescription(),
                f.getUpdatedAt(),
                f.getUpdatedBy()
        );
    }
}
```

- [ ] **Step 2: Crear el DTO de request**

`backend/src/main/java/com/aliados/backend/dto/UpdateFeatureFlagRequest.java`:
```java
package com.aliados.backend.dto;

public record UpdateFeatureFlagRequest(
        boolean enabled,
        String value
) {}
```

- [ ] **Step 3: Crear el controller**

`backend/src/main/java/com/aliados/backend/controller/FeatureFlagAdminController.java`:
```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.FeatureFlagDto;
import com.aliados.backend.dto.UpdateFeatureFlagRequest;
import com.aliados.backend.service.FeatureFlagService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/admin/feature-flags")
public class FeatureFlagAdminController {

    private final FeatureFlagService featureFlagService;

    public FeatureFlagAdminController(FeatureFlagService featureFlagService) {
        this.featureFlagService = featureFlagService;
    }

    @GetMapping
    public ResponseEntity<List<FeatureFlagDto>> list() {
        List<FeatureFlagDto> flags = featureFlagService.getAll().stream()
                .map(FeatureFlagDto::from)
                .toList();
        return ResponseEntity.ok(flags);
    }

    @PutMapping("/{key}")
    public ResponseEntity<FeatureFlagDto> update(
            @PathVariable String key,
            @RequestBody UpdateFeatureFlagRequest body,
            Authentication authentication) {
        String adminUid = authentication.getName();
        try {
            FeatureFlagDto dto = FeatureFlagDto.from(
                    featureFlagService.update(key, body.enabled(), body.value(), adminUid));
            return ResponseEntity.ok(dto);
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
```

- [ ] **Step 4: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Verificación manual (con backend levantado + DB)**

```bash
# Listar (requiere token ADMIN):
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:8080/api/admin/feature-flags
# Esperado: JSON con mudanza_ratio_tiempo (enabled true, value "1.0", valueType NUMBER)

# Editar:
curl -s -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"enabled":true,"value":"180"}' http://localhost:8080/api/admin/feature-flags/mudanza_ratio_tiempo
# Esperado: 200 con value "180"

# Valor inválido:
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{"enabled":true,"value":"abc"}' \
  http://localhost:8080/api/admin/feature-flags/mudanza_ratio_tiempo
# Esperado: 400
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/FeatureFlagDto.java \
        backend/src/main/java/com/aliados/backend/dto/UpdateFeatureFlagRequest.java \
        backend/src/main/java/com/aliados/backend/controller/FeatureFlagAdminController.java
git commit -m "feat(backend): endpoints admin /api/admin/feature-flags"
```

---

### Task 4: Rewire de MudanzaService al flag

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/MudanzaService.java` (campo `ratioTiempo` ~líneas 54-55, uso ~línea 460, constructor/inyección)
- Modify: `backend/src/main/resources/application.properties` (línea `mudanza.ratio-tiempo`)

**Interfaces:**
- Consumes: `FeatureFlagService.getNumber("mudanza_ratio_tiempo", 1.0)` (Task 2).

- [ ] **Step 1: Inyectar FeatureFlagService y borrar el @Value**

En `MudanzaService.java`, eliminar el campo:
```java
    @Value("${mudanza.ratio-tiempo:1.0}")
    private Double ratioTiempo;
```
Agregar `FeatureFlagService` como dependencia. Si la clase usa `@Autowired` por campo, agregar:
```java
    @Autowired
    private FeatureFlagService featureFlagService;
```
(Si usa inyección por constructor, agregarlo al constructor existente. Verificar con
`grep -n "private final\|@Autowired\|public MudanzaService" MudanzaService.java`.)

Quitar el import de `org.springframework.beans.factory.annotation.Value` si ya no se usa
(`grep -c "@Value" MudanzaService.java` → si 0, borrar el import).

- [ ] **Step 2: Leer el ratio del flag en el punto de uso**

Reemplazar (~línea 460):
```java
        // Aplicar ratio de testing
        long minutosServicio = Math.round(minutosReales * ratioTiempo);
```
por:
```java
        // Ratio desde feature flag (default 1.0 = tiempo real). Reemplaza la env var
        // MUDANZA_RATIO_TIEMPO: ahora se togglea desde el admin, sin redeploy.
        double ratioTiempo = featureFlagService.getNumber("mudanza_ratio_tiempo", 1.0);
        long minutosServicio = Math.round(minutosReales * ratioTiempo);
```

- [ ] **Step 3: Borrar la config de application.properties**

En `backend/src/main/resources/application.properties`, eliminar el bloque:
```
# Testing: setear MUDANZA_RATIO_TIEMPO=180 (1 min real = 3 horas de servicio) para no
# ... (comentarios)
mudanza.ratio-tiempo=${MUDANZA_RATIO_TIEMPO:1.0}
```

- [ ] **Step 4: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL (sin referencias colgadas a `ratioTiempo` campo ni `@Value`)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/MudanzaService.java \
        backend/src/main/resources/application.properties
git commit -m "refactor(backend): mudanza ratio desde feature flag en vez de env var"
```

---

### Task 5: Panel de admin en el frontend

**Files:**
- Create: `apps/app/src/features/aliados/featureFlags.ts` (helper de validación)
- Test: `apps/app/src/features/aliados/__tests__/featureFlags.test.ts`
- Create: `apps/app/src/features/aliados/FeatureFlagsPanel.tsx`
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx` (embeber el panel)

**Interfaces:**
- Consumes: `GET /api/admin/feature-flags`, `PUT /api/admin/feature-flags/{key}` (Task 3); `apiClient` (`get`, `put`).
- Produces: `validateFlagValue(valueType: string, value: string): string | null` (mensaje de error o null); componente `<FeatureFlagsPanel />`.

- [ ] **Step 1: Escribir el test que falla (helper de validación)**

`apps/app/src/features/aliados/__tests__/featureFlags.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateFlagValue } from '../featureFlags';

describe('validateFlagValue', () => {
  it('NUMBER válido devuelve null', () => {
    expect(validateFlagValue('NUMBER', '180')).toBeNull();
    expect(validateFlagValue('NUMBER', '1.5')).toBeNull();
  });

  it('NUMBER inválido devuelve mensaje', () => {
    expect(validateFlagValue('NUMBER', 'abc')).toMatch(/número/i);
  });

  it('BOOLEAN sólo acepta true/false', () => {
    expect(validateFlagValue('BOOLEAN', 'true')).toBeNull();
    expect(validateFlagValue('BOOLEAN', 'false')).toBeNull();
    expect(validateFlagValue('BOOLEAN', 'si')).toMatch(/true|false/i);
  });

  it('JSON inválido devuelve mensaje', () => {
    expect(validateFlagValue('JSON', '{bad')).toMatch(/json/i);
    expect(validateFlagValue('JSON', '{"a":1}')).toBeNull();
  });

  it('STRING acepta cualquier cosa', () => {
    expect(validateFlagValue('STRING', 'lo que sea')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter aliados-app exec vitest run src/features/aliados/__tests__/featureFlags.test.ts`
Expected: FAIL (`validateFlagValue` no existe)

- [ ] **Step 3: Implementar el helper**

`apps/app/src/features/aliados/featureFlags.ts`:
```ts
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  value: string | null;
  valueType: 'BOOLEAN' | 'NUMBER' | 'STRING' | 'JSON';
  description: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Valida un valor contra su tipo. Devuelve el mensaje de error o null si es válido. */
export function validateFlagValue(valueType: string, value: string): string | null {
  switch (valueType) {
    case 'NUMBER':
      return Number.isNaN(Number(value)) || value.trim() === ''
        ? 'El valor debe ser un número'
        : null;
    case 'BOOLEAN':
      return value === 'true' || value === 'false'
        ? null
        : "El valor debe ser 'true' o 'false'";
    case 'JSON':
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'El valor debe ser JSON válido';
      }
    default:
      return null; // STRING / desconocido
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter aliados-app exec vitest run src/features/aliados/__tests__/featureFlags.test.ts`
Expected: PASS

- [ ] **Step 5: Crear el panel**

`apps/app/src/features/aliados/FeatureFlagsPanel.tsx`:
```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/lib/apiClient';
import { type FeatureFlag, validateFlagValue } from './featureFlags';

export function FeatureFlagsPanel() {
  const queryClient = useQueryClient();
  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['admin-feature-flags'],
    queryFn: () => apiClient.get('/api/admin/feature-flags'),
  });

  const save = useMutation({
    mutationFn: ({ key, enabled, value }: { key: string; enabled: boolean; value: string | null }) =>
      apiClient.put(`/api/admin/feature-flags/${key}`, { enabled, value }),
    onSuccess: () => {
      toast.success('Flag actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
    },
    onError: () => toast.error('No se pudo actualizar el flag'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Cargando flags…</p>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Feature flags</h2>
      <div className="flex flex-col gap-3">
        {flags.map((f) => (
          <FlagRow key={f.key} flag={f} onSave={(enabled, value) => save.mutate({ key: f.key, enabled, value })} />
        ))}
      </div>
    </section>
  );
}

function FlagRow({ flag, onSave }: { flag: FeatureFlag; onSave: (enabled: boolean, value: string | null) => void }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [value, setValue] = useState(flag.value ?? '');
  const isBool = flag.valueType === 'BOOLEAN';

  const handleSave = () => {
    if (!isBool) {
      const err = validateFlagValue(flag.valueType, value);
      if (err) {
        toast.error(err);
        return;
      }
    }
    onSave(enabled, isBool ? null : value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3 dark:border-dark-border">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800 dark:text-slate-100">{flag.key}</p>
        {flag.description && <p className="text-xs text-slate-500">{flag.description}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {enabled ? 'on' : 'off'}
      </label>
      {!isBool && (
        <input
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={flag.valueType}
        />
      )}
      <button
        onClick={handleSave}
        className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700"
      >
        Guardar
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Embeber el panel en AliadosDashboard**

En `apps/app/src/features/aliados/AliadosDashboard.tsx`:
- Agregar el import arriba: `import { FeatureFlagsPanel } from './FeatureFlagsPanel';`
- Renderizar `<FeatureFlagsPanel />` dentro del layout del dashboard (al final de la grilla de secciones, antes del cierre del contenedor principal).

- [ ] **Step 7: Typecheck + tests + build**

Run: `pnpm --filter aliados-app exec tsc -b && pnpm --filter aliados-app test && pnpm --filter aliados-app build`
Expected: tsc 0 · vitest PASS (incluye featureFlags) · build OK

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/features/aliados/featureFlags.ts \
        apps/app/src/features/aliados/__tests__/featureFlags.test.ts \
        apps/app/src/features/aliados/FeatureFlagsPanel.tsx \
        apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(app): panel de feature flags en el admin dashboard"
```

---

## Deploy notes (al integrar a main)

- Quitar la env var `MUDANZA_RATIO_TIEMPO` de las variables de Railway (ya no se lee).
- Documentarlo en el PR.
