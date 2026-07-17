# Favoritos de proveedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El cliente puede favoritear proveedores (con los que completó trabajos), priorizarlos al pedir un servicio, y pedirles servicio directo; los favoritos se ofrecen primero y caen al dispatch normal si no aceptan.

**Architecture:** Backend Spring Boot: entidad `FavoritoProveedor` + CRUD REST; el dispatch de trabajos inyecta un "grupo 0" de favoritos antes del score, reusando la escalación existente. Frontend React/Vite: página `/cliente/favoritos`, toggle en `ServiceRequest`, y corazones en JobCompleted/historial. Spec: `docs/superpowers/specs/2026-07-17-favoritos-proveedores-design.md`.

**Tech Stack:** Java 21 / Spring Boot / JPA / Flyway / PostgreSQL (backend); React 19 / Vite / TanStack Query / Tailwind (frontend, en `apps/app`).

## Global Constraints

- Backend package base: `com.aliados.backend`. Auth: `Authentication.getName()` devuelve el `firebaseUid` del usuario.
- Migraciones Flyway en `backend/src/main/resources/db/migration/`, próximo número: **V10**.
- Entidades con Lombok `@Data`, FKs `@ManyToOne(fetch = FetchType.LAZY)`, timestamps con `@CreationTimestamp`.
- Frontend en `apps/app`. HTTP vía `apiClient` (`apiClient.get/post/delete`). Rutas en `apps/app/src/shared/constants/routes.ts`. Mutaciones con TanStack Query + `toast` (`react-hot-toast`) + `queryClient.invalidateQueries`.
- Comandos: backend `cd backend && ./gradlew test`; frontend `cd apps/app && pnpm test` y `pnpm exec tsc -b`.
- Alcance: solo trabajos por oficio. Mudanzas fuera.
- El toggle de priorización arranca **ON**. La escalación existente (5 min, fallback) NO se modifica.

---

## FASE 1 — Backend: entidad + CRUD de favoritos

### Task 1.1: Migración + entidad `FavoritoProveedor`

**Files:**
- Create: `backend/src/main/resources/db/migration/V10__favoritos_proveedores.sql`
- Create: `backend/src/main/java/com/aliados/backend/entity/FavoritoProveedor.java`

**Interfaces:**
- Produces: entidad JPA `FavoritoProveedor` con `getId()`, `getCliente()`, `getProveedor()`, `getCreatedAt()` y setters; tabla `favoritos_proveedores`.

- [ ] **Step 1: Escribir la migración**

`V10__favoritos_proveedores.sql`:
```sql
CREATE TABLE favoritos_proveedores (
    id           BIGSERIAL PRIMARY KEY,
    cliente_id   BIGINT NOT NULL REFERENCES users(id),
    proveedor_id BIGINT NOT NULL REFERENCES users(id),
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_favorito_cliente_proveedor UNIQUE (cliente_id, proveedor_id)
);

CREATE INDEX idx_favorito_cliente ON favoritos_proveedores (cliente_id);
```

- [ ] **Step 2: Escribir la entidad**

`FavoritoProveedor.java`:
```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "favoritos_proveedores",
       uniqueConstraints = @UniqueConstraint(name = "uq_favorito_cliente_proveedor",
               columnNames = {"cliente_id", "proveedor_id"}))
@Data
public class FavoritoProveedor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private User cliente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proveedor_id", nullable = false)
    private User proveedor;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
```

- [ ] **Step 3: Compilar**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V10__favoritos_proveedores.sql backend/src/main/java/com/aliados/backend/entity/FavoritoProveedor.java
git commit -m "feat(favoritos): entidad FavoritoProveedor + migración V10"
```

---

### Task 1.2: Repository

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/repository/FavoritoProveedorRepository.java`

**Interfaces:**
- Consumes: `FavoritoProveedor`.
- Produces: `FavoritoProveedorRepository` con:
  - `boolean existsByCliente_IdAndProveedor_Id(Long clienteId, Long proveedorId)`
  - `List<FavoritoProveedor> findByCliente_IdOrderByCreatedAtDesc(Long clienteId)`
  - `void deleteByCliente_IdAndProveedor_Id(Long clienteId, Long proveedorId)`
  - `List<FavoritoProveedor> findByCliente_IdAndProveedor_Oficio_Id(Long clienteId, Long oficioId)`
  - `boolean existeTrabajoCompletado(Long clienteId, Long proveedorId)`

- [ ] **Step 1: Escribir el repository**

```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.FavoritoProveedor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FavoritoProveedorRepository extends JpaRepository<FavoritoProveedor, Long> {

    boolean existsByCliente_IdAndProveedor_Id(Long clienteId, Long proveedorId);

    List<FavoritoProveedor> findByCliente_IdOrderByCreatedAtDesc(Long clienteId);

    void deleteByCliente_IdAndProveedor_Id(Long clienteId, Long proveedorId);

    List<FavoritoProveedor> findByCliente_IdAndProveedor_Oficio_Id(Long clienteId, Long oficioId);

    // Un trabajo COMPLETADO entre este cliente y proveedor habilita favoritearlo.
    @Query("SELECT COUNT(t) > 0 FROM Trabajo t " +
           "WHERE t.cliente.id = :clienteId AND t.proveedor.id = :proveedorId " +
           "AND t.estado = com.aliados.backend.entity.TrabajoEstado.COMPLETADO")
    boolean existeTrabajoCompletado(@Param("clienteId") Long clienteId, @Param("proveedorId") Long proveedorId);
}
```

> Nota para el implementador: verificá en `Trabajo.java` que la relación al proveedor sea `proveedor` y que el estado terminal sea `TrabajoEstado.COMPLETADO`. Si el nombre difiere, ajustá la query.

- [ ] **Step 2: Compilar**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/FavoritoProveedorRepository.java
git commit -m "feat(favoritos): repository con validación de trabajo-completado"
```

---

### Task 1.3: DTO + Service (agregar/quitar/listar)

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/FavoritoResponseDTO.java`
- Create: `backend/src/main/java/com/aliados/backend/service/FavoritoService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/FavoritoServiceTest.java`

**Interfaces:**
- Consumes: `FavoritoProveedorRepository`, `UserRepository`, `CalificacionRepository` (para promedio/cantidad).
- Produces: `FavoritoService`:
  - `void agregar(String clienteUid, Long proveedorId)` — valida trabajo-completado; idempotente.
  - `void quitar(String clienteUid, Long proveedorId)` — idempotente.
  - `List<FavoritoResponseDTO> listar(String clienteUid)`
  - `List<Long> idsFavoritosPorOficio(Long clienteId, Long oficioId)`
  - `boolean esFavorito(Long clienteId, Long proveedorId)`
- `FavoritoResponseDTO` (campos): `Long proveedorId`, `String nombre`, `Long oficioId`, `String oficioNombre`, `Double promedioCalificacion`, `Long cantidadCalificaciones`, `String disponibilidad`, `String codigoProveedor`.

- [ ] **Step 1: Escribir el DTO**

`FavoritoResponseDTO.java`:
```java
package com.aliados.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class FavoritoResponseDTO {
    private Long proveedorId;
    private String nombre;
    private Long oficioId;
    private String oficioNombre;
    private Double promedioCalificacion;
    private Long cantidadCalificaciones;
    private String disponibilidad; // ONLINE / BUSY / OFFLINE
    private String codigoProveedor;
}
```

- [ ] **Step 2: Escribir el test (falla primero)**

`FavoritoServiceTest.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FavoritoServiceTest {

    @Mock FavoritoProveedorRepository favoritoRepository;
    @Mock UserRepository userRepository;
    @Mock CalificacionRepository calificacionRepository;
    @InjectMocks FavoritoService favoritoService;

    User cliente, proveedor;

    @BeforeEach
    void setup() {
        cliente = new User(); cliente.setId(1L); cliente.setFirebaseUid("cli-uid");
        proveedor = new User(); proveedor.setId(2L);
        when(userRepository.findByFirebaseUid("cli-uid")).thenReturn(Optional.of(cliente));
    }

    @Test
    void agregar_falla_si_no_hay_trabajo_completado() {
        when(favoritoRepository.existeTrabajoCompletado(1L, 2L)).thenReturn(false);
        assertThrows(RuntimeException.class, () -> favoritoService.agregar("cli-uid", 2L));
        verify(favoritoRepository, never()).save(any());
    }

    @Test
    void agregar_es_idempotente() {
        when(favoritoRepository.existeTrabajoCompletado(1L, 2L)).thenReturn(true);
        when(favoritoRepository.existsByCliente_IdAndProveedor_Id(1L, 2L)).thenReturn(true);
        favoritoService.agregar("cli-uid", 2L);
        verify(favoritoRepository, never()).save(any());
    }

    @Test
    void agregar_guarda_cuando_hay_trabajo_completado() {
        when(favoritoRepository.existeTrabajoCompletado(1L, 2L)).thenReturn(true);
        when(favoritoRepository.existsByCliente_IdAndProveedor_Id(1L, 2L)).thenReturn(false);
        when(userRepository.findById(2L)).thenReturn(Optional.of(proveedor));
        favoritoService.agregar("cli-uid", 2L);
        verify(favoritoRepository).save(any(FavoritoProveedor.class));
    }
}
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests FavoritoServiceTest`
Expected: FAIL (FavoritoService no existe / no compila)

- [ ] **Step 4: Escribir el service**

`FavoritoService.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.dto.FavoritoResponseDTO;
import com.aliados.backend.entity.FavoritoProveedor;
import com.aliados.backend.entity.User;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.FavoritoProveedorRepository;
import com.aliados.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class FavoritoService {

    private final FavoritoProveedorRepository favoritoRepository;
    private final UserRepository userRepository;
    private final CalificacionRepository calificacionRepository;

    public FavoritoService(FavoritoProveedorRepository favoritoRepository,
                           UserRepository userRepository,
                           CalificacionRepository calificacionRepository) {
        this.favoritoRepository = favoritoRepository;
        this.userRepository = userRepository;
        this.calificacionRepository = calificacionRepository;
    }

    @Transactional
    public void agregar(String clienteUid, Long proveedorId) {
        User cliente = userRepository.findByFirebaseUid(clienteUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        if (!favoritoRepository.existeTrabajoCompletado(cliente.getId(), proveedorId)) {
            throw new RuntimeException("Solo podés favoritear a un proveedor con el que completaste un trabajo.");
        }
        if (favoritoRepository.existsByCliente_IdAndProveedor_Id(cliente.getId(), proveedorId)) {
            return; // idempotente
        }
        User proveedor = userRepository.findById(proveedorId)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));
        FavoritoProveedor f = new FavoritoProveedor();
        f.setCliente(cliente);
        f.setProveedor(proveedor);
        favoritoRepository.save(f);
    }

    @Transactional
    public void quitar(String clienteUid, Long proveedorId) {
        User cliente = userRepository.findByFirebaseUid(clienteUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        favoritoRepository.deleteByCliente_IdAndProveedor_Id(cliente.getId(), proveedorId);
    }

    @Transactional(readOnly = true)
    public List<FavoritoResponseDTO> listar(String clienteUid) {
        User cliente = userRepository.findByFirebaseUid(clienteUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        return favoritoRepository.findByCliente_IdOrderByCreatedAtDesc(cliente.getId()).stream()
                .map(f -> {
                    User p = f.getProveedor();
                    Double prom = calificacionRepository.promedioByProveedor(p.getId());
                    Long cant = calificacionRepository.cantidadByProveedor(p.getId());
                    return new FavoritoResponseDTO(
                            p.getId(),
                            p.getNombre(),
                            p.getOficio() != null ? p.getOficio().getId() : null,
                            p.getOficio() != null ? p.getOficio().getNombre() : null,
                            prom != null ? prom : 0.0,
                            cant != null ? cant : 0L,
                            p.getStatus() != null ? p.getStatus().name() : "OFFLINE",
                            p.getCodigoProveedor());
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Long> idsFavoritosPorOficio(Long clienteId, Long oficioId) {
        return favoritoRepository.findByCliente_IdAndProveedor_Oficio_Id(clienteId, oficioId).stream()
                .map(f -> f.getProveedor().getId())
                .toList();
    }

    @Transactional(readOnly = true)
    public boolean esFavorito(Long clienteId, Long proveedorId) {
        return favoritoRepository.existsByCliente_IdAndProveedor_Id(clienteId, proveedorId);
    }
}
```

> Nota: verificá los nombres exactos en `CalificacionRepository` para promedio/cantidad (en el controller existente se usan `getPromedioByProveedor`/`getCantidadByProveedor` vía service). Si los métodos del repo se llaman distinto (`promedioByProveedor`/`cantidadByProveedor`), usá los reales o agregá los que falten siguiendo el patrón existente. Igual para `User.getCodigoProveedor()` y `User.getStatus()`.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd backend && ./gradlew test --tests FavoritoServiceTest`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/FavoritoResponseDTO.java backend/src/main/java/com/aliados/backend/service/FavoritoService.java backend/src/test/java/com/aliados/backend/service/FavoritoServiceTest.java
git commit -m "feat(favoritos): FavoritoService (agregar/quitar/listar) con TDD"
```

---

### Task 1.4: Controller

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/controller/FavoritoController.java`

**Interfaces:**
- Consumes: `FavoritoService`.
- Produces: endpoints `POST /api/favoritos`, `DELETE /api/favoritos/{proveedorId}`, `GET /api/favoritos`.

- [ ] **Step 1: Escribir el controller**

```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.FavoritoResponseDTO;
import com.aliados.backend.service.FavoritoService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/favoritos")
public class FavoritoController {

    private final FavoritoService favoritoService;

    public FavoritoController(FavoritoService favoritoService) {
        this.favoritoService = favoritoService;
    }

    @PostMapping
    public ResponseEntity<Void> agregar(@RequestBody Map<String, Long> body, Authentication auth) {
        favoritoService.agregar(auth.getName(), body.get("proveedorId"));
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{proveedorId}")
    public ResponseEntity<Void> quitar(@PathVariable Long proveedorId, Authentication auth) {
        favoritoService.quitar(auth.getName(), proveedorId);
        return ResponseEntity.ok().build();
    }

    @GetMapping
    public ResponseEntity<List<FavoritoResponseDTO>> listar(Authentication auth) {
        return ResponseEntity.ok(favoritoService.listar(auth.getName()));
    }
}
```

- [ ] **Step 2: Verificar que la ruta esté permitida en SecurityConfig**

Run: `cd backend && grep -rn "api/calificaciones\|api/trabajos\|authenticated\|permitAll" src/main/java/com/aliados/backend/config/SecurityConfig.java | head`
Expected: `/api/favoritos` cae bajo la regla de rutas autenticadas (igual que `/api/calificaciones`). Si hay un allowlist explícito por ruta, agregá `/api/favoritos` con `authenticated()`.

- [ ] **Step 3: Compilar y correr toda la suite backend**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/controller/FavoritoController.java
git commit -m "feat(favoritos): FavoritoController (POST/DELETE/GET /api/favoritos)"
```

---

## FASE 2 — Backend: dispatch grupo 0 + notificación

### Task 2.1: Campos nuevos en `CrearTrabajoDTO`

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/dto/CrearTrabajoDTO.java`

**Interfaces:**
- Produces: `CrearTrabajoDTO.getPriorizarFavoritos()` (Boolean), `CrearTrabajoDTO.getProveedorDirectoId()` (Long).

- [ ] **Step 1: Agregar los campos**

Agregar antes del cierre de la clase, junto a `private String fotos;`:
```java
    // Favoritos: priorizar (grupo 0) — opción 1 (toggle) o pedido directo (opción 2).
    private Boolean priorizarFavoritos;
    private Long proveedorDirectoId;
```

- [ ] **Step 2: Compilar**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/CrearTrabajoDTO.java
git commit -m "feat(favoritos): campos priorizarFavoritos/proveedorDirectoId en CrearTrabajoDTO"
```

---

### Task 2.2: Notificación especial + grupo 0 en el dispatch

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoFavoritoDispatchTest.java`

**Interfaces:**
- Consumes: `FavoritoService.idsFavoritosPorOficio`, `CrearTrabajoDTO.getPriorizarFavoritos/getProveedorDirectoId`.
- Produces: método privado `ofrecerAFavoritos(Trabajo trabajo, List<Long> proveedorIds)` en `TrabajoService`; enum `TipoNotificacion.NUEVO_TRABAJO_FAVORITO`.

- [ ] **Step 1: Agregar el tipo de notificación**

En `TipoNotificacion.java`, agregar tras `NUEVO_TRABAJO,`:
```java
    NUEVO_TRABAJO_FAVORITO,
```

- [ ] **Step 2: Escribir el test (falla primero)**

`TrabajoFavoritoDispatchTest.java` — verifica que, con `proveedorDirectoId`, el primer grupo ofertado es ese proveedor y la notificación es `NUEVO_TRABAJO_FAVORITO`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

// Test de comportamiento del grupo 0. El implementador conecta los mocks siguiendo el
// patrón de los otros *Test de TrabajoService (ver TrabajoOfertaGrupoTest.java). La
// aserción central: al ofrecer a favoritos se crea TrabajoOferta grupo 1 SOLO para el
// favorito, y la notificación usa TipoNotificacion.NUEVO_TRABAJO_FAVORITO.
class TrabajoFavoritoDispatchTest {

    @Test
    void enum_tiene_tipo_favorito() {
        assertNotNull(TipoNotificacion.valueOf("NUEVO_TRABAJO_FAVORITO"));
    }
}
```

> Nota: este archivo arranca con un test mínimo del enum para fijar el contrato. El implementador debe AGREGAR aquí un test con mocks (estilo `TrabajoOfertaGrupoTest.java`) que: (a) cree un trabajo con `proveedorDirectoId` de un favorito válido del oficio; (b) verifique `trabajoOfertaRepository.save` con ese proveedor en grupo 1; (c) verifique `notificacionService.enviarNotificacion(..., NUEVO_TRABAJO_FAVORITO, ...)`. Leé `TrabajoOfertaGrupoTest.java` para el armado de mocks antes de escribirlo.

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd backend && ./gradlew test --tests TrabajoFavoritoDispatchTest`
Expected: FAIL (NUEVO_TRABAJO_FAVORITO no existe hasta el Step 1; tras Step 1, el test del enum pasa — dejá el test de dispatch agregado en Step 2 fallando hasta implementar el Step 4).

- [ ] **Step 4: Implementar el grupo 0 en `TrabajoService`**

En `TrabajoService`, inyectar `FavoritoService` (constructor o `@Autowired`, seguí el estilo del archivo) y reemplazar la línea `ofrecerSiguienteGrupo(trabajo);` dentro de `crearTrabajo(...)` por:
```java
        List<Long> favoritosPrioritarios = resolverGrupoCero(dto, cliente.getId(), oficio.getId());
        if (!favoritosPrioritarios.isEmpty()) {
            ofrecerAFavoritos(trabajo, favoritosPrioritarios);
        } else {
            ofrecerSiguienteGrupo(trabajo);
        }
```

Agregar los métodos privados:
```java
    /** Set de prioridad (grupo 0): directo tiene prioridad sobre toggle. Valida favorito+oficio. */
    private List<Long> resolverGrupoCero(CrearTrabajoDTO dto, Long clienteId, Long oficioId) {
        if (dto.getProveedorDirectoId() != null) {
            List<Long> favsOficio = favoritoService.idsFavoritosPorOficio(clienteId, oficioId);
            if (!favsOficio.contains(dto.getProveedorDirectoId())) {
                throw new RuntimeException("El proveedor no es un favorito válido para este oficio.");
            }
            return List.of(dto.getProveedorDirectoId());
        }
        if (Boolean.TRUE.equals(dto.getPriorizarFavoritos())) {
            return favoritoService.idsFavoritosPorOficio(clienteId, oficioId);
        }
        return List.of();
    }

    /** Ofrece el trabajo como grupo 1 SOLO a los favoritos dados, con notificación especial.
     *  El scheduler existente escala a grupos por score si no aceptan (mismo intervalo/fallback). */
    void ofrecerAFavoritos(Trabajo trabajo, List<Long> proveedorIds) {
        int grupo = 1;
        for (Long pid : proveedorIds) {
            User p = userRepository.findById(pid).orElse(null);
            if (p == null) continue;
            TrabajoOferta of = new TrabajoOferta();
            of.setTrabajo(trabajo);
            of.setProveedor(p);
            of.setGrupo(grupo);
            of.setResultado(ResultadoOferta.OFRECIDA);
            trabajoOfertaRepository.save(of);

            notificacionService.enviarNotificacion(
                    p.getFirebaseUid(),
                    TipoNotificacion.NUEVO_TRABAJO_FAVORITO,
                    "Un favorito te está pidiendo",
                    "Un cliente que te tiene de favorito te pidió un trabajo de "
                            + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                    trabajo.getId(),
                    "/proveedor/trabajo/" + trabajo.getId());
        }
    }
```

> Nota: `ofrecerSiguienteGrupo` calcula `grupo` como `max(grupo previo)+1`, así que tras el grupo 1 de favoritos, la escalación normal arranca en grupo 2 automáticamente y `yaOfertados` excluye a los favoritos ya ofertados. No hay que tocar el scheduler.

- [ ] **Step 5: Completar el test de dispatch (agregado en Step 2) y correrlo**

Run: `cd backend && ./gradlew test --tests TrabajoFavoritoDispatchTest`
Expected: PASS

- [ ] **Step 6: Correr toda la suite backend**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (sin regresiones en los *Test de trabajos)

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java backend/src/main/java/com/aliados/backend/service/TrabajoService.java backend/src/test/java/com/aliados/backend/service/TrabajoFavoritoDispatchTest.java
git commit -m "feat(favoritos): grupo 0 en el dispatch + notificación NUEVO_TRABAJO_FAVORITO (TDD)"
```

---

## FASE 3 — Frontend: página de favoritos + entry points

### Task 3.1: Ruta, hook `useFavoritos` y wiring del router

**Files:**
- Modify: `apps/app/src/shared/constants/routes.ts`
- Create: `apps/app/src/shared/hooks/useFavoritos.ts`
- Modify: `apps/app/src/router/AppRouter.tsx`

**Interfaces:**
- Produces:
  - `ROUTES.CLIENT.FAVORITOS` = `'/cliente/favoritos'`
  - `useFavoritos()` → `{ favoritos, isLoading, esFavorito(proveedorId), toggle(proveedorId, yaEs) }`
  - `useEsFavorito(proveedorId)` derivado de la lista.

- [ ] **Step 1: Agregar la ruta**

En `routes.ts`, dentro de `CLIENT: { ... }`, agregar:
```ts
    FAVORITOS: '/cliente/favoritos',
```

- [ ] **Step 2: Escribir el hook**

`useFavoritos.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/apiClient';
import toast from 'react-hot-toast';

export interface Favorito {
  proveedorId: number;
  nombre: string;
  oficioId: number | null;
  oficioNombre: string | null;
  promedioCalificacion: number;
  cantidadCalificaciones: number;
  disponibilidad: 'ONLINE' | 'BUSY' | 'OFFLINE';
  codigoProveedor: string | null;
}

export function useFavoritos() {
  const qc = useQueryClient();
  const { data: favoritos = [], isLoading } = useQuery<Favorito[]>({
    queryKey: ['favoritos'],
    queryFn: () => apiClient.get('/api/favoritos'),
  });

  const esFavorito = (proveedorId: number) =>
    favoritos.some((f) => f.proveedorId === proveedorId);

  const toggle = useMutation({
    mutationFn: async ({ proveedorId, yaEs }: { proveedorId: number; yaEs: boolean }) => {
      if (yaEs) return apiClient.delete(`/api/favoritos/${proveedorId}`);
      return apiClient.post('/api/favoritos', { proveedorId });
    },
    onSuccess: (_data, { yaEs }) => {
      qc.invalidateQueries({ queryKey: ['favoritos'] });
      toast.success(yaEs ? 'Quitado de favoritos' : 'Agregado a favoritos');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo actualizar favoritos'),
  });

  return { favoritos, isLoading, esFavorito, toggle };
}
```

> Nota: confirmá que `apiClient` exponga `.delete`. Si no, agregalo siguiendo el patrón de `.post`/`.get` en `apps/app/src/shared/lib/apiClient.ts`.

- [ ] **Step 3: Registrar la ruta en el router**

En `AppRouter.tsx`, importar la página (creada en Task 3.2) y agregar la `<Route>` junto a las otras rutas de cliente protegidas, ej.:
```tsx
<Route path={ROUTES.CLIENT.FAVORITOS} element={<Favoritos />} />
```
(seguí el patrón de protección/lazy que usan las demás rutas de cliente en ese archivo).

- [ ] **Step 4: Typecheck**

Run: `cd apps/app && pnpm exec tsc -b`
Expected: exit 0 (puede fallar hasta crear la página en Task 3.2 — en ese caso, hacé Task 3.2 antes del typecheck y commiteá juntas).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/shared/constants/routes.ts apps/app/src/shared/hooks/useFavoritos.ts apps/app/src/router/AppRouter.tsx
git commit -m "feat(favoritos): ruta /cliente/favoritos + hook useFavoritos"
```

---

### Task 3.2: Página de Favoritos

**Files:**
- Create: `apps/app/src/features/client/pages/Favoritos.tsx`

**Interfaces:**
- Consumes: `useFavoritos`, `ROUTES`.
- Produces: componente `Favoritos` (default/named export según convención del router).

- [ ] **Step 1: Escribir la página**

`Favoritos.tsx`:
```tsx
import { useNavigate } from 'react-router-dom';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Initials } from '@/shared/components/ui/Initials';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SkeletonCard } from '@/shared/components/ui/SkeletonCard';
import { tw } from '@/shared/styles/design-system';
import { ROUTES } from '@/shared/constants/routes';
import { useFavoritos } from '@/shared/hooks/useFavoritos';
import { Star, Heart, Users } from 'lucide-react';

export function Favoritos() {
  const navigate = useNavigate();
  const { favoritos, isLoading, toggle } = useFavoritos();

  const dispo = (d: string) =>
    d === 'ONLINE' ? { txt: 'Disponible', cls: 'text-green-600' }
    : d === 'BUSY' ? { txt: 'Ocupado', cls: 'text-amber-600' }
    : { txt: 'Desconectado', cls: tw.text.muted };

  return (
    <div className={tw.pageBg}>
      <div className={tw.containerWide}>
        <div className="mb-6 flex items-center justify-between">
          <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Tus favoritos</h1>
          <Button variant="outline" onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}>← Volver</Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        ) : favoritos.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Todavía no tenés favoritos"
            desc="Marcá con el corazón a un profesional después de completar un trabajo con él."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {favoritos.map((f) => {
              const d = dispo(f.disponibilidad);
              return (
                <Card key={f.proveedorId}>
                  <div className="flex items-center gap-3">
                    <Initials name={f.nombre} bg={tw.iconBg.brand} color="text-brand-600 dark:text-dark-brand" />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${tw.text.primary}`}>{f.nombre}</p>
                      <p className={`truncate text-xs ${tw.text.secondary}`}>{f.oficioNombre}</p>
                      <p className={`mt-0.5 flex items-center gap-1 text-xs ${tw.text.muted}`}>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {f.promedioCalificacion.toFixed(1)} · {f.cantidadCalificaciones} · <span className={d.cls}>{d.txt}</span>
                      </p>
                    </div>
                    <button
                      aria-label="Quitar de favoritos"
                      onClick={() => toggle.mutate({ proveedorId: f.proveedorId, yaEs: true })}
                      className="shrink-0 p-1"
                    >
                      <Heart className="h-5 w-5 fill-red-500 text-red-500" />
                    </button>
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() =>
                        navigate(
                          `${ROUTES.CLIENT.DASHBOARD.replace('/dashboard', '/solicitar')}?oficioId=${f.oficioId}&proveedorDirectoId=${f.proveedorId}`,
                        )
                      }
                    >
                      Pedir servicio
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

> Nota: la URL de "Pedir servicio" debe apuntar a la ruta real de `ServiceRequest`. Buscala en `routes.ts` (probablemente `ROUTES.CLIENT.SERVICE_REQUEST` o similar) y usá esa constante en vez del `.replace(...)` de ejemplo. Verificá también que `Initials` acepte props `name/bg/color` (como en `ProviderDashboard`).

- [ ] **Step 2: Typecheck + tests**

Run: `cd apps/app && pnpm exec tsc -b && pnpm test`
Expected: exit 0 / tests verdes

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/features/client/pages/Favoritos.tsx
git commit -m "feat(favoritos): página /cliente/favoritos con pedido directo"
```

---

### Task 3.3: Corazón + prompt en `JobCompleted`

**Files:**
- Modify: `apps/app/src/features/client/pages/JobCompleted.tsx`

**Interfaces:**
- Consumes: `useFavoritos`, `trabajo.proveedorId`.

- [ ] **Step 1: Agregar el corazón junto al proveedor y el prompt tras 4-5 estrellas**

Importar `useFavoritos` y `Heart` (lucide). Cerca del bloque del proveedor (donde se muestra `trabajo.proveedorNombre`, ~línea 161-169), agregar un botón corazón:
```tsx
const { esFavorito, toggle } = useFavoritos();
const yaEs = trabajo.proveedorId != null && esFavorito(trabajo.proveedorId);
// ...
{trabajo.proveedorId != null && (
  <button
    aria-label={yaEs ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    onClick={() => toggle.mutate({ proveedorId: trabajo.proveedorId, yaEs })}
    className="shrink-0 p-1"
  >
    <Heart className={`h-5 w-5 ${yaEs ? 'fill-red-500 text-red-500' : tw.text.muted}`} />
  </button>
)}
```

En el `onSuccess` de `calificarMutation`, tras calificar con `rating >= 4` y si `!yaEs`, mostrar un toast/acción sugerida antes de navegar:
```tsx
if (rating >= 4 && trabajo.proveedorId != null && !yaEs) {
  toast((t) => (
    <span className="flex items-center gap-2">
      ¿Agregar a {trabajo.proveedorNombre} a favoritos?
      <button
        className="font-semibold text-brand-600"
        onClick={() => { toggle.mutate({ proveedorId: trabajo.proveedorId!, yaEs: false }); toast.dismiss(t.id); }}
      >Sí</button>
    </span>
  ), { duration: 6000 });
}
```

> Nota: mantené la navegación a dashboard como está; el prompt es un toast no bloqueante. Si el proyecto ya tiene un patrón de toast con acción, seguí ese.

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm exec tsc -b`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/features/client/pages/JobCompleted.tsx
git commit -m "feat(favoritos): corazón + prompt tras 4-5 estrellas en JobCompleted"
```

---

### Task 3.4: Corazón en historial + link en el menú de usuario

**Files:**
- Modify: `apps/app/src/features/client/pages/ClientDashboard.tsx`
- Modify: `apps/app/src/features/components/header/UserMenu.tsx`

**Interfaces:**
- Consumes: `useFavoritos`, `ROUTES.CLIENT.FAVORITOS`, `trabajo.proveedorId` en las cards de historial.

- [ ] **Step 1: Corazón en las cards de historial del cliente**

En `ClientDashboard.tsx`, importar `useFavoritos` y `Heart`. En el `badgeContent` de las `TrabajoCard` del historial (~línea 584-600), agregar el corazón encima/junto al badge, usando `trabajo.proveedorId`:
```tsx
const { esFavorito, toggle } = useFavoritos();
// dentro del map de historial, en badgeContent:
{trabajo.proveedorId != null && (
  <button
    aria-label="Favorito"
    onClick={(e) => { e.stopPropagation(); toggle.mutate({ proveedorId: trabajo.proveedorId, yaEs: esFavorito(trabajo.proveedorId) }); }}
    className="p-0.5"
  >
    <Heart className={`h-4 w-4 ${esFavorito(trabajo.proveedorId) ? 'fill-red-500 text-red-500' : tw.text.muted}`} />
  </button>
)}
```

> Nota: `TrabajoCard` navega al hacer click en la card; por eso el `e.stopPropagation()` en el corazón. Verificá que el historial del cliente exponga `proveedorId` en cada `trabajo` (viene del backend en el DTO).

- [ ] **Step 2: Link "Favoritos" en el menú de usuario (solo cliente)**

En `UserMenu.tsx`, agregar una entrada que navegue a `ROUTES.CLIENT.FAVORITOS`, visible cuando el usuario es cliente (seguí la lógica de rol existente en ese componente). Ícono `Heart` de lucide.

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/app && pnpm exec tsc -b && pnpm test`
Expected: exit 0 / verdes

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/client/pages/ClientDashboard.tsx apps/app/src/features/components/header/UserMenu.tsx
git commit -m "feat(favoritos): corazón en historial + link en el menú de usuario"
```

---

## FASE 4 — Frontend: toggle en ServiceRequest + pedido directo

### Task 4.1: Toggle de priorización en `ServiceRequest`

**Files:**
- Modify: `apps/app/src/features/client/pages/ServiceRequest.tsx`

**Interfaces:**
- Consumes: `useFavoritos`, `selectedOficio` (state existente), `searchParams` (`oficioId`, `proveedorDirectoId`).
- Produces: el body de `crearTrabajoMutation` incluye `priorizarFavoritos` y/o `proveedorDirectoId`.

- [ ] **Step 1: Estado del toggle + cálculo de favoritos del oficio**

Importar `useFavoritos`. Calcular cuántos favoritos hay del oficio seleccionado:
```tsx
const { favoritos } = useFavoritos();
const proveedorDirectoId = searchParams.get('proveedorDirectoId');
const favsDelOficio = favoritos.filter((f) => f.oficioId === selectedOficio);
const [priorizar, setPriorizar] = useState(true); // default ON
```

- [ ] **Step 2: Render del toggle (solo si hay favoritos del oficio y no es pedido directo)**

Cerca del form, tras elegir oficio:
```tsx
{!proveedorDirectoId && favsDelOficio.length > 0 && (
  <label className="mt-3 flex items-center gap-2 text-sm">
    <input type="checkbox" checked={priorizar} onChange={(e) => setPriorizar(e.target.checked)} />
    <span className={tw.text.secondary}>
      Tenés {favsDelOficio.length} favorito{favsDelOficio.length > 1 ? 's' : ''} de este oficio. Priorizarlos en este pedido.
    </span>
  </label>
)}
```

- [ ] **Step 3: Incluir los campos en el POST**

En el body de `crearTrabajoMutation` (donde arma `{ oficioId, descripcion, direccion, ... }`), agregar:
```tsx
        priorizarFavoritos: proveedorDirectoId ? false : (favsDelOficio.length > 0 && priorizar),
        proveedorDirectoId: proveedorDirectoId ? Number(proveedorDirectoId) : undefined,
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/app && pnpm exec tsc -b`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/client/pages/ServiceRequest.tsx
git commit -m "feat(favoritos): toggle de priorización + pedido directo en ServiceRequest"
```

---

### Task 4.2: Verificación end-to-end del pedido directo

**Files:**
- (Sin cambios de código; verificación manual/exploratoria)

- [ ] **Step 1: Verificar el flujo directo**

Con la app corriendo (o revisando el código): desde `/cliente/favoritos`, "Pedir servicio" abre `ServiceRequest` con `?oficioId=...&proveedorDirectoId=...`; el oficio queda pre-seleccionado, el toggle NO aparece (es directo), y el POST manda `proveedorDirectoId`. El backend valida que sea favorito del oficio y lo ofrece como grupo 0.

- [ ] **Step 2: Correr suites completas**

Run: `cd apps/app && pnpm exec tsc -b && pnpm test` y `cd backend && ./gradlew test`
Expected: todo verde

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A && git commit -m "test(favoritos): verificación end-to-end del pedido directo"
```

---

## Notas de entrega (PRs)

Sugerencia: 4 PRs a `main`, uno por fase (cada fase deja software funcionando y testeable). Fase 1 y 2 son backend; 3 y 4 frontend. Respetar el flujo de "un PR a la vez, la rama se congela al crear el PR".
