# Presupuesto post-visita + pago del trabajo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insertar un gate de presupuesto post-visita en el flujo de trabajos: el proveedor cotiza el trabajo (estado `PRESUPUESTADO`), el cliente acepta (paga el total) o rechaza (paga solo la visita), y en ambos casos el trabajo se cierra y se puede calificar.

**Architecture:** El pago es una capa ortogonal (`estadoPago` PENDIENTE_PAGO→PAGADO) sobre el ciclo de vida del trabajo; se agrega un estado intermedio `PRESUPUESTADO` entre `EN_CURSO` y `COMPLETADO`. Dos endpoints nuevos (`/presupuestar` del proveedor, `/responder-presupuesto` del cliente) y un refactor que extrae el cierre de `completarTrabajo` para reutilizarlo. Sin integración con Mercado Pago (los pagos solo cambian `estadoPago`).

**Tech Stack:** Backend Spring Boot + JPA/Flyway + JUnit/Mockito/AssertJ (Gradle). Frontend React 19 + Vite + TS + React Router + React Query.

## Global Constraints

- **Alcance: solo trabajos** (mudanzas no se tocan).
- **Estados:** `EN_CURSO` → (proveedor presupuesta) → `PRESUPUESTADO` → (cliente responde) → `COMPLETADO`. En ambas ramas se cierra el trabajo y avanza la cola (misma lógica que `completarTrabajo`).
- **Monto:** el proveedor carga `montoPresupuesto` (arranca **vacío**, requerido, **> 0**). `montoPagado = montoPresupuesto` si acepta, `tarifaVisita` si rechaza.
- **Pago:** `estadoPago` `PENDIENTE_PAGO` (al presupuestar) → `PAGADO` (al responder). **Sin Mercado Pago**: aceptar/rechazar solo cierran el proceso y marcan `estadoPago`.
- **Calificación en ambas ramas** (aceptado o rechazado); no depende de `presupuestoAceptado`.
- **Seguridad:** solo el proveedor dueño presupuesta; solo el cliente dueño responde (403 `ForbiddenException` si no).
- **Rama:** `feat/presupuesto-trabajo` (el spec ya está commiteado ahí). Commits firmados; terminar cada mensaje con:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g`.
- **Tests frontend:** el repo no tiene infra de tests de render (vitest `environment: node`, sin testing-library); los componentes se verifican **visualmente** (Task 8). No se escriben tests de render.
- **Comandos:** backend `cd backend && ./gradlew test --tests "<FQN>"`; frontend `cd apps/app && pnpm exec tsc --noEmit` y `pnpm test`.

---

## File Structure

**Backend (crear):**
- `entity/EstadoPago.java` — enum `PENDIENTE_PAGO, PAGADO`.
- `dto/PresupuestarTrabajoDTO.java` — body de `/presupuestar`.
- `dto/ResponderPresupuestoDTO.java` — body de `/responder-presupuesto`.
- `backend/src/main/resources/db/migration/V10__presupuesto_trabajo.sql` — columnas nuevas.

**Backend (modificar):**
- `entity/TrabajoEstado.java` — +`PRESUPUESTADO`.
- `entity/Trabajo.java` — 6 campos nuevos.
- `entity/TipoNotificacion.java` — +`PRESUPUESTO_RECIBIDO`, `PRESUPUESTO_ACEPTADO`, `PRESUPUESTO_RECHAZADO`.
- `dto/TrabajoResponseDTO.java` — 6 campos nuevos.
- `service/TrabajoService.java` — mapping, refactor `cerrarTrabajoCompletado`, `presupuestarTrabajo`, `responderPresupuesto`.
- `controller/TrabajoController.java` — 2 endpoints nuevos.

**Frontend (crear):**
- `apps/app/src/features/provider/pages/PresupuestoTrabajo.tsx` — form de presupuesto.

**Frontend (modificar):**
- `apps/app/src/shared/constants/routes.ts` — ruta `PROVIDER.PRESUPUESTO`.
- `apps/app/src/router/AppRouter.tsx` — lazy import + ruta.
- `apps/app/src/features/provider/pages/ActiveJob.tsx` — botón navega a presupuesto.
- `apps/app/src/features/client/pages/JobTracking.tsx` — pantalla de presupuesto (estado `PRESUPUESTADO`).
- `apps/app/src/features/client/pages/JobCompleted.tsx` — mensaje contextual según rama; calificación siempre.

---

## Task 1: Estado, enum de pago, campos de entidad y migración

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/entity/TrabajoEstado.java`
- Create: `backend/src/main/java/com/aliados/backend/entity/EstadoPago.java`
- Modify: `backend/src/main/java/com/aliados/backend/entity/Trabajo.java`
- Create: `backend/src/main/resources/db/migration/V10__presupuesto_trabajo.sql`

**Interfaces:**
- Produces: `TrabajoEstado.PRESUPUESTADO`; enum `EstadoPago { PENDIENTE_PAGO, PAGADO }`; campos en `Trabajo`: `montoPresupuesto: BigDecimal`, `notaResumen: String`, `presupuestoAceptado: Boolean`, `montoPagado: BigDecimal`, `estadoPago: EstadoPago`, `pagadoAt: LocalDateTime` (todos con getters/setters Lombok `@Data`).

- [ ] **Step 1: Agregar el estado `PRESUPUESTADO`**

En `entity/TrabajoEstado.java`, agregar el valor entre `EN_CURSO` y `EN_COLA`:

```java
public enum TrabajoEstado {
    PENDIENTE,
    PROPUESTO,
    EN_CURSO,
    PRESUPUESTADO,
    EN_COLA,
    COMPLETADO,
    CANCELADO
}
```

- [ ] **Step 2: Crear el enum `EstadoPago`**

Create `entity/EstadoPago.java`:

```java
package com.aliados.backend.entity;

public enum EstadoPago {
    PENDIENTE_PAGO,
    PAGADO
}
```

- [ ] **Step 3: Agregar los campos a `Trabajo`**

En `entity/Trabajo.java`, después de `private BigDecimal tarifaVisita;` (línea ~84), agregar:

```java
    @Column(precision = 12, scale = 2)
    private BigDecimal montoPresupuesto;

    @Column(length = 1000)
    private String notaResumen;

    private Boolean presupuestoAceptado;

    @Column(precision = 12, scale = 2)
    private BigDecimal montoPagado;

    @Enumerated(EnumType.STRING)
    private EstadoPago estadoPago;

    private LocalDateTime pagadoAt;
```

(`java.math.BigDecimal` y `java.time.LocalDateTime` ya están importados en el archivo.)

- [ ] **Step 4: Crear la migración Flyway**

Create `backend/src/main/resources/db/migration/V10__presupuesto_trabajo.sql`:

```sql
-- Presupuesto post-visita + pago del trabajo.
-- Nuevo estado PRESUPUESTADO (entre EN_CURSO y COMPLETADO) y capa de pago ortogonal.
ALTER TABLE trabajos
    ADD COLUMN monto_presupuesto     NUMERIC(12, 2),
    ADD COLUMN nota_resumen          VARCHAR(1000),
    ADD COLUMN presupuesto_aceptado  BOOLEAN,
    ADD COLUMN monto_pagado          NUMERIC(12, 2),
    ADD COLUMN estado_pago           VARCHAR(255),
    ADD COLUMN pagado_at             TIMESTAMP(6);
```

- [ ] **Step 5: Compilar y validar alineación entidad/esquema**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

Run (si el entorno tiene Docker/Testcontainers): `cd backend && ./gradlew test --tests "com.aliados.backend.SchemaMigrationIT"`
Expected: PASS (valida que la migración y las entidades JPA quedan alineadas). Si el entorno no puede correr la IT, dejarlo asentado en el reporte y confiar en `compileJava` + la validación de Hibernate al arrancar.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/TrabajoEstado.java \
        backend/src/main/java/com/aliados/backend/entity/EstadoPago.java \
        backend/src/main/java/com/aliados/backend/entity/Trabajo.java \
        backend/src/main/resources/db/migration/V10__presupuesto_trabajo.sql
git commit -m "$(cat <<'EOF'
feat(presupuesto): estado PRESUPUESTADO + campos de pago en Trabajo + migración V10

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 2: DTOs de request y exposición en la respuesta

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/PresupuestarTrabajoDTO.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/ResponderPresupuestoDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/dto/TrabajoResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (`mapToDTO` ~línea 361, `mapToDTOOptimized` ~línea 500)

**Interfaces:**
- Consumes: `EstadoPago` (Task 1).
- Produces: `PresupuestarTrabajoDTO { getMontoPresupuesto(): BigDecimal, getNotaResumen(): String }`; `ResponderPresupuestoDTO { getAceptar(): Boolean }`; campos JSON `montoPresupuesto`, `notaResumen`, `presupuestoAceptado`, `montoPagado`, `estadoPago`, `pagadoAt` en `TrabajoResponseDTO`.

- [ ] **Step 1: Crear `PresupuestarTrabajoDTO`**

Create `dto/PresupuestarTrabajoDTO.java`:

```java
package com.aliados.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/** Body de PATCH /api/trabajos/{id}/presupuestar (proveedor). */
@Data
public class PresupuestarTrabajoDTO {

    @NotNull(message = "El monto del presupuesto es requerido")
    @Positive(message = "El monto del presupuesto debe ser positivo")
    private BigDecimal montoPresupuesto;

    // Nota opcional del proveedor sobre el trabajo a realizar.
    @Size(max = 1000, message = "La nota no puede superar 1000 caracteres")
    private String notaResumen;
}
```

- [ ] **Step 2: Crear `ResponderPresupuestoDTO`**

Create `dto/ResponderPresupuestoDTO.java`:

```java
package com.aliados.backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** Body de PATCH /api/trabajos/{id}/responder-presupuesto (cliente). */
@Data
public class ResponderPresupuestoDTO {

    @NotNull(message = "Debe indicar si acepta el presupuesto")
    private Boolean aceptar;
}
```

- [ ] **Step 3: Agregar los campos a `TrabajoResponseDTO`**

En `dto/TrabajoResponseDTO.java`, después de `private BigDecimal tarifaVisita;` (última propiedad), agregar:

```java
    private BigDecimal montoPresupuesto;
    private String notaResumen;
    private Boolean presupuestoAceptado;
    private BigDecimal montoPagado;
    private EstadoPago estadoPago;
    private LocalDateTime pagadoAt;
```

Agregar los imports si faltan: `import com.aliados.backend.entity.EstadoPago;` (y verificar que `java.math.BigDecimal` y `java.time.LocalDateTime` ya estén).

- [ ] **Step 4: Setear los campos en ambos mappers**

En `TrabajoService.mapToDTO` (~línea 361), antes de `return dto;`, agregar:

```java
        dto.setMontoPresupuesto(trabajo.getMontoPresupuesto());
        dto.setNotaResumen(trabajo.getNotaResumen());
        dto.setPresupuestoAceptado(trabajo.getPresupuestoAceptado());
        dto.setMontoPagado(trabajo.getMontoPagado());
        dto.setEstadoPago(trabajo.getEstadoPago());
        dto.setPagadoAt(trabajo.getPagadoAt());
```

En `TrabajoService.mapToDTOOptimized` (~línea 500), antes de su `return dto;`, agregar el mismo bloque de 6 líneas.

- [ ] **Step 5: Compilar y correr tests de trabajo**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.Trabajo*"`
Expected: PASS (compila; los tests existentes siguen verdes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/PresupuestarTrabajoDTO.java \
        backend/src/main/java/com/aliados/backend/dto/ResponderPresupuestoDTO.java \
        backend/src/main/java/com/aliados/backend/dto/TrabajoResponseDTO.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java
git commit -m "$(cat <<'EOF'
feat(presupuesto): DTOs de presupuesto/respuesta + campos en TrabajoResponseDTO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 3: Refactor — extraer `cerrarTrabajoCompletado`

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (`completarTrabajo` ~líneas 193-262)

**Interfaces:**
- Produces: `private void cerrarTrabajoCompletado(Trabajo trabajo, User proveedor)` — marca `COMPLETADO` + `completedAt`, promueve la cola (o pone al proveedor `ONLINE` y reasigna), con sus notificaciones de cola. No emite las notificaciones "completado" del trabajo actual (quedan en el caller).

Este es un refactor sin cambio de comportamiento: el objetivo es que `responderPresupuesto` (Task 5) reutilice el cierre.

- [ ] **Step 1: Extraer el método privado**

En `TrabajoService`, agregar el método privado (tomado del cuerpo actual de `completarTrabajo`, líneas ~208-241):

```java
    /** Cierre compartido de un trabajo: pasa a COMPLETADO, promueve la cola o libera al
     *  proveedor. NO emite las notificaciones "completado" del trabajo actual (las pone
     *  el caller, porque el texto difiere entre completar y responder-presupuesto). */
    private void cerrarTrabajoCompletado(Trabajo trabajo, User proveedor) {
        trabajo.setEstado(TrabajoEstado.COMPLETADO);
        trabajo.setCompletedAt(LocalDateTime.now());
        trabajoRepository.save(trabajo);

        List<Trabajo> trabajosEnCola = trabajoRepository.findTrabajosEnCola(proveedor.getId());

        if (!trabajosEnCola.isEmpty()) {
            Trabajo siguiente = trabajosEnCola.get(0);
            siguiente.setEstado(TrabajoEstado.EN_CURSO);
            trabajoRepository.save(siguiente);

            notificacionService.enviarNotificacion(
                    proveedor.getFirebaseUid(),
                    TipoNotificacion.TRABAJO_COLA_ACTIVADO,
                    "Nuevo Trabajo Activo",
                    "El servicio de " + siguiente.getOficio().getNombre() + " para " + siguiente.getCliente().getNombre() + " pasó a estar en curso.",
                    siguiente.getId(),
                    "/proveedor/trabajo-activo/" + siguiente.getId()
            );

            notificacionService.enviarNotificacion(
                    siguiente.getCliente().getFirebaseUid(),
                    TipoNotificacion.TRABAJO_EN_CURSO,
                    "Profesional en Camino",
                    "Tu profesional de " + siguiente.getOficio().getNombre() + " está listo para atenderte.",
                    siguiente.getId(),
                    "/cliente/seguimiento/" + siguiente.getId()
            );
        } else {
            userService.updateUserStatus(proveedor.getFirebaseUid(), UserStatus.ONLINE);
            asignarTrabajosAProveedorQueSeConecta(proveedor);
        }
    }
```

- [ ] **Step 2: Reescribir `completarTrabajo` para usarlo**

Reemplazar el cuerpo de `completarTrabajo` (desde `trabajo.setEstado(TrabajoEstado.COMPLETADO);` hasta el fin del bloque de promoción de cola) por una llamada a `cerrarTrabajoCompletado`, conservando las notificaciones finales. El método queda:

```java
    @Transactional
    public TrabajoResponseDTO completarTrabajo(Long trabajoId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.EN_CURSO)) {
            throw new RuntimeException("El trabajo no está en curso");
        }

        if (!trabajo.getProveedor().getId().equals(proveedor.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        cerrarTrabajoCompletado(trabajo, proveedor);

        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                TipoNotificacion.TRABAJO_COMPLETADO,
                "Trabajo Completado",
                "El servicio de " + trabajo.getOficio().getNombre() + " fue completado. ¡Calificá a tu profesional!",
                trabajo.getId(),
                "/cliente/completado/" + trabajo.getId()
        );

        notificacionService.enviarNotificacion(
                proveedor.getFirebaseUid(),
                TipoNotificacion.TRABAJO_COMPLETADO_PROVEEDOR,
                "Trabajo Completado",
                "Completaste el servicio de " + trabajo.getOficio().getNombre() + " exitosamente",
                trabajo.getId(),
                "/proveedor/completado/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }
```

Verificar que el `@Transactional` original del método se conserva (estaba sobre `completarTrabajo`).

- [ ] **Step 3: Correr los tests de trabajo (regresión)**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.Trabajo*"`
Expected: PASS — el refactor no cambia comportamiento; los tests existentes que ejercen `completarTrabajo`/cola siguen verdes.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java
git commit -m "$(cat <<'EOF'
refactor(trabajos): extrae cerrarTrabajoCompletado para reusar el cierre

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 4: Endpoint `/presupuestar` (proveedor)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java`
- Modify: `backend/src/main/java/com/aliados/backend/controller/TrabajoController.java`
- Test: `backend/src/test/java/com/aliados/backend/service/PresupuestoTrabajoTest.java`

**Interfaces:**
- Consumes: `PresupuestarTrabajoDTO` (Task 2), estado `PRESUPUESTADO` y campos (Task 1).
- Produces: `public TrabajoResponseDTO presupuestarTrabajo(Long trabajoId, String proveedorFirebaseUid, BigDecimal montoPresupuesto, String notaResumen)`; endpoint `PATCH /api/trabajos/{id}/presupuestar`.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/test/java/com/aliados/backend/service/PresupuestoTrabajoTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PresupuestoTrabajoTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock FeatureFlagService featureFlagService;
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private Trabajo enCurso(User cliente, User proveedor) {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        Trabajo t = new Trabajo();
        t.setId(10L); t.setCliente(cliente); t.setProveedor(proveedor);
        t.setOficio(of); t.setEstado(TrabajoEstado.EN_CURSO);
        t.setTarifaVisita(new BigDecimal("15000"));
        return t;
    }

    @Test
    void presupuestar_pasaAPresupuestadoYSeteaCampos() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = enCurso(cliente, prov);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        TrabajoResponseDTO dto = trabajoService.presupuestarTrabajo(10L, "prov", new BigDecimal("100000"), "Cambio de tablero");

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PRESUPUESTADO);
        assertThat(t.getMontoPresupuesto()).isEqualByComparingTo("100000");
        assertThat(t.getNotaResumen()).isEqualTo("Cambio de tablero");
        assertThat(t.getEstadoPago()).isEqualTo(EstadoPago.PENDIENTE_PAGO);
        assertThat(dto.getEstadoPago()).isEqualTo(EstadoPago.PENDIENTE_PAGO);
    }

    @Test
    void presupuestar_noDuenoLanza403() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User otro = user(3L, "otro", UserRole.PROVIDER);
        Trabajo t = enCurso(cliente, prov);
        when(userRepository.findByFirebaseUid("otro")).thenReturn(Optional.of(otro));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.presupuestarTrabajo(10L, "otro", new BigDecimal("100000"), null))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void presupuestar_estadoInvalidoLanza() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = enCurso(cliente, prov);
        t.setEstado(TrabajoEstado.COMPLETADO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.presupuestarTrabajo(10L, "prov", new BigDecimal("100000"), null))
                .isInstanceOf(RuntimeException.class);
    }
}
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.PresupuestoTrabajoTest"`
Expected: FAIL — `presupuestarTrabajo` no existe (no compila).

- [ ] **Step 3: Agregar los `TipoNotificacion` y el método de servicio**

En `entity/TipoNotificacion.java`, agregar (junto a las de trabajo):

```java
    PRESUPUESTO_RECIBIDO,
    PRESUPUESTO_ACEPTADO,
    PRESUPUESTO_RECHAZADO,
```

En `TrabajoService`, agregar el método:

```java
    @Transactional
    public TrabajoResponseDTO presupuestarTrabajo(Long trabajoId, String proveedorFirebaseUid,
                                                  BigDecimal montoPresupuesto, String notaResumen) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.EN_CURSO)) {
            throw new RuntimeException("El trabajo no está en curso");
        }
        if (!trabajo.getProveedor().getId().equals(proveedor.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        trabajo.setMontoPresupuesto(montoPresupuesto);
        trabajo.setNotaResumen(notaResumen);
        trabajo.setEstado(TrabajoEstado.PRESUPUESTADO);
        trabajo.setEstadoPago(EstadoPago.PENDIENTE_PAGO);
        trabajo = trabajoRepository.save(trabajo);

        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                TipoNotificacion.PRESUPUESTO_RECIBIDO,
                "Presupuesto recibido",
                "Tu profesional de " + trabajo.getOficio().getNombre() + " te envió un presupuesto. Revisalo para continuar.",
                trabajo.getId(),
                "/cliente/seguimiento/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }
```

Agregar el import `import com.aliados.backend.entity.EstadoPago;` si falta.

- [ ] **Step 4: Agregar el endpoint**

En `controller/TrabajoController.java`, importar `PresupuestarTrabajoDTO` y agregar (después del endpoint `completar`):

```java
    @PatchMapping("/{id}/presupuestar")
    public ResponseEntity<TrabajoResponseDTO> presupuestarTrabajo(
            @PathVariable Long id,
            @Valid @RequestBody PresupuestarTrabajoDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.presupuestarTrabajo(
                id, uid, dto.getMontoPresupuesto(), dto.getNotaResumen());
        return ResponseEntity.ok(trabajo);
    }
```

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.PresupuestoTrabajoTest"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/main/java/com/aliados/backend/controller/TrabajoController.java \
        backend/src/test/java/com/aliados/backend/service/PresupuestoTrabajoTest.java
git commit -m "$(cat <<'EOF'
feat(presupuesto): endpoint /presupuestar (EN_CURSO → PRESUPUESTADO)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 5: Endpoint `/responder-presupuesto` (cliente)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java`
- Modify: `backend/src/main/java/com/aliados/backend/controller/TrabajoController.java`
- Test: `backend/src/test/java/com/aliados/backend/service/ResponderPresupuestoTest.java`

**Interfaces:**
- Consumes: `ResponderPresupuestoDTO` (Task 2), `cerrarTrabajoCompletado` (Task 3), `PRESUPUESTO_ACEPTADO/RECHAZADO` (Task 4).
- Produces: `public TrabajoResponseDTO responderPresupuesto(Long trabajoId, String clienteFirebaseUid, boolean aceptar)`; endpoint `PATCH /api/trabajos/{id}/responder-presupuesto`.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/test/java/com/aliados/backend/service/ResponderPresupuestoTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResponderPresupuestoTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock FeatureFlagService featureFlagService;
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private Trabajo presupuestado(User cliente, User prov) {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        Trabajo t = new Trabajo();
        t.setId(10L); t.setCliente(cliente); t.setProveedor(prov); t.setOficio(of);
        t.setEstado(TrabajoEstado.PRESUPUESTADO);
        t.setTarifaVisita(new BigDecimal("15000"));
        t.setMontoPresupuesto(new BigDecimal("100000"));
        t.setEstadoPago(EstadoPago.PENDIENTE_PAGO);
        return t;
    }

    @Test
    void aceptar_completaYPagaElPresupuesto() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = presupuestado(cliente, prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        TrabajoResponseDTO dto = trabajoService.responderPresupuesto(10L, "cli", true);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.COMPLETADO);
        assertThat(t.getPresupuestoAceptado()).isTrue();
        assertThat(t.getMontoPagado()).isEqualByComparingTo("100000");
        assertThat(t.getEstadoPago()).isEqualTo(EstadoPago.PAGADO);
        assertThat(dto.getMontoPagado()).isEqualByComparingTo("100000");
    }

    @Test
    void rechazar_completaYPagaSoloLaVisita() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = presupuestado(cliente, prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.responderPresupuesto(10L, "cli", false);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.COMPLETADO);
        assertThat(t.getPresupuestoAceptado()).isFalse();
        assertThat(t.getMontoPagado()).isEqualByComparingTo("15000");
        assertThat(t.getEstadoPago()).isEqualTo(EstadoPago.PAGADO);
    }

    @Test
    void responder_noDuenoLanza403() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User otro = user(3L, "otro", UserRole.CLIENT);
        Trabajo t = presupuestado(cliente, prov);
        when(userRepository.findByFirebaseUid("otro")).thenReturn(Optional.of(otro));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.responderPresupuesto(10L, "otro", true))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void responder_estadoInvalidoLanza() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = presupuestado(cliente, prov);
        t.setEstado(TrabajoEstado.EN_CURSO);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.responderPresupuesto(10L, "cli", true))
                .isInstanceOf(RuntimeException.class);
    }
}
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.ResponderPresupuestoTest"`
Expected: FAIL — `responderPresupuesto` no existe.

- [ ] **Step 3: Implementar el método de servicio**

En `TrabajoService`, agregar:

```java
    @Transactional
    public TrabajoResponseDTO responderPresupuesto(Long trabajoId, String clienteFirebaseUid, boolean aceptar) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PRESUPUESTADO)) {
            throw new RuntimeException("El trabajo no tiene un presupuesto pendiente");
        }
        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        User proveedor = trabajo.getProveedor();

        trabajo.setPresupuestoAceptado(aceptar);
        trabajo.setMontoPagado(aceptar ? trabajo.getMontoPresupuesto() : trabajo.getTarifaVisita());
        trabajo.setEstadoPago(EstadoPago.PAGADO);
        trabajo.setPagadoAt(LocalDateTime.now());

        cerrarTrabajoCompletado(trabajo, proveedor);

        notificacionService.enviarNotificacion(
                proveedor.getFirebaseUid(),
                aceptar ? TipoNotificacion.PRESUPUESTO_ACEPTADO : TipoNotificacion.PRESUPUESTO_RECHAZADO,
                aceptar ? "Presupuesto aceptado" : "Presupuesto rechazado",
                aceptar
                        ? trabajo.getCliente().getNombre() + " aceptó tu presupuesto de " + trabajo.getOficio().getNombre() + "."
                        : trabajo.getCliente().getNombre() + " rechazó el presupuesto; se cobra solo la visita.",
                trabajo.getId(),
                "/proveedor/completado/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }
```

- [ ] **Step 4: Agregar el endpoint**

En `controller/TrabajoController.java`, importar `ResponderPresupuestoDTO` y agregar:

```java
    @PatchMapping("/{id}/responder-presupuesto")
    public ResponseEntity<TrabajoResponseDTO> responderPresupuesto(
            @PathVariable Long id,
            @Valid @RequestBody ResponderPresupuestoDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.responderPresupuesto(id, uid, dto.getAceptar());
        return ResponseEntity.ok(trabajo);
    }
```

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.ResponderPresupuestoTest"`
Expected: PASS (4 tests).

- [ ] **Step 6: Correr toda la suite backend**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (todo verde, incluye los refactors).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/main/java/com/aliados/backend/controller/TrabajoController.java \
        backend/src/test/java/com/aliados/backend/service/ResponderPresupuestoTest.java
git commit -m "$(cat <<'EOF'
feat(presupuesto): endpoint /responder-presupuesto (aceptar/rechazar → COMPLETADO)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 6: Frontend proveedor — página de presupuesto

**Files:**
- Modify: `apps/app/src/shared/constants/routes.ts`
- Modify: `apps/app/src/router/AppRouter.tsx`
- Create: `apps/app/src/features/provider/pages/PresupuestoTrabajo.tsx`
- Modify: `apps/app/src/features/provider/pages/ActiveJob.tsx`

**Interfaces:**
- Consumes: `PATCH /api/trabajos/{id}/presupuestar` con body `{ montoPresupuesto: number, notaResumen: string }`.
- Produces: ruta `ROUTES.PROVIDER.PRESUPUESTO(id)` → `/proveedor/presupuesto/:id`.

- [ ] **Step 1: Agregar la ruta**

En `apps/app/src/shared/constants/routes.ts`, dentro de `PROVIDER`, después de `CREDENCIAL`:

```ts
    PRESUPUESTO: (id: string | number = ':id') => `/proveedor/presupuesto/${id}`,
```

- [ ] **Step 2: Registrar la ruta en el router**

En `apps/app/src/router/AppRouter.tsx`, agregar el lazy import (junto a los otros de provider):

```tsx
const PresupuestoTrabajo  = lazy(() => import("@/features/provider/pages/PresupuestoTrabajo").then(m => ({ default: m.PresupuestoTrabajo })));
```

Y dentro del bloque de rutas del proveedor (después de `trabajo-activo/:id`):

```tsx
                <Route path="presupuesto/:id"    element={<PresupuestoTrabajo />} />
```

- [ ] **Step 3: Crear la página de presupuesto**

Create `apps/app/src/features/provider/pages/PresupuestoTrabajo.tsx`:

```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/apiClient";
import { useTrabajo } from "@/shared/hooks/useTrabajo";
import toast from "react-hot-toast";

export function PresupuestoTrabajo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: trabajo } = useTrabajo<any>(id);

  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");

  const enviarMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/trabajos/${id}/presupuestar`, {
        montoPresupuesto: Number(monto),
        notaResumen: nota.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trabajo-activo"] });
      toast.success("Presupuesto enviado al cliente");
      navigate(ROUTES.PROVIDER.DASHBOARD);
    },
    onError: () => toast.error("No se pudo enviar el presupuesto"),
  });

  const montoValido = monto !== "" && Number(monto) > 0;

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className={`text-xl font-bold ${tw.text.primary}`}>Presupuesto del trabajo</h1>

          <Card>
            <div className="space-y-1 text-sm">
              <p className={tw.text.secondary}>Oficio: <span className={tw.text.primary}>{trabajo?.oficio?.nombre}</span></p>
              <p className={tw.text.secondary}>Pedido: <span className={tw.text.primary}>{trabajo?.descripcion}</span></p>
              <p className={tw.text.secondary}>
                Tarifa de visita: <span className={tw.text.primary}>${trabajo?.tarifaVisita?.toLocaleString("es-AR") || "15.000"}</span>
              </p>
            </div>
          </Card>

          <Card>
            <label className={`mb-1 block text-sm font-medium ${tw.text.primary}`}>Monto del trabajo</label>
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="Ej: 100000"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <label className={`mb-1 mt-4 block text-sm font-medium ${tw.text.primary}`}>Nota (opcional)</label>
            <textarea
              className={tw.input}
              rows={3}
              placeholder="Detalle de lo que harías"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </Card>

          <Button
            onClick={() => enviarMutation.mutate()}
            disabled={!montoValido || enviarMutation.isPending}
            className="w-full"
          >
            {enviarMutation.isPending ? "Enviando..." : "Enviar presupuesto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Nota: verificá los nombres reales exportados por el UI kit (`Input`, `Card`, `Button`) y el token de textarea (`tw.input`); si el proyecto usa otra clase para inputs, ajustá `className` del `textarea` al patrón existente (mirá cómo lo hace otra página con textarea, p. ej. la de cancelar/motivo).

- [ ] **Step 4: Cambiar el botón de `ActiveJob`**

En `apps/app/src/features/provider/pages/ActiveJob.tsx`, reemplazar la mutación/handler de "Marcar como completado" por navegación a la página de presupuesto. Agregar `import { useNavigate } from "react-router-dom";` y `import { ROUTES } from "@/shared/constants/routes";` si faltan, y cambiar el botón (~línea 263) para que en `onClick` haga `navigate(ROUTES.PROVIDER.PRESUPUESTO(id))`, con el texto **"Enviar presupuesto"**:

```tsx
              <Button
                onClick={() => navigate(ROUTES.PROVIDER.PRESUPUESTO(id!))}
                className="w-full"
              >
                Enviar presupuesto
              </Button>
```

Quitar la `completarMutation` si queda sin uso (y el texto que decía "marcá el trabajo como completado" pasa a "Cuando termines de revisar, enviá el presupuesto al cliente.").

- [ ] **Step 5: Verificar compilación**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/shared/constants/routes.ts apps/app/src/router/AppRouter.tsx \
        apps/app/src/features/provider/pages/PresupuestoTrabajo.tsx \
        apps/app/src/features/provider/pages/ActiveJob.tsx
git commit -m "$(cat <<'EOF'
feat(presupuesto): página de presupuesto del proveedor + navegación desde ActiveJob

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 7: Frontend cliente — pantalla de presupuesto + calificación en ambas ramas

**Files:**
- Modify: `apps/app/src/features/client/pages/JobTracking.tsx`
- Modify: `apps/app/src/features/client/pages/JobCompleted.tsx`

**Interfaces:**
- Consumes: `PATCH /api/trabajos/{id}/responder-presupuesto` con body `{ aceptar: boolean }`; campos `estado === 'PRESUPUESTADO'`, `montoPresupuesto`, `notaResumen`, `tarifaVisita`, `presupuestoAceptado` del DTO.

- [ ] **Step 1: JobTracking — redirección/render del estado `PRESUPUESTADO`**

En `apps/app/src/features/client/pages/JobTracking.tsx`, en el `useEffect` que redirige por estado (donde maneja `COMPLETADO`/`PROPUESTO`), NO redirigir en `PRESUPUESTADO`: se renderiza inline. Agregar, dentro del render (antes del bloque normal de seguimiento), un branch cuando `trabajo.estado === 'PRESUPUESTADO'` que muestre el presupuesto y las dos acciones:

```tsx
  const responderMutation = useMutation({
    mutationFn: (aceptar: boolean) =>
      apiClient.patch(`/api/trabajos/${jobId}/responder-presupuesto`, { aceptar }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajo', jobId] });
    },
    onError: () => toast.error('No se pudo procesar tu respuesta'),
  });
```

```tsx
  if (trabajo.estado === 'PRESUPUESTADO') {
    const montoTrabajo = Number(trabajo.montoPresupuesto ?? 0);
    const visita = Number(trabajo.tarifaVisita ?? 15000);
    return (
      <div className={tw.pageBg}>
        <div className={tw.container}>
          <div className="mx-auto max-w-lg space-y-4">
            <h1 className={`text-xl font-bold ${tw.text.primary}`}>Presupuesto del trabajo</h1>
            <Card>
              <p className={`text-sm ${tw.text.secondary}`}>{trabajo.oficio?.nombre}</p>
              {trabajo.notaResumen && (
                <p className={`mt-2 text-sm ${tw.text.primary}`}>{trabajo.notaResumen}</p>
              )}
              <p className={`mt-4 text-3xl font-bold ${tw.text.primary}`}>
                ${montoTrabajo.toLocaleString('es-AR')}
              </p>
              <p className={`mt-1 text-xs ${tw.text.muted}`}>
                Si no aceptás, pagás solo la visita (${visita.toLocaleString('es-AR')}).
              </p>
            </Card>
            <Button
              onClick={() => responderMutation.mutate(true)}
              disabled={responderMutation.isPending}
              className="w-full"
            >
              Aceptar y pagar ${montoTrabajo.toLocaleString('es-AR')}
            </Button>
            <Button
              variant="outline"
              onClick={() => responderMutation.mutate(false)}
              disabled={responderMutation.isPending}
              className="w-full"
            >
              Rechazar (pagás solo la visita ${visita.toLocaleString('es-AR')})
            </Button>
          </div>
        </div>
      </div>
    );
  }
```

Al invalidar la query tras responder, el trabajo pasa a `COMPLETADO` y el `useEffect` existente redirige a `JobCompleted` (verificá que ese efecto redirige en `COMPLETADO`; ya lo hace hoy). Asegurate de que `useMutation`, `useQueryClient`, `Card`, `Button`, `toast` y `tw` estén importados (varios ya lo están).

- [ ] **Step 2: JobCompleted — mensaje contextual, calificación siempre**

En `apps/app/src/features/client/pages/JobCompleted.tsx`, la calificación ya se muestra para trabajos `COMPLETADO` y se mantiene **en ambas ramas** (no gatear por `presupuestoAceptado`). Agregar solo un mensaje contextual arriba de la calificación:

```tsx
      {trabajo.presupuestoAceptado === false && (
        <p className={`mb-4 text-sm ${tw.text.muted}`}>
          Rechazaste el presupuesto: se cobró solo la visita de ${Number(trabajo.tarifaVisita ?? 15000).toLocaleString('es-AR')}. Igual podés calificar al profesional.
        </p>
      )}
      {trabajo.presupuestoAceptado === true && trabajo.montoPagado != null && (
        <p className={`mb-4 text-sm ${tw.text.muted}`}>
          Pagaste ${Number(trabajo.montoPagado).toLocaleString('es-AR')} por el trabajo.
        </p>
      )}
```

(Ubicá estos bloques dentro del render de `COMPLETADO`, justo antes de la card de calificación. No toques la lógica de calificación existente.)

- [ ] **Step 3: Verificar compilación**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/client/pages/JobTracking.tsx \
        apps/app/src/features/client/pages/JobCompleted.tsx
git commit -m "$(cat <<'EOF'
feat(presupuesto): pantalla de presupuesto del cliente + calificación en ambas ramas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TzXecymvFzCTPW62FUJN6g
EOF
)"
```

---

## Task 8: Verificación end-to-end y PR

**Files:** ninguno (verificación + entrega).

- [ ] **Step 1: Suite completa backend**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: Typecheck + suite frontend**

Run: `cd apps/app && pnpm exec tsc --noEmit && pnpm test`
Expected: sin errores de tipos; suite verde (no se agregaron tests de render).

- [ ] **Step 3: Verificación visual (skill `verify` / `run`)**

Levantar la app. Como **proveedor** con un trabajo `EN_CURSO`: en `ActiveJob` tocar **"Enviar presupuesto"** → cargar monto (p. ej. 100000) + nota → enviar. Como **cliente** del mismo trabajo: en seguimiento aparece la pantalla de presupuesto con el monto y la aclaración de la visita → probar **Aceptar** (queda pagado el total, luego se puede calificar) y, en otro trabajo, **Rechazar** (se cobra solo la visita, igual se puede calificar). Confirmar que el proveedor queda libre y avanza la cola en ambos casos.

- [ ] **Step 4: Push y PR a main**

```bash
git push -u origin feat/presupuesto-trabajo
gh pr create --base main --title "feat: presupuesto post-visita + pago del trabajo" --body "$(cat <<'EOF'
## Qué

Gate de presupuesto post-visita para trabajos. Estando EN_CURSO, el proveedor envía un **presupuesto** (nuevo estado `PRESUPUESTADO`); el cliente **acepta** (paga el total) o **rechaza** (paga solo la visita). En ambos casos el trabajo se cierra (COMPLETADO), avanza la cola y se puede **calificar**.

- Backend: estado `PRESUPUESTADO`, enum `EstadoPago`, campos + migración V10, endpoints `/presupuestar` (proveedor) y `/responder-presupuesto` (cliente), refactor `cerrarTrabajoCompletado`.
- Frontend: página de presupuesto del proveedor + pantalla de presupuesto del cliente; calificación disponible en ambas ramas.

Pago **sin Mercado Pago** (solo marca `estadoPago`); MP queda para una iteración futura.

Spec: `docs/superpowers/specs/2026-07-11-presupuesto-trabajo-design.md`
Plan: `docs/superpowers/plans/2026-07-11-presupuesto-trabajo.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(No mergear: lo hace el usuario.)

---

## Self-Review

**Spec coverage:**
- Estado `PRESUPUESTADO` + enum `EstadoPago` + campos + migración (spec §1, §2) → Task 1. ✓
- DTOs + exposición en respuesta (spec §2) → Task 2. ✓
- Refactor de cierre reutilizable (spec §2) → Task 3. ✓
- `/presupuestar` (spec §2) → Task 4. ✓
- `/responder-presupuesto` con bifurcación de monto (spec §2, decisiones 4-6) → Task 5. ✓
- Página de presupuesto del proveedor + botón en ActiveJob (spec §3) → Task 6. ✓
- Pantalla de presupuesto del cliente + calificación en ambas ramas (spec §3, decisión 7) → Task 7. ✓
- Manejo de errores (spec §4): estado inválido y 403 cubiertos en Tasks 4-5 (tests); monto ≤0 vía `@Positive` (Task 2) + botón deshabilitado (Task 6). ✓
- Testing (spec §5): tests backend en Tasks 4-5; frontend visual en Task 8 (patrón del repo). ✓

**Placeholder scan:** sin TBD/TODO. Las dos notas de "verificá el nombre real" (Task 6 textarea/UI-kit; Task 7 efecto de redirección de JobTracking) son verificaciones sobre código existente no leído en detalle, no placeholders de lógica: el endpoint, el body y los estados son fijos.

**Type consistency:** `presupuestarTrabajo(Long, String, BigDecimal, String)` y `responderPresupuesto(Long, String, boolean)` usados igual en service/controller/tests. Campos `montoPresupuesto/notaResumen/presupuestoAceptado/montoPagado/estadoPago/pagadoAt` consistentes entre entidad (Task 1), DTO/mapping (Task 2) y frontend (Tasks 6-7). `EstadoPago.PENDIENTE_PAGO/PAGADO` y `TrabajoEstado.PRESUPUESTADO` consistentes. Endpoints `/presupuestar` y `/responder-presupuesto` con los bodies de los DTOs de Task 2. ✓
