# Identificador de servicios — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Número identificador visible por servicio (`#T-123` trabajos, `#M-45` mudanzas) en todas las páginas de detalle, más tab «Servicios» en el admin con búsqueda por número y filtros.

**Architecture:** Se usa el `id` autoincremental existente de `Trabajo` y `Mudanza` — sin migraciones. Frontend: helper puro de formato/parseo + badge reutilizable + panel admin nuevo siguiendo el patrón on-demand de `UsuariosPanel`. Backend: endpoint `GET /api/admin/servicios` que unifica ambas tablas con dos queries `JOIN FETCH` y merge en memoria (volumen pre-launch mínimo).

**Tech Stack:** React 19 + TypeScript + TanStack Query + Tailwind (apps/app), Spring Boot 3 + JPA/Hibernate + JUnit 5/Mockito (backend), vitest para frontend.

**Spec:** `docs/superpowers/specs/2026-07-10-identificador-servicios-design.md`

## Global Constraints

- Formato visible: `#T-<id>` para trabajos, `#M-<id>` para mudanzas. Parseo tolerante: mayúsculas/minúsculas, con/sin `#`, con/sin guión; número pelado → busca en ambos tipos.
- `q` no parseable → HTTP 200 con lista vacía, nunca 400.
- Autorización del endpoint: `/api/admin/**` ya está gateado por `.hasRole("ADMIN")` en `SecurityConfig` — no agregar anotaciones de seguridad al controller (mismo criterio que `UsuarioAdminController`).
- No pasar parámetros nullable a queries JPQL con `:param IS NULL OR ...` — este codebase ya se comió el bug de tipado de Postgres (ver comentario en `UsuarioAdminService#buscar`). Usar métodos de repo separados.
- Tests frontend: vitest puro (sin @testing-library — no está instalada; los componentes no se testean por render, solo la lógica pura extraída a helpers).
- Comandos: frontend `pnpm --filter app test` (o `npx vitest run <archivo>` dentro de `apps/app`), backend `./gradlew test` dentro de `backend/`.
- Commits firmados con GPG (si un commit cuelga, hay un pinentry gráfico esperando passphrase).

---

### Task 1: Helper `servicioId` (formato + parseo)

**Files:**
- Create: `apps/app/src/shared/lib/servicioId.ts`
- Test: `apps/app/src/shared/lib/__tests__/servicioId.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type TipoServicio = 'TRABAJO' | 'MUDANZA'`
  - `formatServicioId(tipo: TipoServicio, id: number): string` → `"#T-123"` / `"#M-45"`
  - `parseServicioId(input: string): { tipo: TipoServicio | null; id: number } | null`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/app/src/shared/lib/__tests__/servicioId.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatServicioId, parseServicioId } from '@/shared/lib/servicioId';

describe('formatServicioId', () => {
  it('formatea trabajo como #T-<id>', () => {
    expect(formatServicioId('TRABAJO', 123)).toBe('#T-123');
  });
  it('formatea mudanza como #M-<id>', () => {
    expect(formatServicioId('MUDANZA', 45)).toBe('#M-45');
  });
});

describe('parseServicioId', () => {
  it('parsea #T-123 con prefijo de trabajo', () => {
    expect(parseServicioId('#T-123')).toEqual({ tipo: 'TRABAJO', id: 123 });
  });
  it('parsea #M-45 con prefijo de mudanza', () => {
    expect(parseServicioId('#M-45')).toEqual({ tipo: 'MUDANZA', id: 45 });
  });
  it('tolera minúsculas', () => {
    expect(parseServicioId('t-123')).toEqual({ tipo: 'TRABAJO', id: 123 });
  });
  it('tolera sin #', () => {
    expect(parseServicioId('M-45')).toEqual({ tipo: 'MUDANZA', id: 45 });
  });
  it('tolera sin guión', () => {
    expect(parseServicioId('T123')).toEqual({ tipo: 'TRABAJO', id: 123 });
  });
  it('tolera espacios alrededor', () => {
    expect(parseServicioId('  #T-7  ')).toEqual({ tipo: 'TRABAJO', id: 7 });
  });
  it('número pelado devuelve tipo null (busca en ambos)', () => {
    expect(parseServicioId('123')).toEqual({ tipo: null, id: 123 });
  });
  it('número pelado con # devuelve tipo null', () => {
    expect(parseServicioId('#123')).toEqual({ tipo: null, id: 123 });
  });
  it('texto no parseable devuelve null', () => {
    expect(parseServicioId('abc')).toBeNull();
  });
  it('string vacío devuelve null', () => {
    expect(parseServicioId('')).toBeNull();
  });
  it('prefijo sin número devuelve null', () => {
    expect(parseServicioId('T-')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run (desde `apps/app/`): `npx vitest run src/shared/lib/__tests__/servicioId.test.ts`
Expected: FAIL — `Cannot find module '@/shared/lib/servicioId'` (o equivalente).

- [ ] **Step 3: Implementar el helper**

Crear `apps/app/src/shared/lib/servicioId.ts`:

```ts
export type TipoServicio = 'TRABAJO' | 'MUDANZA';

const PREFIJO: Record<TipoServicio, string> = { TRABAJO: 'T', MUDANZA: 'M' };

export function formatServicioId(tipo: TipoServicio, id: number): string {
  return `#${PREFIJO[tipo]}-${id}`;
}

// Tolerante: mayúsculas/minúsculas, con/sin #, con/sin guión.
// Número pelado → tipo null (el caller busca en ambos tipos).
export function parseServicioId(
  input: string,
): { tipo: TipoServicio | null; id: number } | null {
  const s = input.trim().toUpperCase().replace(/^#/, '');
  const conPrefijo = /^([TM])-?(\d+)$/.exec(s);
  if (conPrefijo) {
    return { tipo: conPrefijo[1] === 'T' ? 'TRABAJO' : 'MUDANZA', id: Number(conPrefijo[2]) };
  }
  if (/^\d+$/.test(s)) return { tipo: null, id: Number(s) };
  return null;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/shared/lib/__tests__/servicioId.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/shared/lib/servicioId.ts apps/app/src/shared/lib/__tests__/servicioId.test.ts
git commit -m "feat(servicios): helper formatServicioId/parseServicioId con tests"
```

---

### Task 2: Badge `ServicioIdBadge` en las 8 páginas de detalle

**Files:**
- Create: `apps/app/src/shared/components/ServicioIdBadge.tsx`
- Modify: `apps/app/src/features/client/pages/JobTracking.tsx` (h1 en ~línea 198)
- Modify: `apps/app/src/features/client/pages/JobCompleted.tsx`
- Modify: `apps/app/src/features/client/pages/ClientProposal.tsx`
- Modify: `apps/app/src/features/client/pages/MudanzaDetail.tsx` (h1 en ~línea 188)
- Modify: `apps/app/src/features/provider/pages/ServiceDetail.tsx` (h1 en ~línea 129)
- Modify: `apps/app/src/features/provider/pages/ActiveJob.tsx` (h1 en ~línea 101)
- Modify: `apps/app/src/features/provider/pages/ProviderCompletedJob.tsx` (h1 en ~línea 67)
- Modify: `apps/app/src/features/provider/pages/ProviderMudanzaDetail.tsx` (h1 en ~línea 200)

**Interfaces:**
- Consumes: `formatServicioId`, `TipoServicio` de `@/shared/lib/servicioId` (Task 1).
- Produces: `<ServicioIdBadge tipo={...} id={...} className?={...} />` — renderiza el número o nada si `id` es undefined.

Sin test de render (no hay @testing-library en el proyecto; la lógica de formato ya está testeada en Task 1 y el componente es presentacional puro).

- [ ] **Step 1: Crear el componente**

Crear `apps/app/src/shared/components/ServicioIdBadge.tsx`:

```tsx
import { formatServicioId, type TipoServicio } from '@/shared/lib/servicioId';

interface Props {
  tipo: TipoServicio;
  id: number | undefined | null;
  className?: string;
}

// Número identificador del servicio, discreto: no compite con el título.
export function ServicioIdBadge({ tipo, id, className = '' }: Props) {
  if (id == null) return null;
  return (
    <span className={`font-mono text-xs text-slate-400 dark:text-slate-500 ${className}`}>
      {formatServicioId(tipo, id)}
    </span>
  );
}
```

- [ ] **Step 2: Insertar el badge en las 4 páginas de trabajos del cliente/proveedor**

En cada archivo, ubicar el `<h1>` principal (`grep -n "<h1" <archivo>`) y agregar el badge como hermano, dentro de un wrapper flex si el `<h1>` no lo tiene. Patrón de inserción (ejemplo con `ServiceDetail.tsx:129`):

```tsx
// ANTES:
<h1 className={`text-2xl font-bold ${tw.text.primary}`}>Detalle del trabajo</h1>

// DESPUÉS:
<div className="flex items-baseline gap-2">
  <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Detalle del trabajo</h1>
  <ServicioIdBadge tipo="TRABAJO" id={trabajo.id} />
</div>
```

Aplicar el mismo patrón en:
- `ServiceDetail.tsx` (~129) — `trabajo.id`
- `ActiveJob.tsx` (~101) — `trabajo.id`
- `ProviderCompletedJob.tsx` (~67) — `trabajo.id`
- `JobTracking.tsx` (~198, el `<h1>` que muestra `{title}`) — `trabajo.id`
- `JobCompleted.tsx` y `ClientProposal.tsx`: ubicar el `<h1>` (o el título principal equivalente) con grep y aplicar el mismo patrón — `trabajo.id`.

En todos: `import { ServicioIdBadge } from '@/shared/components/ServicioIdBadge';`

Si el `<h1>` ya está dentro de un contenedor flex con otros elementos, agregar el badge directamente como hermano sin wrapper nuevo, cuidando no romper el layout existente (verificar `truncate`).

- [ ] **Step 3: Insertar el badge en las 2 páginas de mudanzas**

- `MudanzaDetail.tsx` (~188) — `tipo="MUDANZA"`, `id={mudanza.id}` (verificar el nombre de la variable local del componente con grep antes de insertar).
- `ProviderMudanzaDetail.tsx` (~200) — ídem.

- [ ] **Step 4: Verificar que compila y los tests siguen pasando**

Run (desde `apps/app/`): `npx tsc -b && npx vitest run`
Expected: compila sin errores; suite completa PASS.

- [ ] **Step 5: Verificación visual rápida**

Levantar la app (`pnpm --filter app dev`) y abrir el detalle de un trabajo: el badge `#T-<id>` debe verse junto al título, discreto, sin romper el layout mobile (probar viewport angosto).

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/shared/components/ServicioIdBadge.tsx apps/app/src/features
git commit -m "feat(servicios): badge #T-/#M- visible en las 8 páginas de detalle"
```

---

### Task 3: Backend — DTO, queries y `ServicioAdminService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/ServicioAdminItemDTO.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/ServiciosAdminResponse.java`
- Create: `backend/src/main/java/com/aliados/backend/service/ServicioAdminService.java`
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java` (agregar 2 queries)
- Modify: `backend/src/main/java/com/aliados/backend/repository/MudanzaRepository.java` (agregar 2 queries)
- Test: `backend/src/test/java/com/aliados/backend/service/ServicioAdminServiceTest.java`

**Interfaces:**
- Consumes: entidades `Trabajo` (campos: `id`, `cliente.nombre`, `proveedor` nullable, `oficio.nombre`, `estado`, `direccion`, `createdAt`, `acceptedAt`, `completedAt`, `precioEstimado`, `motivoCancelacion`) y `Mudanza` (campos: `id`, `cliente.nombre`, `proveedor` nullable, `estado`, `direccionOrigen`, `createdAt`, `acceptedAt`, `completedAt`, `montoBase`, `motivoCancelacion`).
- Produces:
  - `ServicioAdminItemDTO(String tipo, Long id, String oficio, String estado, String clienteNombre, String proveedorNombre, String direccion, LocalDateTime createdAt, LocalDateTime acceptedAt, LocalDateTime completedAt, BigDecimal precio, String motivoCancelacion)` con `from(Trabajo)` y `from(Mudanza)`.
  - `ServiciosAdminResponse(List<ServicioAdminItemDTO> items, long total)`
  - `ServicioAdminService.buscar(String q, String tipo, String estado, int page, int size): ServiciosAdminResponse`
  - Repos: `TrabajoRepository.findAllForAdmin()`, `findByIdForAdmin(Long)`, `MudanzaRepository.findAllForAdmin()`, `findByIdForAdmin(Long)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/test/java/com/aliados/backend/service/ServicioAdminServiceTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.ServiciosAdminResponse;
import com.aliados.backend.entity.*;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ServicioAdminServiceTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock MudanzaRepository mudanzaRepository;
    @InjectMocks ServicioAdminService service;

    private Trabajo trabajo(Long id, TrabajoEstado estado, LocalDateTime createdAt) {
        User cliente = new User();
        cliente.setNombre("Juan");
        Oficio oficio = new Oficio();
        oficio.setNombre("Plomería");
        Trabajo t = new Trabajo();
        t.setId(id);
        t.setCliente(cliente);
        t.setOficio(oficio);
        t.setEstado(estado);
        t.setDescripcion("desc");
        t.setDireccion("Calle 1");
        t.setCreatedAt(createdAt);
        return t;
    }

    private Mudanza mudanza(Long id, MudanzaEstado estado, LocalDateTime createdAt) {
        User cliente = new User();
        cliente.setNombre("Ana");
        Mudanza m = new Mudanza();
        m.setId(id);
        m.setCliente(cliente);
        m.setEstado(estado);
        m.setDireccionOrigen("Origen 1");
        m.setMontoBase(new BigDecimal("1000"));
        m.setCreatedAt(createdAt);
        return m;
    }

    @Test
    void buscarPorNumeroConPrefijoT_soloLookupDeTrabajo() {
        when(trabajoRepository.findByIdForAdmin(123L))
                .thenReturn(Optional.of(trabajo(123L, TrabajoEstado.EN_CURSO, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("#T-123", null, null, 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).tipo()).isEqualTo("TRABAJO");
        assertThat(r.items().get(0).id()).isEqualTo(123L);
        assertThat(r.items().get(0).oficio()).isEqualTo("Plomería");
        verifyNoInteractions(mudanzaRepository);
    }

    @Test
    void buscarPorNumeroConPrefijoM_soloLookupDeMudanza() {
        when(mudanzaRepository.findByIdForAdmin(45L))
                .thenReturn(Optional.of(mudanza(45L, MudanzaEstado.RESERVADO, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("m-45", null, null, 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).tipo()).isEqualTo("MUDANZA");
        assertThat(r.items().get(0).oficio()).isEqualTo("Mudanza");
        verifyNoInteractions(trabajoRepository);
    }

    @Test
    void buscarPorNumeroPelado_buscaEnAmbosTipos() {
        when(trabajoRepository.findByIdForAdmin(7L)).thenReturn(Optional.empty());
        when(mudanzaRepository.findByIdForAdmin(7L))
                .thenReturn(Optional.of(mudanza(7L, MudanzaEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("7", null, null, 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).tipo()).isEqualTo("MUDANZA");
    }

    @Test
    void qNoParseable_devuelveVacioSinConsultarRepos() {
        ServiciosAdminResponse r = service.buscar("abc", null, null, 0, 10);

        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        verifyNoInteractions(trabajoRepository, mudanzaRepository);
    }

    @Test
    void sinQ_listaAmbosTiposOrdenadosPorFechaDesc() {
        LocalDateTime ayer = LocalDateTime.now().minusDays(1);
        LocalDateTime hoy = LocalDateTime.now();
        when(trabajoRepository.findAllForAdmin())
                .thenReturn(List.of(trabajo(1L, TrabajoEstado.PENDIENTE, ayer)));
        when(mudanzaRepository.findAllForAdmin())
                .thenReturn(List.of(mudanza(2L, MudanzaEstado.PENDIENTE, hoy)));

        ServiciosAdminResponse r = service.buscar(null, null, null, 0, 10);

        assertThat(r.items()).hasSize(2);
        assertThat(r.items().get(0).tipo()).isEqualTo("MUDANZA"); // más reciente primero
        assertThat(r.total()).isEqualTo(2);
    }

    @Test
    void filtroTipoTrabajo_noConsultaMudanzas() {
        when(trabajoRepository.findAllForAdmin())
                .thenReturn(List.of(trabajo(1L, TrabajoEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar(null, "TRABAJO", null, 0, 10);

        assertThat(r.items()).hasSize(1);
        verifyNoInteractions(mudanzaRepository);
    }

    @Test
    void filtroEstado_soloAplicaDondeElValorExiste() {
        // RESERVADO existe en MudanzaEstado pero no en TrabajoEstado:
        // los trabajos quedan excluidos sin consultar su repo.
        when(mudanzaRepository.findAllForAdmin())
                .thenReturn(List.of(
                        mudanza(1L, MudanzaEstado.RESERVADO, LocalDateTime.now()),
                        mudanza(2L, MudanzaEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar(null, null, "RESERVADO", 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).estado()).isEqualTo("RESERVADO");
        verifyNoInteractions(trabajoRepository);
    }

    @Test
    void filtroEstadoComun_filtraEnAmbosTipos() {
        when(trabajoRepository.findAllForAdmin())
                .thenReturn(List.of(
                        trabajo(1L, TrabajoEstado.EN_CURSO, LocalDateTime.now()),
                        trabajo(2L, TrabajoEstado.PENDIENTE, LocalDateTime.now())));
        when(mudanzaRepository.findAllForAdmin())
                .thenReturn(List.of(mudanza(3L, MudanzaEstado.EN_CURSO, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar(null, null, "EN_CURSO", 0, 10);

        assertThat(r.items()).hasSize(2);
        assertThat(r.items()).allSatisfy(i -> assertThat(i.estado()).isEqualTo("EN_CURSO"));
    }

    @Test
    void paginado_devuelveSegundaPaginaYTotalCompleto() {
        List<Trabajo> trabajos = new java.util.ArrayList<>();
        for (long i = 1; i <= 15; i++) {
            trabajos.add(trabajo(i, TrabajoEstado.PENDIENTE, LocalDateTime.now().minusMinutes(i)));
        }
        when(trabajoRepository.findAllForAdmin()).thenReturn(trabajos);

        ServiciosAdminResponse r = service.buscar(null, "TRABAJO", null, 1, 10);

        assertThat(r.items()).hasSize(5);
        assertThat(r.total()).isEqualTo(15);
    }

    @Test
    void lookupPorIdConFiltroEstado_excluyeSiNoMatchea() {
        when(trabajoRepository.findByIdForAdmin(1L))
                .thenReturn(Optional.of(trabajo(1L, TrabajoEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("T-1", null, "COMPLETADO", 0, 10);

        assertThat(r.items()).isEmpty();
    }
}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `backend/`): `./gradlew test --tests ServicioAdminServiceTest`
Expected: FAIL de compilación — `ServicioAdminService`, DTOs y métodos de repo no existen.

- [ ] **Step 3: Crear DTOs**

Crear `backend/src/main/java/com/aliados/backend/dto/ServicioAdminItemDTO.java`:

```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.Trabajo;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ServicioAdminItemDTO(
        String tipo,
        Long id,
        String oficio,
        String estado,
        String clienteNombre,
        String proveedorNombre,
        String direccion,
        LocalDateTime createdAt,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        BigDecimal precio,
        String motivoCancelacion) {

    public static ServicioAdminItemDTO from(Trabajo t) {
        return new ServicioAdminItemDTO(
                "TRABAJO",
                t.getId(),
                t.getOficio().getNombre(),
                t.getEstado().name(),
                t.getCliente().getNombre(),
                t.getProveedor() != null ? t.getProveedor().getNombre() : null,
                t.getDireccion(),
                t.getCreatedAt(),
                t.getAcceptedAt(),
                t.getCompletedAt(),
                t.getPrecioEstimado(),
                t.getMotivoCancelacion());
    }

    public static ServicioAdminItemDTO from(Mudanza m) {
        return new ServicioAdminItemDTO(
                "MUDANZA",
                m.getId(),
                "Mudanza",
                m.getEstado().name(),
                m.getCliente().getNombre(),
                m.getProveedor() != null ? m.getProveedor().getNombre() : null,
                m.getDireccionOrigen(),
                m.getCreatedAt(),
                m.getAcceptedAt(),
                m.getCompletedAt(),
                m.getMontoBase(),
                m.getMotivoCancelacion());
    }
}
```

Crear `backend/src/main/java/com/aliados/backend/dto/ServiciosAdminResponse.java`:

```java
package com.aliados.backend.dto;

import java.util.List;

public record ServiciosAdminResponse(List<ServicioAdminItemDTO> items, long total) {}
```

- [ ] **Step 4: Agregar queries a los repositorios**

En `TrabajoRepository.java` agregar:

```java
// Listado admin: fetch de cliente/proveedor/oficio para evitar N+1 al mapear DTOs.
// Sin parámetro nullable de estado (el filtro se hace en memoria en el service):
// un ":estado IS NULL OR" acá repite el bug de tipado de Postgres documentado
// en UsuarioAdminService#buscar.
@Query("SELECT t FROM Trabajo t JOIN FETCH t.cliente LEFT JOIN FETCH t.proveedor " +
       "JOIN FETCH t.oficio ORDER BY t.createdAt DESC")
List<Trabajo> findAllForAdmin();

@Query("SELECT t FROM Trabajo t JOIN FETCH t.cliente LEFT JOIN FETCH t.proveedor " +
       "JOIN FETCH t.oficio WHERE t.id = :id")
Optional<Trabajo> findByIdForAdmin(@Param("id") Long id);
```

En `MudanzaRepository.java` agregar (mismo criterio):

```java
@Query("SELECT m FROM Mudanza m JOIN FETCH m.cliente LEFT JOIN FETCH m.proveedor " +
       "ORDER BY m.createdAt DESC")
List<Mudanza> findAllForAdmin();

@Query("SELECT m FROM Mudanza m JOIN FETCH m.cliente LEFT JOIN FETCH m.proveedor " +
       "WHERE m.id = :id")
Optional<Mudanza> findByIdForAdmin(@Param("id") Long id);
```

(Verificar imports: `Optional`, `@Param`, `@Query` ya suelen estar en ambos repos.)

- [ ] **Step 5: Implementar `ServicioAdminService`**

Crear `backend/src/main/java/com/aliados/backend/service/ServicioAdminService.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.ServicioAdminItemDTO;
import com.aliados.backend.dto.ServiciosAdminResponse;
import com.aliados.backend.entity.MudanzaEstado;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ServicioAdminService {

    private static final Pattern Q_CON_PREFIJO = Pattern.compile("^([TM])-?(\\d+)$");
    private static final Pattern Q_NUMERO = Pattern.compile("^\\d+$");

    private final TrabajoRepository trabajoRepository;
    private final MudanzaRepository mudanzaRepository;

    public ServicioAdminService(TrabajoRepository trabajoRepository,
                                MudanzaRepository mudanzaRepository) {
        this.trabajoRepository = trabajoRepository;
        this.mudanzaRepository = mudanzaRepository;
    }

    // q parseado: tipo "TRABAJO"/"MUDANZA"/null (null = ambos), id numérico.
    private record ParsedQ(String tipo, Long id) {}

    // null = sin filtro (q vacío). ParsedQ con id null = no parseable → resultado vacío.
    static ParsedQ parseQ(String q) {
        if (q == null || q.isBlank()) return null;
        String s = q.trim().toUpperCase().replaceFirst("^#", "");
        Matcher m = Q_CON_PREFIJO.matcher(s);
        if (m.matches()) {
            String tipo = m.group(1).equals("T") ? "TRABAJO" : "MUDANZA";
            return new ParsedQ(tipo, Long.parseLong(m.group(2)));
        }
        if (Q_NUMERO.matcher(s).matches()) return new ParsedQ(null, Long.parseLong(s));
        return new ParsedQ(null, null); // no parseable
    }

    @Transactional(readOnly = true)
    public ServiciosAdminResponse buscar(String q, String tipo, String estado, int page, int size) {
        ParsedQ parsed = parseQ(q);
        if (parsed != null && parsed.id() == null) {
            return new ServiciosAdminResponse(List.of(), 0); // q no parseable → vacío, no 400
        }

        String filtroEstado = (estado == null || estado.isBlank()) ? null : estado.trim().toUpperCase();
        boolean quiereTrabajos = incluyeTipo(tipo, parsed, "TRABAJO") && estadoExisteEnTrabajo(filtroEstado);
        boolean quiereMudanzas = incluyeTipo(tipo, parsed, "MUDANZA") && estadoExisteEnMudanza(filtroEstado);

        List<ServicioAdminItemDTO> items = new ArrayList<>();
        if (parsed != null) {
            // Lookup por id
            if (quiereTrabajos) {
                trabajoRepository.findByIdForAdmin(parsed.id())
                        .map(ServicioAdminItemDTO::from).ifPresent(items::add);
            }
            if (quiereMudanzas) {
                mudanzaRepository.findByIdForAdmin(parsed.id())
                        .map(ServicioAdminItemDTO::from).ifPresent(items::add);
            }
        } else {
            // Listado con filtros. Volumen pre-launch mínimo: se trae todo y se
            // filtra/pagina en memoria. Si crece, mover filtro+paginado a SQL.
            if (quiereTrabajos) {
                trabajoRepository.findAllForAdmin().stream()
                        .map(ServicioAdminItemDTO::from).forEach(items::add);
            }
            if (quiereMudanzas) {
                mudanzaRepository.findAllForAdmin().stream()
                        .map(ServicioAdminItemDTO::from).forEach(items::add);
            }
        }

        List<ServicioAdminItemDTO> filtrados = items.stream()
                .filter(i -> filtroEstado == null || i.estado().equals(filtroEstado))
                .sorted(Comparator.comparing(ServicioAdminItemDTO::createdAt,
                        Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder())).reversed())
                .toList();

        int from = Math.max(0, page) * Math.max(1, size);
        int to = Math.min(filtrados.size(), from + Math.max(1, size));
        List<ServicioAdminItemDTO> pagina = from >= filtrados.size() ? List.of() : filtrados.subList(from, to);
        return new ServiciosAdminResponse(pagina, filtrados.size());
    }

    private boolean incluyeTipo(String tipoParam, ParsedQ parsed, String tipo) {
        if (tipoParam != null && !tipoParam.isBlank() && !tipoParam.trim().equalsIgnoreCase(tipo)) return false;
        return parsed == null || parsed.tipo() == null || parsed.tipo().equals(tipo);
    }

    private boolean estadoExisteEnTrabajo(String estado) {
        if (estado == null) return true;
        try { TrabajoEstado.valueOf(estado); return true; }
        catch (IllegalArgumentException e) { return false; }
    }

    private boolean estadoExisteEnMudanza(String estado) {
        if (estado == null) return true;
        try { MudanzaEstado.valueOf(estado); return true; }
        catch (IllegalArgumentException e) { return false; }
    }
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `./gradlew test --tests ServicioAdminServiceTest`
Expected: PASS (10 tests).

- [ ] **Step 7: Correr la suite completa del backend**

Run: `./gradlew test`
Expected: PASS — sin regresiones.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/ServicioAdminItemDTO.java \
        backend/src/main/java/com/aliados/backend/dto/ServiciosAdminResponse.java \
        backend/src/main/java/com/aliados/backend/service/ServicioAdminService.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java \
        backend/src/main/java/com/aliados/backend/repository/MudanzaRepository.java \
        backend/src/test/java/com/aliados/backend/service/ServicioAdminServiceTest.java
git commit -m "feat(servicios): ServicioAdminService con búsqueda unificada trabajos+mudanzas"
```

---

### Task 4: Backend — `ServicioAdminController`

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/controller/ServicioAdminController.java`

**Interfaces:**
- Consumes: `ServicioAdminService.buscar(String q, String tipo, String estado, int page, int size)` (Task 3).
- Produces: `GET /api/admin/servicios?q=&tipo=&estado=&page=&size=` → JSON `{ items: [...], total: n }`.

Controller trivial (delegación pura, sin lógica): la lógica ya está testeada en `ServicioAdminServiceTest`; la autorización la da el gate `/api/admin/**` de `SecurityConfig` (no hay infra MockMvc en el proyecto — mismo criterio que los demás controllers admin, que tampoco tienen test propio).

- [ ] **Step 1: Crear el controller**

Crear `backend/src/main/java/com/aliados/backend/controller/ServicioAdminController.java`:

```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.ServiciosAdminResponse;
import com.aliados.backend.service.ServicioAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/servicios")
public class ServicioAdminController {

    private final ServicioAdminService servicioAdminService;

    public ServicioAdminController(ServicioAdminService servicioAdminService) {
        this.servicioAdminService = servicioAdminService;
    }

    @GetMapping
    public ResponseEntity<ServiciosAdminResponse> buscar(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false) String estado,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(servicioAdminService.buscar(q, tipo, estado, page, size));
    }
}
```

- [ ] **Step 2: Compilar y correr la suite**

Run: `./gradlew build -x test && ./gradlew test`
Expected: compila y PASS.

- [ ] **Step 3: Smoke test manual del endpoint (opcional si no hay backend local levantado)**

Si hay backend corriendo local: `curl -s "http://localhost:8080/api/admin/servicios?q=T-1" -H "Authorization: Bearer <token admin>"`.
Expected: 200 con `{"items":[...],"total":...}`. Si no hay entorno local, saltear — el smoke real se hace en la verificación final de la feature.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/controller/ServicioAdminController.java
git commit -m "feat(servicios): endpoint GET /api/admin/servicios"
```

---

### Task 5: Frontend — tab «Servicios» con `ServiciosPanel`

**Files:**
- Create: `apps/app/src/features/aliados/ServiciosPanel.tsx`
- Modify: `apps/app/src/features/aliados/AliadosDashboard.tsx` (línea ~172: tipo del tab; ~282: array de tabs; ~654: render; imports)

**Interfaces:**
- Consumes: `GET /api/admin/servicios` (Task 4), `parseServicioId`/`formatServicioId` (Task 1), `apiClient` de `@/shared/lib/apiClient`, `formatDateTime` de `@/shared/lib/dayjs`.
- Produces: componente `<ServiciosPanel />` autocontenido.

- [ ] **Step 1: Crear `ServiciosPanel`**

Crear `apps/app/src/features/aliados/ServiciosPanel.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { apiClient } from '@/shared/lib/apiClient';
import { formatDateTime } from '@/shared/lib/dayjs';
import { formatServicioId, type TipoServicio } from '@/shared/lib/servicioId';
import { ErrorState } from '@/shared/components/ui/ErrorState';

interface ServicioAdminItem {
  tipo: TipoServicio;
  id: number;
  oficio: string;
  estado: string;
  clienteNombre: string | null;
  proveedorNombre: string | null;
  direccion: string;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  precio: number | null;
  motivoCancelacion: string | null;
}

interface ServiciosResponse {
  items: ServicioAdminItem[];
  total: number;
}

type TipoFiltro = '' | 'TRABAJO' | 'MUDANZA';

const TIPOS: { key: TipoFiltro; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'TRABAJO', label: 'Trabajos' },
  { key: 'MUDANZA', label: 'Mudanzas' },
];

const ESTADOS_TRABAJO = ['PENDIENTE', 'PROPUESTO', 'EN_CURSO', 'EN_COLA', 'COMPLETADO', 'CANCELADO'];
const ESTADOS_MUDANZA = ['PENDIENTE', 'RESERVADO', 'CONTRAPROPUESTO', 'ACEPTADO', 'EN_CURSO', 'FINALIZADO', 'PENDIENTE_PAGO_EXTRA', 'COMPLETADO', 'CANCELADO'];
const ESTADOS_COMUNES = ['PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'CANCELADO'];

const ESTADO_CHIP: Record<string, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  PROPUESTO: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-dark-brand',
  RESERVADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  CONTRAPROPUESTO: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  ACEPTADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  EN_CURSO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  EN_COLA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  FINALIZADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  PENDIENTE_PAGO_EXTRA: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  COMPLETADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  CANCELADO: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
};

const PAGE_SIZE = 10;

function estadosDisponibles(tipo: TipoFiltro): string[] {
  if (tipo === 'TRABAJO') return ESTADOS_TRABAJO;
  if (tipo === 'MUDANZA') return ESTADOS_MUDANZA;
  return ESTADOS_COMUNES;
}

export function ServiciosPanel() {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<TipoFiltro>('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(0);
  const [applied, setApplied] = useState<{ q: string; tipo: TipoFiltro; estado: string } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data, isFetching, isError, refetch } = useQuery<ServiciosResponse>({
    queryKey: ['admin-servicios', applied, page],
    queryFn: () =>
      apiClient.get(
        `/api/admin/servicios?q=${encodeURIComponent(applied!.q)}&tipo=${applied!.tipo}` +
        `&estado=${applied!.estado}&page=${page}&size=${PAGE_SIZE}`,
      ),
    enabled: applied !== null,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Servicios</h2>

      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setExpandido(null);
          setApplied({ q, tipo, estado });
        }}
      >
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded border border-slate-300 py-1 pl-8 pr-2 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="#T-123, #M-45 o 123"
          />
        </div>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoFiltro);
            setEstado(''); // los estados válidos cambian con el tipo
          }}
        >
          {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-bg dark:text-slate-200"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Estado: todos</option>
          {estadosDisponibles(tipo).map((e) => <option key={e} value={e}>{e.replaceAll('_', ' ')}</option>)}
        </select>
        <button type="submit" className="rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700">
          Buscar
        </button>
      </form>

      {applied === null ? (
        <p className="text-sm text-slate-500">
          Buscá por número (#T-123, #M-45 o solo el número) o filtrá por tipo y estado. Dejá vacío y «Buscar» para ver todos.
        </p>
      ) : isError ? (
        <ErrorState compact message="No se pudo cargar la lista de servicios." onRetry={() => refetch()} />
      ) : isFetching ? (
        <p className="text-sm text-slate-500">Buscando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Sin resultados{applied.q.trim() ? ` para «${applied.q.trim()}»` : ''}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            {items.map((s) => {
              const key = `${s.tipo}-${s.id}`;
              const abierto = expandido === key;
              return (
                <div key={key} className="border-b border-slate-100 py-2 last:border-b-0 dark:border-dark-border">
                  <button
                    type="button"
                    onClick={() => setExpandido(abierto ? null : key)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
                      {formatServicioId(s.tipo, s.id)}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {s.oficio}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_CHIP[s.estado] ?? 'bg-slate-100 text-slate-600'}`}>
                      {s.estado.replaceAll('_', ' ')}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-500 sm:block">
                      {s.clienteNombre ?? '(sin nombre)'}{s.proveedorNombre ? ` → ${s.proveedorNombre}` : ''}
                    </span>
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                      {formatDateTime(s.createdAt)}
                    </span>
                    {abierto ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  </button>
                  {abierto && (
                    <dl className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-slate-50 p-3 text-xs dark:bg-dark-bg sm:grid-cols-2">
                      <div><dt className="inline font-medium text-slate-500">Cliente: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.clienteNombre ?? '—'}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Proveedor: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.proveedorNombre ?? '—'}</dd></div>
                      <div className="sm:col-span-2"><dt className="inline font-medium text-slate-500">Dirección: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.direccion}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Creado: </dt><dd className="inline text-slate-700 dark:text-slate-300">{formatDateTime(s.createdAt)}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Aceptado: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.acceptedAt ? formatDateTime(s.acceptedAt) : '—'}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Completado: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.completedAt ? formatDateTime(s.completedAt) : '—'}</dd></div>
                      <div><dt className="inline font-medium text-slate-500">Precio: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.precio != null ? `$${Number(s.precio).toLocaleString('es-AR')}` : '—'}</dd></div>
                      {s.motivoCancelacion && (
                        <div className="sm:col-span-2"><dt className="inline font-medium text-red-500">Motivo cancelación: </dt><dd className="inline text-slate-700 dark:text-slate-300">{s.motivoCancelacion}</dd></div>
                      )}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">{total} resultados · página {page + 1} de {totalPages}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-dark-border dark:text-slate-300"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-dark-border dark:text-slate-300"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Integrar el tab en `AliadosDashboard.tsx`**

Tres cambios puntuales:

1. Import (junto a los otros paneles, ~línea 18):
```tsx
import { ServiciosPanel } from './ServiciosPanel';
```

2. Tipo del estado del tab (línea ~172):
```tsx
// ANTES:
const [tab, setTab] = useState<'stats' | 'config'>('stats');
// DESPUÉS:
const [tab, setTab] = useState<'stats' | 'servicios' | 'config'>('stats');
```

3. Array de tabs (línea ~282):
```tsx
// ANTES:
{([['stats', 'Estadísticas'], ['config', 'Configuración']] as const).map(([key, label]) => (
// DESPUÉS:
{([['stats', 'Estadísticas'], ['servicios', 'Servicios'], ['config', 'Configuración']] as const).map(([key, label]) => (
```

4. Render del tab nuevo — insertar ANTES del bloque `{tab === 'config' && (` (~línea 654):
```tsx
{tab === 'servicios' && (
  <ServiciosPanel />
)}
```

- [ ] **Step 3: Verificar compilación y tests**

Run (desde `apps/app/`): `npx tsc -b && npx vitest run`
Expected: compila; suite PASS.

- [ ] **Step 4: Verificación visual**

Levantar la app, entrar al panel de admin: debe aparecer el tab «Servicios» entre «Estadísticas» y «Configuración». Buscar `#T-1`, un número pelado, y con filtros de tipo/estado; verificar expansión de fila, paginado y estado vacío con typo (ej. `abc` → «Sin resultados para "abc"»).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/aliados/ServiciosPanel.tsx apps/app/src/features/aliados/AliadosDashboard.tsx
git commit -m "feat(servicios): tab Servicios en admin con búsqueda por número y filtros"
```

---

## Verificación final de la feature

- [ ] `./gradlew test` (backend) y `npx vitest run` + `npx tsc -b` (apps/app) en verde.
- [ ] Flujo end-to-end manual: crear/mirar un trabajo como cliente → ver `#T-<id>` en el detalle → buscarlo por ese número en el tab Servicios del admin → verificar que la fila muestra los mismos datos.
- [ ] Ídem con una mudanza (`#M-<id>`).
