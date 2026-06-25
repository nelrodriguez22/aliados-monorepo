# Escalado automático de trabajos sin proveedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un scheduler que re-ofrece automáticamente los trabajos PENDIENTE cuyo proveedor no responde, y los cancela si tras un reintento siguen sin tomar, avisando al cliente.

**Architecture:** `@Scheduled` (60s) lee dos umbrales de feature flags y delega en `TrabajoService.escalarPendientes(t1, t2)`, que reusa la rotación existente (`notificarProveedorDisponible`) y un refactor del core de cancelación. Un contador `reintentos` en `Trabajo` distingue la 1ª ventana de la 2ª.

**Tech Stack:** Spring Boot 3.4.2 (Java 21, Lombok, JPA, Flyway), Mockito 5.14.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21. Próxima migración Flyway: `V4`.
- Política: por cada PENDIENTE con `ref = notificadoAt ?? createdAt`:
  `reintentos==0 && ref>timeout1` → re-ofrecer (excluir actual) + `reintentos=1` + notificar cliente;
  `reintentos>=1 && ref>timeout2` → cancelar + notificar cliente.
- Umbrales en flags NUMBER: `trabajo_oferta_timeout1_min` (seed `3`, launch 30), `trabajo_oferta_timeout2_min` (seed `3`, launch 15). Fallback prod-safe en el scheduler: 30 / 15.
- Tests backend SIN base de datos (Mockito `@InjectMocks`, no `@SpringBootTest`) → corren en el CI.
- Reusar lógica existente: `notificarProveedorDisponible(Trabajo, Long excluirId)` (privado) y `NotificacionService.enviarNotificacion(firebaseUid, tipo, titulo, mensaje, trabajoId, actionUrl)`.
- `@EnableScheduling` ya está activo (feature de flags).

---

### Task 1: Persistencia (migración + campo + repo + enum)

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__trabajo_reintentos_y_flags_escalado.sql`
- Modify: `backend/src/main/java/com/aliados/backend/entity/Trabajo.java`
- Modify: `backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java`
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java`

**Interfaces:**
- Produces: `Trabajo.getReintentos()/setReintentos(Integer)`; `TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR`, `TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR`; `TrabajoRepository.findByEstado(TrabajoEstado)`.

- [ ] **Step 1: Crear la migración**

`backend/src/main/resources/db/migration/V4__trabajo_reintentos_y_flags_escalado.sql`:
```sql
ALTER TABLE trabajos ADD COLUMN reintentos INTEGER NOT NULL DEFAULT 0;

-- Umbrales de escalado como feature flags (NUMBER). Seed en valores de testing (3/3);
-- en launch se suben a 30/15 desde el panel admin. Idempotente: no pisa cambios de runtime.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('trabajo_oferta_timeout1_min', true, '3', 'NUMBER',
   'Minutos de espera de la 1a oferta antes de re-ofrecer al siguiente proveedor (launch: 30).'),
  ('trabajo_oferta_timeout2_min', true, '3', 'NUMBER',
   'Minutos de espera del reintento antes de cancelar el trabajo (launch: 15).')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Agregar el campo a la entity**

En `Trabajo.java`, agregar junto a los otros campos (es `@Data`, genera getter/setter):
```java
    @Column(nullable = false)
    private Integer reintentos = 0;
```

- [ ] **Step 3: Agregar los valores al enum**

En `TipoNotificacion.java`, agregar al final de la lista (antes del `}`):
```java
    TRABAJO_BUSCANDO_PROVEEDOR,
    TRABAJO_CANCELADO_SIN_PROVEEDOR
```
(Agregar la coma al valor anterior si hace falta.)

- [ ] **Step 4: Agregar el método al repository**

En `TrabajoRepository.java`, agregar:
```java
    java.util.List<com.aliados.backend.entity.Trabajo> findByEstado(com.aliados.backend.entity.TrabajoEstado estado);
```
(O usar los imports ya presentes en el archivo: `List<Trabajo> findByEstado(TrabajoEstado estado);`.)

- [ ] **Step 5: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V4__trabajo_reintentos_y_flags_escalado.sql \
        backend/src/main/java/com/aliados/backend/entity/Trabajo.java \
        backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java
git commit -m "feat(backend): reintentos en trabajos + flags de escalado + findByEstado"
```

---

### Task 2: TrabajoService — refactor cancelación + escalarPendientes (TDD)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (refactor de `cancelarTrabajo` ~líneas 514-538; nuevos métodos)
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java`

**Interfaces:**
- Consumes: `Trabajo`, `TrabajoEstado.PENDIENTE`/`CANCELADO`, `TipoNotificacion.*` (Task 1); privados existentes `notificarProveedorDisponible(Trabajo, Long)`, `mapToDTO(Trabajo)`.
- Produces: `public void escalarPendientes(int timeout1Min, int timeout2Min)`; privado `aplicarCancelacion(Trabajo, String)`.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java`:
```java
package com.aliados.backend.service;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrabajoEscalacionTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;

    @InjectMocks TrabajoService trabajoService;

    private Trabajo pendiente(int reintentos, LocalDateTime notificadoAt) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        User cliente = new User();
        cliente.setFirebaseUid("cliente-uid");
        cliente.setLocalidad("Rosario");
        Trabajo t = new Trabajo();
        t.setId(100L);
        t.setEstado(TrabajoEstado.PENDIENTE);
        t.setReintentos(reintentos);
        t.setNotificadoAt(notificadoAt);
        t.setCreatedAt(notificadoAt != null ? notificadoAt : LocalDateTime.now().minusHours(1));
        t.setProveedorNotificadoId(5L);
        t.setCliente(cliente);
        t.setOficio(oficio);
        return t;
    }

    @Test
    void ventana1_vencida_reofrece_incrementa_y_notifica_cliente() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        when(trabajoRepository.findByEstado(TrabajoEstado.PENDIENTE)).thenReturn(List.of(t));
        // Sin proveedor disponible: la re-oferta corre pero no asigna (camino simple).
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(List.of());

        trabajoService.escalarPendientes(3, 3);

        assertThat(t.getReintentos()).isEqualTo(1);
        verify(userRepository).findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt());
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void ventana2_vencida_cancela_y_notifica_cliente() {
        Trabajo t = pendiente(1, LocalDateTime.now().minusMinutes(10));
        when(trabajoRepository.findByEstado(TrabajoEstado.PENDIENTE)).thenReturn(List.of(t));

        trabajoService.escalarPendientes(3, 3);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.CANCELADO);
        assertThat(t.getMotivoCancelacion()).isEqualTo("No encontramos un profesional disponible");
        verify(cloudinaryService).borrarFotos(any());
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void dentro_de_la_ventana_no_hace_nada() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(1));
        when(trabajoRepository.findByEstado(TrabajoEstado.PENDIENTE)).thenReturn(List.of(t));

        trabajoService.escalarPendientes(3, 3);

        assertThat(t.getReintentos()).isEqualTo(0);
        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PENDIENTE);
        verifyNoInteractions(notificacionService);
        verify(cloudinaryService, never()).borrarFotos(any());
    }

    @Test
    void notificadoAt_null_usa_createdAt_como_referencia() {
        Trabajo t = pendiente(0, null); // notificadoAt null → ref = createdAt (now-1h, viejo)
        when(trabajoRepository.findByEstado(TrabajoEstado.PENDIENTE)).thenReturn(List.of(t));
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(List.of());

        trabajoService.escalarPendientes(3, 3);

        assertThat(t.getReintentos()).isEqualTo(1); // createdAt viejo → ventana 1 vence
    }
}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*TrabajoEscalacionTest' --no-daemon`
Expected: FAIL (no compila: `escalarPendientes` no existe)

- [ ] **Step 3: Refactor de `cancelarTrabajo` + `aplicarCancelacion`**

En `TrabajoService.java`, reemplazar el cuerpo de `cancelarTrabajo` (las líneas que setean CANCELADO y guardan) para que delegue en un privado nuevo. El método queda:
```java
    public TrabajoResponseDTO cancelarTrabajo(Long trabajoId, String clienteFirebaseUid, String motivo) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("Solo se pueden cancelar trabajos pendientes");
        }

        aplicarCancelacion(trabajo, motivo);
        return mapToDTO(trabajo);
    }

    // Core de cancelación reusable (cliente y escalado automático).
    private void aplicarCancelacion(Trabajo trabajo, String motivo) {
        trabajo.setEstado(TrabajoEstado.CANCELADO);
        trabajo.setProveedorNotificadoId(null);
        trabajo.setNotificadoAt(null);
        trabajo.setMotivoCancelacion(motivo);
        trabajoRepository.save(trabajo);
        cloudinaryService.borrarFotos(trabajo.getFotos());
    }
```

- [ ] **Step 4: Agregar `escalarPendientes` + helper de notificación**

Agregar el import `import java.time.temporal.ChronoUnit;` (si no está) y estos métodos a `TrabajoService`:
```java
    /**
     * Escalado automático de trabajos PENDIENTE sin respuesta del proveedor.
     * timeout1Min: minutos para re-ofrecer al siguiente (1 reintento).
     * timeout2Min: minutos del reintento antes de cancelar.
     */
    public void escalarPendientes(int timeout1Min, int timeout2Min) {
        LocalDateTime now = LocalDateTime.now();
        for (Trabajo t : trabajoRepository.findByEstado(TrabajoEstado.PENDIENTE)) {
            try {
                LocalDateTime ref = t.getNotificadoAt() != null ? t.getNotificadoAt() : t.getCreatedAt();
                long mins = ChronoUnit.MINUTES.between(ref, now);
                int reintentos = t.getReintentos() != null ? t.getReintentos() : 0;

                if (reintentos == 0 && mins >= timeout1Min) {
                    Long excluir = t.getProveedorNotificadoId();
                    t.setReintentos(1);
                    trabajoRepository.save(t); // persiste el contador aunque no haya proveedor
                    notificarProveedorDisponible(t, excluir);
                    notificarCliente(t, TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR,
                            "Seguimos buscando",
                            "Seguimos buscando un profesional para tu pedido de "
                                    + t.getOficio().getNombre() + ".");
                } else if (reintentos >= 1 && mins >= timeout2Min) {
                    aplicarCancelacion(t, "No encontramos un profesional disponible");
                    notificarCliente(t, TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR,
                            "Pedido cancelado",
                            "No encontramos un profesional disponible. Cancelamos tu pedido de "
                                    + t.getOficio().getNombre() + "; podés volver a intentarlo.");
                }
            } catch (Exception e) {
                logger.error("Error escalando trabajo {}: {}", t.getId(), e.getMessage(), e);
            }
        }
    }

    private void notificarCliente(Trabajo t, TipoNotificacion tipo, String titulo, String mensaje) {
        notificacionService.enviarNotificacion(
                t.getCliente().getFirebaseUid(), tipo, titulo, mensaje, t.getId(), null);
    }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*TrabajoEscalacionTest' --no-daemon`
Expected: PASS (3 tests). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java
git commit -m "feat(backend): TrabajoService.escalarPendientes (timeout de oferta + expiración)"
```

---

### Task 3: Scheduler

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/service/TrabajoEscalationScheduler.java`

**Interfaces:**
- Consumes: `TrabajoService.escalarPendientes(int, int)` (Task 2); `FeatureFlagService.getNumber(String, double)` (feature ya existente).

- [ ] **Step 1: Crear el scheduler**

`backend/src/main/java/com/aliados/backend/service/TrabajoEscalationScheduler.java`:
```java
package com.aliados.backend.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Cada 60s: re-ofrece ofertas vencidas y expira trabajos sin proveedor.
// Los umbrales (en minutos) viven en feature flags y se tunean sin redeploy.
@Component
public class TrabajoEscalationScheduler {

    private final TrabajoService trabajoService;
    private final FeatureFlagService featureFlagService;

    public TrabajoEscalationScheduler(TrabajoService trabajoService, FeatureFlagService featureFlagService) {
        this.trabajoService = trabajoService;
        this.featureFlagService = featureFlagService;
    }

    @Scheduled(fixedDelay = 60_000)
    public void escalar() {
        int timeout1 = (int) featureFlagService.getNumber("trabajo_oferta_timeout1_min", 30);
        int timeout2 = (int) featureFlagService.getNumber("trabajo_oferta_timeout2_min", 15);
        trabajoService.escalarPendientes(timeout1, timeout2);
    }
}
```

- [ ] **Step 2: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoEscalationScheduler.java
git commit -m "feat(backend): scheduler de escalado de trabajos (60s, umbrales por flag)"
```

---

## Deploy notes

- Los flags se seedean en **3/3** (testing). **Antes de lanzar**, subir `trabajo_oferta_timeout1_min` a `30` y `trabajo_oferta_timeout2_min` a `15` desde el panel de feature flags.
- La migración V4 es aditiva (columna con default + seed idempotente).
- Verificación manual post-deploy: crear un trabajo, no tomarlo, y observar (con timeouts bajos) la re-oferta a los ~timeout1 min y la cancelación + notificación a los ~timeout1+timeout2 min.
