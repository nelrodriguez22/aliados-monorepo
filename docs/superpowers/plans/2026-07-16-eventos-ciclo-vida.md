# Eventos de Ciclo de Vida (trabajo_evento / mudanza_evento) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit log append-only de transiciones de estado de `Trabajo` y `Mudanza`, con actor y motivo, más endpoint admin de lectura.

**Architecture:** Dos tablas gemelas (`trabajo_evento`, `mudanza_evento`) escritas por inserts explícitos desde `TrabajoService`/`MudanzaService` vía un `EventoService` que corre en la transacción del caller. Lectura por `GET /api/admin/{trabajos|mudanzas}/{id}/eventos`.

**Tech Stack:** Spring Boot + JPA/Hibernate, Flyway (Postgres), Lombok, JUnit 5 + Mockito (unit), Testcontainers (`SchemaMigrationIT`, valida esquema), MockMvc standalone (controllers).

**Spec:** `docs/superpowers/specs/2026-07-16-eventos-ciclo-vida-design.md`

## Global Constraints

- Directorio de trabajo backend: `/Users/nelrodriguez/proyectos/.pri/aliados/backend` — todos los comandos gradle se corren ahí.
- `spring.jpa.hibernate.ddl-auto=validate` + Flyway: toda tabla nueva ENTRA POR MIGRACIÓN (`V12__eventos_ciclo_vida.sql`); las entidades deben calzar exacto o `SchemaMigrationIT` rompe.
- Tests unitarios: `./gradlew test` (sin Docker). Integración: `./gradlew integrationTest` (requiere Docker corriendo).
- Los services usan inyección por campo `@Autowired` (NO constructor). Los tests unitarios usan `@ExtendWith(MockitoExtension.class)` + `@Mock`/`@InjectMocks`.
- Todo test de servicio que ejercite un método que ahora llama a `EventoService` NECESITA `@Mock EventoService eventoService` o revienta con NPE.
- `EventoService.registrar*` NO lleva `@Transactional` propio ni try/catch: corre en la TXN del caller, fallan juntas (decisión validada en el spec).
- Las tablas de eventos son append-only: ningún UPDATE/DELETE, entidades sin setters post-creación en uso.
- Commits en español, estilo del repo (`feat(backend): ...`). Están firmados con GPG: si un commit "cuelga", hay un diálogo pinentry esperando passphrase.
- Comentarios en el código en español, con el estilo denso-en-porqués del codebase.

---

### Task 1: Migración V12, enums, entidades y repositorios

**Files:**
- Create: `backend/src/main/resources/db/migration/V12__eventos_ciclo_vida.sql`
- Create: `backend/src/main/java/com/aliados/backend/entity/TipoEvento.java`
- Create: `backend/src/main/java/com/aliados/backend/entity/ActorTipo.java`
- Create: `backend/src/main/java/com/aliados/backend/entity/TrabajoEvento.java`
- Create: `backend/src/main/java/com/aliados/backend/entity/MudanzaEvento.java`
- Create: `backend/src/main/java/com/aliados/backend/repository/TrabajoEventoRepository.java`
- Create: `backend/src/main/java/com/aliados/backend/repository/MudanzaEventoRepository.java`
- Test: `backend/src/test/java/com/aliados/backend/SchemaMigrationIT.java` (existente, sin cambios — valida solo)

**Interfaces:**
- Consumes: entidades existentes `Trabajo`, `Mudanza`, `User`.
- Produces: `TrabajoEvento`/`MudanzaEvento` (entidades JPA), `TipoEvento { CAMBIO_ESTADO, CAMBIO_ESTADO_PAGO }`, `ActorTipo { CLIENTE, PROVEEDOR, SISTEMA, ADMIN }`, `TrabajoEventoRepository.findByTrabajoIdOrderByIdAsc(Long)`, `MudanzaEventoRepository.findByMudanzaIdOrderByIdAsc(Long)`.

- [ ] **Step 1: Crear los enums**

`entity/TipoEvento.java`:

```java
package com.aliados.backend.entity;

public enum TipoEvento {
    CAMBIO_ESTADO,
    CAMBIO_ESTADO_PAGO
}
```

`entity/ActorTipo.java`:

```java
package com.aliados.backend.entity;

// ADMIN queda previsto aunque hoy ningún flujo admin mute estados:
// agregarlo después costaría una migración de datos de cero valor.
public enum ActorTipo {
    CLIENTE,
    PROVEEDOR,
    SISTEMA,
    ADMIN
}
```

- [ ] **Step 2: Crear las entidades (test de esquema va a fallar: tabla inexistente)**

`entity/TrabajoEvento.java`:

```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Audit log append-only del ciclo de vida de un Trabajo. Una fila por transición
 * (de estado o de estado de pago), con quién la ejecutó. Jamás se actualiza ni
 * borra: es la fuente de verdad forense que los timestamps de Trabajo no dan
 * (se pisan ante re-transiciones y no registran actor).
 */
@Entity
@Table(name = "trabajo_evento")
@Data
public class TrabajoEvento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TipoEvento tipo;

    // String y no enum: guarda TrabajoEstado o EstadoPago según tipo.
    @Column(name = "valor_anterior", length = 30)
    private String valorAnterior; // NULL en la creación (∅ → PENDIENTE)

    @Column(name = "valor_nuevo", nullable = false, length = 30)
    private String valorNuevo;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_tipo", nullable = false, length = 20)
    private ActorTipo actorTipo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor; // NULL cuando actorTipo = SISTEMA

    @Column(length = 500)
    private String detalle; // motivo de cancelación, etc.

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
```

`entity/MudanzaEvento.java` (gemela; solo cambia el padre):

```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** Gemela de TrabajoEvento para Mudanza. Ver la doc de esa clase. */
@Entity
@Table(name = "mudanza_evento")
@Data
public class MudanzaEvento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mudanza_id", nullable = false)
    private Mudanza mudanza;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TipoEvento tipo;

    @Column(name = "valor_anterior", length = 30)
    private String valorAnterior;

    @Column(name = "valor_nuevo", nullable = false, length = 30)
    private String valorNuevo;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_tipo", nullable = false, length = 20)
    private ActorTipo actorTipo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    @Column(length = 500)
    private String detalle;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
```

- [ ] **Step 3: Correr el IT de esquema y verificar que FALLA**

Run: `./gradlew integrationTest --tests "com.aliados.backend.SchemaMigrationIT"`
Expected: FAIL — `Schema-validation: missing table [mudanza_evento]` (o `trabajo_evento`).

- [ ] **Step 4: Escribir la migración**

`db/migration/V12__eventos_ciclo_vida.sql`:

```sql
-- Audit log append-only del ciclo de vida de trabajos y mudanzas.
-- Una fila por transición, con actor. Complementa (no reemplaza) los timestamps
-- de las tablas padre, que se pisan ante re-transiciones y no registran quién.
CREATE TABLE trabajo_evento (
    id             BIGSERIAL PRIMARY KEY,
    trabajo_id     BIGINT      NOT NULL REFERENCES trabajos (id),
    tipo           VARCHAR(30) NOT NULL,  -- CAMBIO_ESTADO | CAMBIO_ESTADO_PAGO
    valor_anterior VARCHAR(30),           -- NULL en la creación
    valor_nuevo    VARCHAR(30) NOT NULL,
    actor_tipo     VARCHAR(20) NOT NULL,  -- CLIENTE | PROVEEDOR | SISTEMA | ADMIN
    actor_id       BIGINT REFERENCES users (id),  -- NULL cuando SISTEMA
    detalle        VARCHAR(500),
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Única query prevista: timeline de una entidad (ORDER BY id = orden cronológico).
CREATE INDEX idx_trabajo_evento_trabajo_id ON trabajo_evento (trabajo_id);

CREATE TABLE mudanza_evento (
    id             BIGSERIAL PRIMARY KEY,
    mudanza_id     BIGINT      NOT NULL REFERENCES mudanzas (id),
    tipo           VARCHAR(30) NOT NULL,
    valor_anterior VARCHAR(30),
    valor_nuevo    VARCHAR(30) NOT NULL,
    actor_tipo     VARCHAR(20) NOT NULL,
    actor_id       BIGINT REFERENCES users (id),
    detalle        VARCHAR(500),
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mudanza_evento_mudanza_id ON mudanza_evento (mudanza_id);
```

- [ ] **Step 5: Crear los repositorios**

`repository/TrabajoEventoRepository.java`:

```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.TrabajoEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TrabajoEventoRepository extends JpaRepository<TrabajoEvento, Long> {
    List<TrabajoEvento> findByTrabajoIdOrderByIdAsc(Long trabajoId);
}
```

`repository/MudanzaEventoRepository.java`:

```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.MudanzaEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MudanzaEventoRepository extends JpaRepository<MudanzaEvento, Long> {
    List<MudanzaEvento> findByMudanzaIdOrderByIdAsc(Long mudanzaId);
}
```

- [ ] **Step 6: Correr el IT de esquema y verificar que PASA**

Run: `./gradlew integrationTest --tests "com.aliados.backend.SchemaMigrationIT"`
Expected: PASS (Flyway aplica V12 y las entidades validan).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V12__eventos_ciclo_vida.sql \
        backend/src/main/java/com/aliados/backend/entity/TipoEvento.java \
        backend/src/main/java/com/aliados/backend/entity/ActorTipo.java \
        backend/src/main/java/com/aliados/backend/entity/TrabajoEvento.java \
        backend/src/main/java/com/aliados/backend/entity/MudanzaEvento.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoEventoRepository.java \
        backend/src/main/java/com/aliados/backend/repository/MudanzaEventoRepository.java
git commit -m "feat(backend): tablas de eventos de ciclo de vida (trabajo_evento, mudanza_evento)"
```

---

### Task 2: EventoService (escritura)

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/service/EventoService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/EventoServiceTest.java`

**Interfaces:**
- Consumes: `TrabajoEventoRepository`, `MudanzaEventoRepository` (Task 1).
- Produces (las llaman Tasks 3-5):
  - `void registrarTrabajo(Trabajo trabajo, TipoEvento tipo, String valorAnterior, String valorNuevo, ActorTipo actorTipo, User actor, String detalle)`
  - `void registrarMudanza(Mudanza mudanza, TipoEvento tipo, String valorAnterior, String valorNuevo, ActorTipo actorTipo, User actor, String detalle)`

- [ ] **Step 1: Escribir el test que falla**

`service/EventoServiceTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEvento;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEvento;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.MudanzaEventoRepository;
import com.aliados.backend.repository.TrabajoEventoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class EventoServiceTest {

    @Mock TrabajoEventoRepository trabajoEventoRepository;
    @Mock MudanzaEventoRepository mudanzaEventoRepository;

    @InjectMocks EventoService eventoService;

    @Test
    void registrarTrabajo_persisteTodosLosCampos() {
        Trabajo trabajo = new Trabajo();
        trabajo.setId(10L);
        User cliente = new User();
        cliente.setId(1L);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                "PENDIENTE", "CANCELADO", ActorTipo.CLIENTE, cliente, "me arrepentí");

        ArgumentCaptor<TrabajoEvento> captor = ArgumentCaptor.forClass(TrabajoEvento.class);
        verify(trabajoEventoRepository).save(captor.capture());
        TrabajoEvento e = captor.getValue();
        assertThat(e.getTrabajo()).isSameAs(trabajo);
        assertThat(e.getTipo()).isEqualTo(TipoEvento.CAMBIO_ESTADO);
        assertThat(e.getValorAnterior()).isEqualTo("PENDIENTE");
        assertThat(e.getValorNuevo()).isEqualTo("CANCELADO");
        assertThat(e.getActorTipo()).isEqualTo(ActorTipo.CLIENTE);
        assertThat(e.getActor()).isSameAs(cliente);
        assertThat(e.getDetalle()).isEqualTo("me arrepentí");
    }

    @Test
    void registrarTrabajo_sistemaVaSinActor() {
        Trabajo trabajo = new Trabajo();
        trabajo.setId(10L);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                "EN_COLA", "EN_CURSO", ActorTipo.SISTEMA, null, null);

        ArgumentCaptor<TrabajoEvento> captor = ArgumentCaptor.forClass(TrabajoEvento.class);
        verify(trabajoEventoRepository).save(captor.capture());
        assertThat(captor.getValue().getActor()).isNull();
        assertThat(captor.getValue().getActorTipo()).isEqualTo(ActorTipo.SISTEMA);
    }

    @Test
    void registrarMudanza_persisteTodosLosCampos() {
        Mudanza mudanza = new Mudanza();
        mudanza.setId(20L);
        User prov = new User();
        prov.setId(2L);

        eventoService.registrarMudanza(mudanza, TipoEvento.CAMBIO_ESTADO,
                "RESERVADO", "ACEPTADO", ActorTipo.PROVEEDOR, prov, null);

        ArgumentCaptor<MudanzaEvento> captor = ArgumentCaptor.forClass(MudanzaEvento.class);
        verify(mudanzaEventoRepository).save(captor.capture());
        MudanzaEvento e = captor.getValue();
        assertThat(e.getMudanza()).isSameAs(mudanza);
        assertThat(e.getValorAnterior()).isEqualTo("RESERVADO");
        assertThat(e.getValorNuevo()).isEqualTo("ACEPTADO");
        assertThat(e.getActorTipo()).isEqualTo(ActorTipo.PROVEEDOR);
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `./gradlew test --tests "com.aliados.backend.service.EventoServiceTest"`
Expected: FAIL de compilación — `EventoService` no existe.

- [ ] **Step 3: Implementación mínima**

`service/EventoService.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEvento;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEvento;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.MudanzaEventoRepository;
import com.aliados.backend.repository.TrabajoEventoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Registro del audit log de ciclo de vida. Deliberadamente tonto: no deduce el
 * estado anterior (leerlo de la entidad ya mutada sería un bug sutil) ni captura
 * excepciones (el evento es parte de la transición, no telemetría best-effort:
 * si el INSERT falla, la transición completa falla y Sentry lo reporta).
 *
 * Sin @Transactional propio: corre en la transacción del caller, así el evento
 * rollbackea junto con la transición que lo originó.
 */
@Service
public class EventoService {

    @Autowired
    private TrabajoEventoRepository trabajoEventoRepository;

    @Autowired
    private MudanzaEventoRepository mudanzaEventoRepository;

    public void registrarTrabajo(Trabajo trabajo, TipoEvento tipo, String valorAnterior,
                                 String valorNuevo, ActorTipo actorTipo, User actor, String detalle) {
        TrabajoEvento e = new TrabajoEvento();
        e.setTrabajo(trabajo);
        e.setTipo(tipo);
        e.setValorAnterior(valorAnterior);
        e.setValorNuevo(valorNuevo);
        e.setActorTipo(actorTipo);
        e.setActor(actor);
        e.setDetalle(detalle);
        trabajoEventoRepository.save(e);
    }

    public void registrarMudanza(Mudanza mudanza, TipoEvento tipo, String valorAnterior,
                                 String valorNuevo, ActorTipo actorTipo, User actor, String detalle) {
        MudanzaEvento e = new MudanzaEvento();
        e.setMudanza(mudanza);
        e.setTipo(tipo);
        e.setValorAnterior(valorAnterior);
        e.setValorNuevo(valorNuevo);
        e.setActorTipo(actorTipo);
        e.setActor(actor);
        e.setDetalle(detalle);
        mudanzaEventoRepository.save(e);
    }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `./gradlew test --tests "com.aliados.backend.service.EventoServiceTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/EventoService.java \
        backend/src/test/java/com/aliados/backend/service/EventoServiceTest.java
git commit -m "feat(backend): EventoService registra eventos de ciclo de vida"
```

---

### Task 3: Registro en TrabajoService — matching (crear, proponer, aceptar, rechazar propuesta)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (métodos `crearTrabajo`, `proponerTrabajo`, `aceptarPropuesta`, `rechazarPropuesta`; agregar dependencia)
- Modify (agregar `@Mock EventoService eventoService` a TODOS): `backend/src/test/java/com/aliados/backend/service/PresupuestoTrabajoTest.java`, `TrabajoChatDTOTest.java`, `ResponderPresupuestoTest.java`, `TrabajoOfertaGrupoTest.java`, `TrabajoEscalacionTest.java`, `TrabajoAutorizacionTest.java`
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoEventoRegistroTest.java` (nuevo)

**Interfaces:**
- Consumes: `EventoService.registrarTrabajo(...)` (Task 2), `TipoEvento`, `ActorTipo` (Task 1).
- Produces: nada nuevo hacia afuera; los 4 métodos emiten eventos como efecto.

- [ ] **Step 1: Agregar `@Mock EventoService eventoService` a los 6 test classes existentes**

En cada uno de los 6 archivos listados, junto a los otros `@Mock` (Mockito inyecta por tipo en `@InjectMocks TrabajoService`; sin el mock, los métodos que ahora llaman a `eventoService` tiran NPE):

```java
    @Mock EventoService eventoService;
```

(agregar el import `com.aliados.backend.service.EventoService` solo si el archivo está en otro paquete — los 6 están en `service`, así que no hace falta).

- [ ] **Step 2: Escribir el test nuevo que falla**

`service/TrabajoEventoRegistroTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.ConversacionRepository;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifica que cada transición de estado del flujo de matching registre su evento
 * con valor anterior/nuevo y actor correctos. El detalle de qué persiste el evento
 * lo cubre EventoServiceTest; acá solo importa QUE se llame y CON QUÉ.
 */
@ExtendWith(MockitoExtension.class)
class TrabajoEventoRegistroTest {

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
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;
    @Mock EventoService eventoService;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private Oficio oficio() {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        return of;
    }

    private Trabajo trabajo(long id, User cliente, TrabajoEstado estado) {
        Trabajo t = new Trabajo();
        t.setId(id); t.setCliente(cliente); t.setOficio(oficio()); t.setEstado(estado);
        return t;
    }

    @Test
    void crearTrabajo_registraCreacionConAnteriorNull() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(oficioRepository.findById(1L)).thenReturn(Optional.of(oficio()));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        CrearTrabajoDTO dto = new CrearTrabajoDTO();
        dto.setOficioId(1L);
        dto.setDescripcion("no anda la luz");
        dto.setDireccion("Mitre 100");
        // Coordenadas dentro de Rosario (RegionRosario.contiene debe dar true)
        dto.setLatitudCliente(-32.95);
        dto.setLongitudCliente(-60.65);

        trabajoService.crearTrabajo("cli", dto);

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                isNull(), eq("PENDIENTE"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void proponerTrabajo_registraSoloSiGanaElFlipAtomico() {
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PROPUESTO);
        t.setProveedor(prov);
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(10L, 2L)).thenReturn(Optional.of(oferta));
        when(trabajoRepository.tomarTrabajoSiPendiente(10L)).thenReturn(1); // ganó
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.proponerTrabajo(10L, "prov", 30, null, null, new BigDecimal("15000"));

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("PROPUESTO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
    }

    @Test
    void proponerTrabajo_perdedorDelFlipNoRegistraEvento() {
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PENDIENTE);
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(10L, 2L)).thenReturn(Optional.of(oferta));
        when(trabajoRepository.tomarTrabajoSiPendiente(10L)).thenReturn(0); // perdió

        assertThatThrownBy(() -> trabajoService.proponerTrabajo(10L, "prov", 30, null, null, null))
                .isInstanceOf(RuntimeException.class);

        verify(eventoService, never()).registrarTrabajo(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aceptarPropuesta_registraElEstadoResultante() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PROPUESTO);
        t.setProveedor(prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.countTrabajosActivosYCola(2L)).thenReturn(0);
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), any(Double.class))).thenReturn(3.0);
        when(trabajoRepository.findTrabajoEnCursoByProveedorId(2L)).thenReturn(null); // sin cola → EN_CURSO
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(anyLong(), any())).thenReturn(List.of());

        trabajoService.aceptarPropuesta(10L, "cli");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PROPUESTO"), eq("EN_CURSO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void rechazarPropuesta_registraVueltaAPendiente() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PROPUESTO);
        t.setProveedor(prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(10L, 2L)).thenReturn(Optional.empty());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.rechazarPropuesta(10L, "cli");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PROPUESTO"), eq("PENDIENTE"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }
}
```

Nota para el implementador: si algún stub no calza con el flujo real (p. ej. `rechazarPropuesta` necesita mocks extra), ajustar los `when(...)` mirando el método real — los `verify` del evento son lo no negociable. Si `RegionRosario.contiene(-32.95, -60.65)` diera false, buscar coordenadas válidas en los tests existentes de `crearTrabajo`.

- [ ] **Step 3: Correr y verificar que falla**

Run: `./gradlew test --tests "com.aliados.backend.service.TrabajoEventoRegistroTest"`
Expected: FAIL — `Wanted but not invoked: eventoService.registrarTrabajo(...)` en los 4 tests positivos.

- [ ] **Step 4: Implementar los 4 registros en `TrabajoService`**

4a. Agregar la dependencia junto a los otros `@Autowired` (después de `conversacionRepository`, ~línea 77):

```java
    @Autowired
    private EventoService eventoService;
```

4b. En `crearTrabajo`, después de `trabajo = trabajoRepository.save(trabajo);` (línea ~119) y antes de `ofrecerSiguienteGrupo(trabajo);`:

```java
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO, null,
                TrabajoEstado.PENDIENTE.name(), ActorTipo.CLIENTE, cliente, null);
```

4c. En `proponerTrabajo`, después de `trabajoRepository.save(trabajo);` (línea ~751, tras setear proveedor/tarifa) y antes de mutar la oferta:

```java
        // Después del flip atómico ganado: si dos proveedores compiten, solo el
        // ganador de tomarTrabajoSiPendiente llega acá y registra el evento.
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.PENDIENTE.name(), TrabajoEstado.PROPUESTO.name(),
                ActorTipo.PROVEEDOR, proveedor, null);
```

4d. En `aceptarPropuesta`, después de `trabajo = trabajoRepository.save(trabajo);` (línea ~803) y antes de `conversacionService.crearParaTrabajo(trabajo);`:

```java
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.PROPUESTO.name(), trabajo.getEstado().name(),
                ActorTipo.CLIENTE, cliente, null);
```

4e. En `rechazarPropuesta`, después del save del trabajo (tras `trabajo.setEstado(TrabajoEstado.PENDIENTE); trabajo.setProveedor(null); ...save...`):

```java
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.PROPUESTO.name(), TrabajoEstado.PENDIENTE.name(),
                ActorTipo.CLIENTE, cliente, null);
```

Imports nuevos en `TrabajoService`: `com.aliados.backend.entity.ActorTipo`, `com.aliados.backend.entity.TipoEvento` (mismo paquete `entity`, revisar si ya hay import con wildcard o agregar explícitos como el resto).

- [ ] **Step 5: Correr el test nuevo y toda la suite**

Run: `./gradlew test --tests "com.aliados.backend.service.TrabajoEventoRegistroTest"`
Expected: PASS (5 tests).

Run: `./gradlew test`
Expected: PASS — si algún test existente revienta con NPE en `eventoService`, le faltó el `@Mock` del Step 1.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/
git commit -m "feat(backend): eventos de ciclo de vida en el matching de trabajos"
```

---

### Task 4: Registro en TrabajoService — cierre (presupuesto, pago, completar, cancelar, escalación, cola)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (métodos `presupuestarTrabajo`, `responderPresupuesto`, `completarTrabajo`, `cerrarTrabajoCompletado`, `cancelarTrabajo`, `aplicarCancelacion`, `escalarUnTrabajo`)
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoEventoCierreTest.java` (nuevo)

**Interfaces:**
- Consumes: `EventoService.registrarTrabajo(...)` (Task 2).
- Produces: cambios de firma INTERNOS (privados, no rompen a nadie):
  - `private void cerrarTrabajoCompletado(Trabajo trabajo, User proveedor, ActorTipo actorTipo, User actor)`
  - `private void aplicarCancelacion(Trabajo trabajo, String motivo, ActorTipo actorTipo, User actor)`

- [ ] **Step 1: Escribir el test que falla**

`service/TrabajoEventoCierreTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Eventos del tramo de cierre. Lo central acá es el ACTOR: la misma transición
 * a COMPLETADO o CANCELADO la ejecutan personas distintas (o el sistema) según
 * el camino — exactamente la información que la tabla viene a capturar.
 */
@ExtendWith(MockitoExtension.class)
class TrabajoEventoCierreTest {

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
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;
    @Mock EventoService eventoService;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private Trabajo trabajo(long id, User cliente, User prov, TrabajoEstado estado) {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        Trabajo t = new Trabajo();
        t.setId(id); t.setCliente(cliente); t.setProveedor(prov); t.setOficio(of); t.setEstado(estado);
        return t;
    }

    @Test
    void presupuestar_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.EN_CURSO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.presupuestarTrabajo(10L, "prov", new BigDecimal("90000"), "cambio de térmica");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_CURSO"), eq("PRESUPUESTADO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
    }

    @Test
    void responderPresupuesto_emitePagoYCierreEnOrden() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.PRESUPUESTADO);
        t.setTarifaVisita(new BigDecimal("15000"));
        t.setMontoPresupuesto(new BigDecimal("90000"));
        t.setEstadoPago(EstadoPago.PENDIENTE_PAGO);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.responderPresupuesto(10L, "cli", true);

        InOrder orden = inOrder(eventoService);
        orden.verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO_PAGO),
                eq("PENDIENTE_PAGO"), eq("PAGADO"), eq(ActorTipo.CLIENTE), eq(cliente), any());
        orden.verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PRESUPUESTADO"), eq("COMPLETADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void completar_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.EN_CURSO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.completarTrabajo(10L, "prov");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_CURSO"), eq("COMPLETADO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
    }

    @Test
    void completar_promocionDeColaRegistraSistemaSinActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.EN_CURSO);
        User otroCliente = user(3L, "cli2", UserRole.CLIENT);
        Trabajo enCola = trabajo(11L, otroCliente, prov, TrabajoEstado.EN_COLA);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(2L)).thenReturn(List.of(enCola));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.completarTrabajo(10L, "prov");

        verify(eventoService).registrarTrabajo(eq(enCola), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_COLA"), eq("EN_CURSO"), eq(ActorTipo.SISTEMA), isNull(), any());
    }

    @Test
    void cancelarPorCliente_registraClienteYMotivo() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, null, TrabajoEstado.PENDIENTE);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.cancelarTrabajo(10L, "cli", "me arrepentí");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("CANCELADO"), eq(ActorTipo.CLIENTE), eq(cliente), eq("me arrepentí"));
    }

    @Test
    void cancelarPorEscalacion_registraSistemaSinActor() {
        // Escalación agotada: PENDIENTE, sin ofertas vivas, ventana vencida, sin
        // siguiente grupo → aplicarCancelacion con actor SISTEMA. Los stubs replican
        // el arranque de escalarUnTrabajo; ajustar mirando TrabajoEscalacionTest,
        // que ya testea este camino (sin el evento).
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, null, TrabajoEstado.PENDIENTE);
        t.setCreatedAt(java.time.LocalDateTime.now().minusHours(2));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(eq(10L), any())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.escalarUnTrabajo(10L, 15);

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("CANCELADO"), eq(ActorTipo.SISTEMA), isNull(),
                eq("No encontramos un profesional disponible"));
    }
}
```

Nota: el stub de `cancelarPorEscalacion` depende de `ofrecerSiguienteGrupo` (package-private): si necesita más mocks (p. ej. `userRepository.findProveedores...`), copiarlos de `TrabajoEscalacionTest` que ya ejercita este flujo.

- [ ] **Step 2: Correr y verificar que falla**

Run: `./gradlew test --tests "com.aliados.backend.service.TrabajoEventoCierreTest"`
Expected: FAIL — compila pero `Wanted but not invoked` (o error de compilación por las firmas nuevas aún inexistentes: también cuenta como rojo).

- [ ] **Step 3: Implementar**

3a. `presupuestarTrabajo` — después de `trabajo = trabajoRepository.save(trabajo);` (línea ~259):

```java
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.EN_CURSO.name(), TrabajoEstado.PRESUPUESTADO.name(),
                ActorTipo.PROVEEDOR, proveedor, null);
```

3b. `responderPresupuesto` — antes de `cerrarTrabajoCompletado(...)` (línea ~295), registrar el pago; y pasar el actor al cierre:

```java
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO_PAGO,
                EstadoPago.PENDIENTE_PAGO.name(), EstadoPago.PAGADO.name(),
                ActorTipo.CLIENTE, cliente,
                aceptar ? "Presupuesto aceptado" : "Presupuesto rechazado; se cobra solo la visita");

        cerrarTrabajoCompletado(trabajo, proveedor, ActorTipo.CLIENTE, cliente);
```

3c. `cerrarTrabajoCompletado` — nueva firma y dos registros (el del cierre con el actor del caller; el de la promoción de cola siempre SISTEMA):

```java
    /** Cierre compartido de un trabajo: pasa a COMPLETADO, promueve la cola o libera al
     *  proveedor. NO emite las notificaciones "completado" del trabajo actual (las pone
     *  el caller, porque el texto difiere entre completar y responder-presupuesto).
     *  El actor del cierre también lo pasa el caller (proveedor al completar, cliente
     *  al responder presupuesto); la promoción de cola es siempre SISTEMA. */
    private void cerrarTrabajoCompletado(Trabajo trabajo, User proveedor, ActorTipo actorTipo, User actor) {
        TrabajoEstado estadoAnterior = trabajo.getEstado(); // capturar ANTES de mutar
        trabajo.setEstado(TrabajoEstado.COMPLETADO);
        trabajo.setCompletedAt(LocalDateTime.now());
        trabajoRepository.save(trabajo);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                estadoAnterior.name(), TrabajoEstado.COMPLETADO.name(), actorTipo, actor, null);

        List<Trabajo> trabajosEnCola = trabajoRepository.findTrabajosEnCola(proveedor.getId());

        if (!trabajosEnCola.isEmpty()) {
            Trabajo siguiente = trabajosEnCola.get(0);
            siguiente.setEstado(TrabajoEstado.EN_CURSO);
            trabajoRepository.save(siguiente);

            eventoService.registrarTrabajo(siguiente, TipoEvento.CAMBIO_ESTADO,
                    TrabajoEstado.EN_COLA.name(), TrabajoEstado.EN_CURSO.name(),
                    ActorTipo.SISTEMA, null, "Promoción automática de cola");
            // ... (notificaciones existentes sin cambios)
```

(el resto del método queda igual; solo se insertan las dos llamadas y el parámetro nuevo).

3d. `completarTrabajo` — actualizar la llamada (línea ~216):

```java
        cerrarTrabajoCompletado(trabajo, proveedor, ActorTipo.PROVEEDOR, proveedor);
```

3e. `aplicarCancelacion` — nueva firma con actor y registro:

```java
    // Core de cancelación reusable (cliente y escalado automático). El actor viene
    // del caller: CLIENTE en cancelarTrabajo, SISTEMA (sin User) en escalarUnTrabajo.
    private void aplicarCancelacion(Trabajo trabajo, String motivo, ActorTipo actorTipo, User actor) {
        TrabajoEstado estadoAnterior = trabajo.getEstado(); // capturar ANTES de mutar
        trabajo.setEstado(TrabajoEstado.CANCELADO);
        trabajo.setMotivoCancelacion(motivo);
        trabajoRepository.save(trabajo);
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                estadoAnterior.name(), TrabajoEstado.CANCELADO.name(), actorTipo, actor, motivo);
        cloudinaryService.borrarFotos(trabajo.getFotos());
    }
```

3f. Actualizar los dos callers:

- `cancelarTrabajo` (línea ~712): `aplicarCancelacion(trabajo, motivo, ActorTipo.CLIENTE, cliente);`
- `escalarUnTrabajo` (línea ~953): `aplicarCancelacion(fresco, "No encontramos un profesional disponible", ActorTipo.SISTEMA, null);`

- [ ] **Step 4: Correr el test nuevo y toda la suite**

Run: `./gradlew test --tests "com.aliados.backend.service.TrabajoEventoCierreTest"`
Expected: PASS (6 tests).

Run: `./gradlew test`
Expected: PASS (los tests existentes de `ResponderPresupuestoTest` / `TrabajoEscalacionTest` siguen verdes: las firmas cambiadas son privadas y el mock de `EventoService` ya está desde Task 3).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoEventoCierreTest.java
git commit -m "feat(backend): eventos de ciclo de vida en el cierre de trabajos (actor incluido)"
```

---

### Task 5: Registro en MudanzaService (11 métodos)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/MudanzaService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/MudanzaEventoRegistroTest.java` (nuevo)
- Modify (si ejercita métodos mutadores): `backend/src/test/java/com/aliados/backend/service/MudanzaChatDTOTest.java` — agregar `@Mock EventoService eventoService` solo si aparece NPE

**Interfaces:**
- Consumes: `EventoService.registrarMudanza(...)` (Task 2).
- Produces: nada nuevo hacia afuera.

- [ ] **Step 1: Escribir el test que falla**

`service/MudanzaEventoRegistroTest.java` — misma mecánica que Tasks 3-4: `@ExtendWith(MockitoExtension.class)`, mocks de TODAS las dependencias `@Autowired` de `MudanzaService` (leerlas del archivo real: como mínimo `MudanzaRepository`, `UserRepository`, `NotificacionService`, más las que existan) + `@Mock EventoService eventoService` + `@InjectMocks MudanzaService mudanzaService`. Un test por método mutador. El patrón de cada test (repetir ajustando estados/actor):

```java
    @Test
    void reservar_registraClienteComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.PENDIENTE);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.reservarMudanza(20L, "cli");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("RESERVADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }
```

Tabla de verificaciones (una por test; `anterior` se lee del guard del método real — confirmar contra el código):

| Método | anterior → nuevo | ActorTipo | detalle |
|---|---|---|---|
| `crearMudanza` | `null` → `PENDIENTE` | CLIENTE | null |
| `reservarMudanza` | `PENDIENTE` → `RESERVADO` | CLIENTE | null |
| `aceptarMudanza` | `RESERVADO` → `ACEPTADO` | PROVEEDOR | null |
| `contraproponer` | `RESERVADO` → `CONTRAPROPUESTO` | PROVEEDOR | null |
| `aceptarContrapropuesta` | `CONTRAPROPUESTO` → `ACEPTADO` | CLIENTE | null |
| `rechazarContrapropuesta` | `CONTRAPROPUESTO` → `CANCELADO` | CLIENTE | `"Contrapropuesta rechazada"` |
| `iniciarMudanza` | `ACEPTADO` → `EN_CURSO` | PROVEEDOR | null |
| `finalizarMudanza` (sin extra) | `EN_CURSO` → `FINALIZADO` | PROVEEDOR | null |
| `finalizarMudanza` (con extra) | `EN_CURSO` → `PENDIENTE_PAGO_EXTRA` | PROVEEDOR | null |
| `pagarExtra` | `PENDIENTE_PAGO_EXTRA` → `FINALIZADO` | CLIENTE | null |
| `completarMudanza` | `FINALIZADO` → `COMPLETADO` | CLIENTE | null |
| `cancelarMudanza` | (estado vigente) → `CANCELADO` | CLIENTE | el motivo recibido |

Los builders `user(...)`/`mudanza(...)` y los stubs concretos de cada método se arman leyendo `MudanzaService.java` (los guards indican el estado de partida; los mocks necesarios, las dependencias que el método toca). Los `verify` de la tabla son lo no negociable.

- [ ] **Step 2: Correr y verificar que falla**

Run: `./gradlew test --tests "com.aliados.backend.service.MudanzaEventoRegistroTest"`
Expected: FAIL — `Wanted but not invoked` en los 12 tests.

- [ ] **Step 3: Implementar los registros en `MudanzaService`**

3a. Dependencia junto a los otros `@Autowired`:

```java
    @Autowired
    private EventoService eventoService;
```

3b. En CADA método mutador, con este patrón uniforme — capturar el anterior ANTES del `setEstado`, registrar DESPUÉS del `save`:

```java
        MudanzaEstado estadoAnterior = mudanza.getEstado(); // antes de mutar
        mudanza.setEstado(MudanzaEstado.RESERVADO);
        // ... (resto del método igual, hasta después del save) ...
        eventoService.registrarMudanza(mudanza, TipoEvento.CAMBIO_ESTADO,
                estadoAnterior.name(), MudanzaEstado.RESERVADO.name(),
                ActorTipo.CLIENTE, cliente, null);
```

Casos particulares:
- `crearMudanza`: `valorAnterior = null`, registrar después del primer `save` (necesita ID).
- `finalizarMudanza`: registrar UNA vez después del if/else, con `mudanza.getEstado().name()` como valor nuevo (cubre las dos salidas).
- `cancelarMudanza`: `detalle = motivo`.
- `rechazarContrapropuesta`: `detalle = "Contrapropuesta rechazada"`.
- El `User` actor es el que el método ya resolvió (cliente o proveedor según la columna ActorTipo de la tabla del Step 1).

- [ ] **Step 4: Correr el test nuevo y toda la suite**

Run: `./gradlew test --tests "com.aliados.backend.service.MudanzaEventoRegistroTest"`
Expected: PASS (12 tests).

Run: `./gradlew test`
Expected: PASS. Si `MudanzaChatDTOTest` da NPE en `eventoService`, agregarle `@Mock EventoService eventoService`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/MudanzaService.java \
        backend/src/test/java/com/aliados/backend/service/MudanzaEventoRegistroTest.java \
        backend/src/test/java/com/aliados/backend/service/MudanzaChatDTOTest.java
git commit -m "feat(backend): eventos de ciclo de vida en mudanzas"
```

---

### Task 6: Lectura — DTO, EventoService.eventosDe*, EventoAdminController

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/EventoResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/EventoService.java`
- Create: `backend/src/main/java/com/aliados/backend/controller/EventoAdminController.java`
- Test: `backend/src/test/java/com/aliados/backend/controller/EventoAdminControllerTest.java`
- Test (ampliar): `backend/src/test/java/com/aliados/backend/service/EventoServiceTest.java`

**Interfaces:**
- Consumes: repos de Task 1; `TrabajoRepository.existsById`, `MudanzaRepository.existsById` (heredados de `JpaRepository`).
- Produces:
  - `List<EventoResponseDTO> EventoService.eventosDeTrabajo(Long trabajoId)` — lanza `NotFoundException` si el trabajo no existe
  - `List<EventoResponseDTO> EventoService.eventosDeMudanza(Long mudanzaId)` — ídem
  - `GET /api/admin/trabajos/{id}/eventos`, `GET /api/admin/mudanzas/{id}/eventos`

- [ ] **Step 1: Escribir los tests que fallan**

1a. Agregar a `EventoServiceTest.java` (necesita dos mocks nuevos: `@Mock TrabajoRepository trabajoRepository; @Mock MudanzaRepository mudanzaRepository;` + imports de repos, `NotFoundException`, `EventoResponseDTO`, `List`, `assertThatThrownBy`):

```java
    @Test
    void eventosDeTrabajo_mapeaADtoConNombreDeActor() {
        User cliente = new User();
        cliente.setId(1L); cliente.setNombre("Ana");
        Trabajo trabajo = new Trabajo(); trabajo.setId(10L);
        TrabajoEvento e = new TrabajoEvento();
        e.setId(100L); e.setTrabajo(trabajo); e.setTipo(TipoEvento.CAMBIO_ESTADO);
        e.setValorAnterior("PENDIENTE"); e.setValorNuevo("CANCELADO");
        e.setActorTipo(ActorTipo.CLIENTE); e.setActor(cliente); e.setDetalle("me arrepentí");
        when(trabajoRepository.existsById(10L)).thenReturn(true);
        when(trabajoEventoRepository.findByTrabajoIdOrderByIdAsc(10L)).thenReturn(java.util.List.of(e));

        var dtos = eventoService.eventosDeTrabajo(10L);

        assertThat(dtos).hasSize(1);
        assertThat(dtos.get(0).getActorNombre()).isEqualTo("Ana");
        assertThat(dtos.get(0).getValorNuevo()).isEqualTo("CANCELADO");
    }

    @Test
    void eventosDeTrabajo_actorSistemaVaSinNombre() {
        Trabajo trabajo = new Trabajo(); trabajo.setId(10L);
        TrabajoEvento e = new TrabajoEvento();
        e.setId(100L); e.setTrabajo(trabajo); e.setTipo(TipoEvento.CAMBIO_ESTADO);
        e.setValorAnterior("EN_COLA"); e.setValorNuevo("EN_CURSO");
        e.setActorTipo(ActorTipo.SISTEMA); e.setActor(null);
        when(trabajoRepository.existsById(10L)).thenReturn(true);
        when(trabajoEventoRepository.findByTrabajoIdOrderByIdAsc(10L)).thenReturn(java.util.List.of(e));

        var dtos = eventoService.eventosDeTrabajo(10L);

        assertThat(dtos.get(0).getActorNombre()).isNull();
    }

    @Test
    void eventosDeTrabajo_inexistenteLanza404() {
        when(trabajoRepository.existsById(99L)).thenReturn(false);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> eventoService.eventosDeTrabajo(99L))
                .isInstanceOf(com.aliados.backend.exception.NotFoundException.class);
    }
```

(y los espejos `eventosDeMudanza_*` con `mudanzaRepository`/`mudanzaEventoRepository`).

1b. `controller/EventoAdminControllerTest.java` — MockMvc standalone como `ChatControllerTest` (con `GlobalExceptionHandler` para que `NotFoundException` → 404):

```java
package com.aliados.backend.controller;

import com.aliados.backend.config.GlobalExceptionHandler;
import com.aliados.backend.dto.EventoResponseDTO;
import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.service.EventoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class EventoAdminControllerTest {

    @Mock EventoService eventoService;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new EventoAdminController(eventoService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private EventoResponseDTO dto() {
        EventoResponseDTO d = new EventoResponseDTO();
        d.setId(100L);
        d.setTipo(TipoEvento.CAMBIO_ESTADO);
        d.setValorAnterior("PENDIENTE");
        d.setValorNuevo("CANCELADO");
        d.setActorTipo(ActorTipo.CLIENTE);
        d.setActorNombre("Ana");
        d.setDetalle("me arrepentí");
        return d;
    }

    @Test
    void timelineDeTrabajo_devuelve200ConEventos() throws Exception {
        when(eventoService.eventosDeTrabajo(10L)).thenReturn(List.of(dto()));

        mockMvc.perform(get("/api/admin/trabajos/10/eventos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].valorNuevo").value("CANCELADO"))
                .andExpect(jsonPath("$[0].actorNombre").value("Ana"));
    }

    @Test
    void trabajoInexistente_devuelve404() throws Exception {
        when(eventoService.eventosDeTrabajo(99L)).thenThrow(new NotFoundException("Trabajo no encontrado"));

        mockMvc.perform(get("/api/admin/trabajos/99/eventos"))
                .andExpect(status().isNotFound());
    }

    @Test
    void timelineDeMudanza_devuelve200() throws Exception {
        when(eventoService.eventosDeMudanza(20L)).thenReturn(List.of(dto()));

        mockMvc.perform(get("/api/admin/mudanzas/20/eventos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(100));
    }
}
```

Nota: el test construye el controller por constructor → el controller usa inyección por constructor (excepción aceptable al patrón `@Autowired` de campo: lo hace testeable standalone). La seguridad (`403` sin rol ADMIN) NO se testea acá: la impone `SecurityConfig` sobre `/api/admin/**` y ya está cubierta a ese nivel.

- [ ] **Step 2: Correr y verificar que falla**

Run: `./gradlew test --tests "com.aliados.backend.service.EventoServiceTest" --tests "com.aliados.backend.controller.EventoAdminControllerTest"`
Expected: FAIL de compilación — `EventoResponseDTO`, `eventosDeTrabajo`, `EventoAdminController` no existen.

- [ ] **Step 3: Implementar**

3a. `dto/EventoResponseDTO.java`:

```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.TipoEvento;
import lombok.Data;

import java.time.LocalDateTime;

/** Un evento del timeline admin. actorNombre y nunca email/uid: sin PII de más. */
@Data
public class EventoResponseDTO {
    private Long id;
    private TipoEvento tipo;
    private String valorAnterior;
    private String valorNuevo;
    private ActorTipo actorTipo;
    private String actorNombre; // null cuando actorTipo = SISTEMA
    private String detalle;
    private LocalDateTime createdAt;
}
```

3b. Agregar a `EventoService` (repos padre + lecturas):

```java
    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private MudanzaRepository mudanzaRepository;

    // readOnly: mantiene la sesión abierta para resolver actor LAZY durante el mapeo.
    @Transactional(readOnly = true)
    public List<EventoResponseDTO> eventosDeTrabajo(Long trabajoId) {
        if (!trabajoRepository.existsById(trabajoId)) {
            throw new NotFoundException("Trabajo no encontrado");
        }
        return trabajoEventoRepository.findByTrabajoIdOrderByIdAsc(trabajoId).stream()
                .map(e -> mapToDTO(e.getId(), e.getTipo(), e.getValorAnterior(), e.getValorNuevo(),
                        e.getActorTipo(), e.getActor(), e.getDetalle(), e.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<EventoResponseDTO> eventosDeMudanza(Long mudanzaId) {
        if (!mudanzaRepository.existsById(mudanzaId)) {
            throw new NotFoundException("Mudanza no encontrada");
        }
        return mudanzaEventoRepository.findByMudanzaIdOrderByIdAsc(mudanzaId).stream()
                .map(e -> mapToDTO(e.getId(), e.getTipo(), e.getValorAnterior(), e.getValorNuevo(),
                        e.getActorTipo(), e.getActor(), e.getDetalle(), e.getCreatedAt()))
                .toList();
    }

    private EventoResponseDTO mapToDTO(Long id, TipoEvento tipo, String valorAnterior, String valorNuevo,
                                       ActorTipo actorTipo, User actor, String detalle, LocalDateTime createdAt) {
        EventoResponseDTO dto = new EventoResponseDTO();
        dto.setId(id);
        dto.setTipo(tipo);
        dto.setValorAnterior(valorAnterior);
        dto.setValorNuevo(valorNuevo);
        dto.setActorTipo(actorTipo);
        dto.setActorNombre(actor != null ? actor.getNombre() : null);
        dto.setDetalle(detalle);
        dto.setCreatedAt(createdAt);
        return dto;
    }
```

Imports nuevos: `EventoResponseDTO`, `NotFoundException`, `TrabajoRepository`, `MudanzaRepository`, `Transactional` (spring), `List`, `LocalDateTime`.

3c. `controller/EventoAdminController.java`:

```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.EventoResponseDTO;
import com.aliados.backend.service.EventoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Timeline de eventos de ciclo de vida, solo lectura. La protección la impone
 * SecurityConfig (/api/admin/** → hasRole ADMIN); acá no hay checks propios.
 * Sin paginación a propósito: una entidad genera ~5-15 eventos en toda su vida.
 */
@RestController
@RequestMapping("/api/admin")
public class EventoAdminController {

    private final EventoService eventoService;

    public EventoAdminController(EventoService eventoService) {
        this.eventoService = eventoService;
    }

    @GetMapping("/trabajos/{id}/eventos")
    public ResponseEntity<List<EventoResponseDTO>> eventosDeTrabajo(@PathVariable Long id) {
        return ResponseEntity.ok(eventoService.eventosDeTrabajo(id));
    }

    @GetMapping("/mudanzas/{id}/eventos")
    public ResponseEntity<List<EventoResponseDTO>> eventosDeMudanza(@PathVariable Long id) {
        return ResponseEntity.ok(eventoService.eventosDeMudanza(id));
    }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `./gradlew test --tests "com.aliados.backend.service.EventoServiceTest" --tests "com.aliados.backend.controller.EventoAdminControllerTest"`
Expected: PASS.

- [ ] **Step 5: Verificación integral final**

Run: `./gradlew test`
Expected: PASS (toda la suite unitaria).

Run: `./gradlew integrationTest`
Expected: PASS (`SchemaMigrationIT` valida V12 + entidades contra Postgres real; requiere Docker).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/dto/EventoResponseDTO.java \
        backend/src/main/java/com/aliados/backend/service/EventoService.java \
        backend/src/main/java/com/aliados/backend/controller/EventoAdminController.java \
        backend/src/test/java/com/aliados/backend/service/EventoServiceTest.java \
        backend/src/test/java/com/aliados/backend/controller/EventoAdminControllerTest.java
git commit -m "feat(backend): endpoint admin del timeline de eventos de trabajos y mudanzas"
```
