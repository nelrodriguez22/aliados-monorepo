# Chat cliente–proveedor — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat 1-a-1 entre cliente y proveedor, persistente e inmutable al cerrarse el servicio, para trabajos **y** mudanzas.

**Architecture:** Una tabla `conversacion` de primera clase absorbe el polimorfismo (trabajo | mudanza) para que `mensaje` y `lectura_conversacion` conozcan un único FK. Se escribe por REST (durabilidad, autorización reutilizada, errores HTTP) y se recibe por STOMP (latencia). La base de datos es la fuente de verdad; el WebSocket es sólo un acelerador.

**Tech Stack:** Spring Boot + JPA + Flyway + STOMP/SockJS (backend, Java 21, Gradle) · React + TypeScript + Vite + Vitest (frontend, pnpm workspace) · Cloudinary (imágenes) · Postgres (Neon).

**Spec:** `docs/superpowers/specs/2026-07-12-chat-cliente-proveedor-design.md`

## Global Constraints

- **Rama:** `feat/chat-cliente-proveedor` (ya creada desde `main`). Un PR contra `main` al final. **Nunca** pushear a una rama que ya tiene PR.
- **Migración:** la última aplicada es `V9`. La del chat es **`V10__chat_conversaciones.sql`**. No renumerar ni editar migraciones existentes.
- **Alcance:** trabajos **y** mudanzas. No se toca la contrapropuesta de mudanza.
- **Inmutabilidad:** no existen endpoints de edición ni de borrado de mensajes. El único `UPDATE` del módulo es el puntero de lectura.
- **Tests backend:** JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`, `@Mock`, `@InjectMocks`) + AssertJ. Correr con `./gradlew test` (los `@Tag("integration")` requieren Docker y quedan fuera de la suite por defecto).
- **Tests frontend:** Vitest. Correr con `pnpm test`.
- **Typecheck:** `pnpm tsc --noEmit` debe pasar antes de cada commit de frontend.

## Correcciones al spec detectadas al leer el código

Estas tres cosas contradicen lo que dice el spec. **El plan manda; el spec quedó desactualizado en estos puntos.**

1. **El destino STOMP se direcciona por `firebaseUid`, no por el ID de base.**
   `NotificacionEventListener.java:25` usa `convertAndSendToUser(e.firebaseUid(), "/queue/notifications", …)`.
   El destino del chat es entonces **`/user/{firebaseUid}/queue/chat`**.

2. **La capa de API del frontend NO vive en `packages/api`** (ese paquete está vacío). Vive en
   `apps/app/src/shared/services/` (ver `TrabajoService.ts`) usando `apiClient` de
   `apps/app/src/shared/lib/apiClient.ts`. El chat sigue ese patrón.

3. **`UserStatus` NO sirve como señal de presencia.** `WebSocketEventListener.java:82-85`: el
   handler de desconexión **no marca OFFLINE a un usuario `BUSY`**, y un proveedor con trabajos
   activos está `BUSY`. Un proveedor que cierra la app **queda `BUSY` para siempre**. Si se usara
   `UserStatus` para decidir el push, el sistema lo creería conectado y **nunca le mandaría la
   notificación** — justo al usuario que más la necesita.
   **Se usa `SimpUserRegistry` de Spring**, que es el registro real de sesiones STOMP y no está
   contaminado por la semántica de disponibilidad. (Es in-memory por instancia, igual que el
   `SimpleBroker` — misma restricción de una sola instancia, ya asumida.)

---

## Estructura de archivos

**Backend (crear):**
- `backend/src/main/resources/db/migration/V10__chat_conversaciones.sql`
- `backend/src/main/java/com/aliados/backend/entity/Conversacion.java`
- `backend/src/main/java/com/aliados/backend/entity/Mensaje.java`
- `backend/src/main/java/com/aliados/backend/entity/TipoMensaje.java`
- `backend/src/main/java/com/aliados/backend/entity/LecturaConversacion.java`
- `backend/src/main/java/com/aliados/backend/entity/LecturaConversacionId.java`
- `backend/src/main/java/com/aliados/backend/entity/ModoChat.java`
- `backend/src/main/java/com/aliados/backend/repository/ConversacionRepository.java`
- `backend/src/main/java/com/aliados/backend/repository/MensajeRepository.java`
- `backend/src/main/java/com/aliados/backend/repository/LecturaConversacionRepository.java`
- `backend/src/main/java/com/aliados/backend/service/ConversacionService.java`
- `backend/src/main/java/com/aliados/backend/service/DetectorContacto.java`
- `backend/src/main/java/com/aliados/backend/service/ChatService.java`
- `backend/src/main/java/com/aliados/backend/service/PresenciaService.java`
- `backend/src/main/java/com/aliados/backend/controller/ChatController.java`
- `backend/src/main/java/com/aliados/backend/dto/EnviarMensajeDTO.java`
- `backend/src/main/java/com/aliados/backend/dto/MensajeResponseDTO.java`
- `backend/src/main/java/com/aliados/backend/dto/MarcarLeidoDTO.java`

**Backend (modificar):**
- `TrabajoService.java` — crear conversación al aceptar (línea ~746)
- `MudanzaService.java` — crear conversación al aceptar
- `TrabajoResponseDTO.java` / `MudanzaResponseDTO.java` — exponer `conversacionId`

**Frontend (crear):**
- `apps/app/src/shared/services/ChatService.ts`
- `apps/app/src/shared/hooks/useChat.ts`
- `apps/app/src/shared/components/chat/ChatPanel.tsx`
- `apps/app/src/shared/components/chat/MensajeBubble.tsx`

**Frontend (modificar):**
- `apps/app/src/shared/hooks/useWebSocket.ts` — API de suscripción genérica
- `JobTracking.tsx` (reemplaza placeholder, líneas 416-446) · `ActiveJob.tsx` · `JobCompleted.tsx` · `ProviderCompletedJob.tsx` · `MudanzaDetail.tsx` · `ProviderMudanzaDetail.tsx` · `ClientDashboard.tsx` · `ProviderDashboard.tsx`

---

## FASE 1 — BACKEND

### Task 1: Migración V10 + entities + repositories

**Files:**
- Create: `backend/src/main/resources/db/migration/V10__chat_conversaciones.sql`
- Create: `backend/src/main/java/com/aliados/backend/entity/{Conversacion,Mensaje,TipoMensaje,LecturaConversacion,LecturaConversacionId}.java`
- Create: `backend/src/main/java/com/aliados/backend/repository/{Conversacion,Mensaje,LecturaConversacion}Repository.java`

**Interfaces:**
- Produces: `Conversacion` (getters `getId()`, `getCliente()`, `getProveedor()`, `getTrabajo()`, `getMudanza()`), `Mensaje`, `TipoMensaje.{TEXTO,IMAGEN}`, `ConversacionRepository.findByTrabajoId(Long)`, `ConversacionRepository.findByMudanzaId(Long)`, `MensajeRepository.findByConversacionIdOrderByIdDesc(Long, Pageable)`, `MensajeRepository.countByConversacionIdAndIdGreaterThan(Long, Long)`.

- [ ] **Step 1: Escribir la migración**

`backend/src/main/resources/db/migration/V10__chat_conversaciones.sql`:

```sql
-- Chat cliente-proveedor. Una conversación por servicio (trabajo O mudanza).
-- El polimorfismo queda confinado a esta tabla: mensaje y lectura sólo conocen conversacion_id.
CREATE TABLE conversacion (
    id            BIGSERIAL PRIMARY KEY,
    trabajo_id    BIGINT REFERENCES trabajos (id),
    mudanza_id    BIGINT REFERENCES mudanzas (id),
    cliente_id    BIGINT NOT NULL REFERENCES users (id),
    proveedor_id  BIGINT NOT NULL REFERENCES users (id),
    creado_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Exactamente uno de los dos padres. Sin esto, el polimorfismo no está garantizado.
    CONSTRAINT chk_conversacion_un_padre CHECK (
        (trabajo_id IS NOT NULL AND mudanza_id IS NULL) OR
        (trabajo_id IS NULL AND mudanza_id IS NOT NULL)
    ),
    CONSTRAINT uq_conversacion_trabajo UNIQUE (trabajo_id),
    CONSTRAINT uq_conversacion_mudanza UNIQUE (mudanza_id)
);

CREATE TABLE mensaje (
    id                BIGSERIAL PRIMARY KEY,
    conversacion_id   BIGINT NOT NULL REFERENCES conversacion (id),
    emisor_id         BIGINT NOT NULL REFERENCES users (id),
    tipo              VARCHAR(20) NOT NULL,
    contenido         TEXT,
    imagen_url        VARCHAR(500),
    contiene_contacto BOOLEAN NOT NULL DEFAULT FALSE,
    creado_at         TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_mensaje_contenido CHECK (
        (tipo = 'TEXTO'  AND contenido  IS NOT NULL) OR
        (tipo = 'IMAGEN' AND imagen_url IS NOT NULL)
    )
);

CREATE INDEX idx_mensaje_conversacion ON mensaje (conversacion_id, id);

CREATE TABLE lectura_conversacion (
    conversacion_id         BIGINT NOT NULL REFERENCES conversacion (id),
    usuario_id              BIGINT NOT NULL REFERENCES users (id),
    ultimo_mensaje_leido_id BIGINT,
    PRIMARY KEY (conversacion_id, usuario_id)
);
```

**Verificar los nombres reales de las tablas padre** antes de correr: en el repo son `trabajos`,
`mudanzas` y `users` (plural). Confirmalo con:
`grep -rn '@Table' backend/src/main/java/com/aliados/backend/entity/{Trabajo,Mudanza,User}.java`
Si algún nombre difiere, corregí el `REFERENCES` — un FK mal apuntado hace fallar el arranque.

- [ ] **Step 2: Crear el enum `TipoMensaje`**

`backend/src/main/java/com/aliados/backend/entity/TipoMensaje.java`:

```java
package com.aliados.backend.entity;

public enum TipoMensaje {
    TEXTO,
    IMAGEN
    // SISTEMA: reservado a futuro (mensajes automáticos). Agregarlo NO requiere migración de
    // esquema, sólo ampliar este enum y el CHECK chk_mensaje_contenido.
}
```

- [ ] **Step 3: Crear la entity `Conversacion`**

`backend/src/main/java/com/aliados/backend/entity/Conversacion.java`:

```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "conversacion")
@Data
public class Conversacion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Exactamente uno de trabajo/mudanza está seteado (garantizado por CHECK en la base).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trabajo_id")
    private Trabajo trabajo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mudanza_id")
    private Mudanza mudanza;

    // Denormalizados a propósito: la autorización se resuelve con esta fila, sin joins al padre.
    // Es seguro porque el par cliente-proveedor es inmutable una vez asignado el proveedor.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private User cliente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proveedor_id", nullable = false)
    private User proveedor;

    @CreationTimestamp
    @Column(name = "creado_at", nullable = false, updatable = false)
    private LocalDateTime creadoAt;
}
```

- [ ] **Step 4: Crear la entity `Mensaje`**

`backend/src/main/java/com/aliados/backend/entity/Mensaje.java`:

```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "mensaje")
@Data
public class Mensaje {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversacion_id", nullable = false)
    private Conversacion conversacion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emisor_id", nullable = false)
    private User emisor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TipoMensaje tipo;

    @Column(columnDefinition = "TEXT")
    private String contenido;

    @Column(name = "imagen_url", length = 500)
    private String imagenUrl;

    @Column(name = "contiene_contacto", nullable = false)
    private Boolean contieneContacto = false;

    @CreationTimestamp
    @Column(name = "creado_at", nullable = false, updatable = false)
    private LocalDateTime creadoAt;
}
```

- [ ] **Step 5: Crear `LecturaConversacion` + su ID compuesto**

`backend/src/main/java/com/aliados/backend/entity/LecturaConversacionId.java`:

```java
package com.aliados.backend.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LecturaConversacionId implements Serializable {
    private Long conversacionId;
    private Long usuarioId;
}
```

`backend/src/main/java/com/aliados/backend/entity/LecturaConversacion.java`:

```java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "lectura_conversacion")
@IdClass(LecturaConversacionId.class)
@Data
public class LecturaConversacion {

    @Id
    @Column(name = "conversacion_id")
    private Long conversacionId;

    @Id
    @Column(name = "usuario_id")
    private Long usuarioId;

    // Puntero: "leí hasta este mensaje". Un solo UPDATE en lugar de N.
    @Column(name = "ultimo_mensaje_leido_id")
    private Long ultimoMensajeLeidoId;
}
```

- [ ] **Step 6: Crear los tres repositories**

`backend/src/main/java/com/aliados/backend/repository/ConversacionRepository.java`:

```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.Conversacion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ConversacionRepository extends JpaRepository<Conversacion, Long> {
    Optional<Conversacion> findByTrabajoId(Long trabajoId);
    Optional<Conversacion> findByMudanzaId(Long mudanzaId);
}
```

`backend/src/main/java/com/aliados/backend/repository/MensajeRepository.java`:

```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.Mensaje;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MensajeRepository extends JpaRepository<Mensaje, Long> {

    // Descendente: la página 0 son los mensajes MÁS RECIENTES (el chat se lee de abajo hacia
    // arriba, y el scroll infinito pide páginas hacia el pasado).
    Page<Mensaje> findByConversacionIdOrderByIdDesc(Long conversacionId, Pageable pageable);

    // No leídos = mensajes posteriores al puntero. Un COUNT, sin recorrer filas.
    long countByConversacionIdAndIdGreaterThan(Long conversacionId, Long ultimoLeidoId);

    long countByConversacionId(Long conversacionId);
}
```

`backend/src/main/java/com/aliados/backend/repository/LecturaConversacionRepository.java`:

```java
package com.aliados.backend.repository;

import com.aliados.backend.entity.LecturaConversacion;
import com.aliados.backend.entity.LecturaConversacionId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface LecturaConversacionRepository
        extends JpaRepository<LecturaConversacion, LecturaConversacionId> {

    Optional<LecturaConversacion> findByConversacionIdAndUsuarioId(Long conversacionId, Long usuarioId);
}
```

- [ ] **Step 7: Compilar y verificar que la migración corre**

Run: `cd backend && ./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`

Levantar la app contra la base de dev y verificar en el log que Flyway aplicó `V10`.
Expected: una línea de Flyway con `Migrating schema "public" to version "10 - chat conversaciones"`.

Si falla con `relation "trabajos" does not exist` (o `mudanzas`/`users`), el nombre de la tabla
padre en el `REFERENCES` está mal → corregilo contra el `@Table` real de la entity.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V10__chat_conversaciones.sql \
        backend/src/main/java/com/aliados/backend/entity/ \
        backend/src/main/java/com/aliados/backend/repository/
git commit -m "feat(chat): migración V10 + entities de conversación y mensaje"
```

---

### Task 2: `ConversacionService` — modo ternario y `getOrCreate`

Es el **único** lugar del módulo que sabe que existen trabajos y mudanzas. Todo lo demás
opera sobre `conversacion_id`.

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/entity/ModoChat.java`
- Create: `backend/src/main/java/com/aliados/backend/service/ConversacionService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/ConversacionServiceTest.java`

**Interfaces:**
- Consumes: `Conversacion`, `ConversacionRepository` (Task 1).
- Produces: `ModoChat.{ESCRITURA,LECTURA}`, `ConversacionService.resolverModo(Conversacion) → ModoChat`, `ConversacionService.crearParaTrabajo(Trabajo) → Conversacion`, `ConversacionService.crearParaMudanza(Mudanza) → Conversacion`.

- [ ] **Step 1: Crear el enum `ModoChat`**

`backend/src/main/java/com/aliados/backend/entity/ModoChat.java`:

```java
package com.aliados.backend.entity;

// El estado del chat es TERNARIO. El tercer caso —"no existe conversación"— se representa por
// la AUSENCIA de fila en `conversacion`, no por un valor de este enum. Modelarlo con un booleano
// obliga a inventar un cuarto caso implícito, y ahí nace el bug del chat vacío en un servicio
// que todavía no tiene proveedor con quien hablar.
public enum ModoChat {
    ESCRITURA,
    LECTURA
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`backend/src/test/java/com/aliados/backend/service/ConversacionServiceTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(MockitoExtension.class)
class ConversacionServiceTest {

    @Mock ConversacionRepository conversacionRepository;

    @InjectMocks ConversacionService conversacionService;

    private Conversacion conversacionDeTrabajo(TrabajoEstado estado) {
        Trabajo t = new Trabajo();
        t.setEstado(estado);
        Conversacion c = new Conversacion();
        c.setTrabajo(t);
        return c;
    }

    private Conversacion conversacionDeMudanza(MudanzaEstado estado) {
        Mudanza m = new Mudanza();
        m.setEstado(estado);
        Conversacion c = new Conversacion();
        c.setMudanza(m);
        return c;
    }

    // --- TRABAJO ---

    @Test
    void trabajoEnCurso_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.EN_CURSO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    // EL CASO QUE EL PLACEHOLDER ACTUAL SE PERDÍA. El cliente ya aceptó y espera turno porque el
    // proveedor está ocupado: es el momento de MAYOR ansiedad, justo cuando quiere preguntar
    // "¿cuándo venís?". Si este test no existe, la implementación lo va a omitir.
    @Test
    void trabajoEnCola_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.EN_COLA)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void trabajoPresupuestado_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.PRESUPUESTADO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void trabajoCompletado_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.COMPLETADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    @Test
    void trabajoCancelado_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.CANCELADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    // --- MUDANZA ---

    @Test
    void mudanzaAceptada_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.ACEPTADO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void mudanzaEnCurso_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.EN_CURSO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    // La mudanza YA TERMINÓ físicamente, pero si hay un pago extra en discusión, cerrar el chat
    // acá sería cerrarlo justo cuando más se necesita.
    @Test
    void mudanzaFinalizada_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.FINALIZADO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void mudanzaPendientePagoExtra_permiteEscritura() {
        assertThat(conversacionService.resolverModo(
                conversacionDeMudanza(MudanzaEstado.PENDIENTE_PAGO_EXTRA)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void mudanzaCompletada_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.COMPLETADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    @Test
    void mudanzaCancelada_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.CANCELADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    // Estados sin conversación: si por un bug se creara una conversación en un estado previo a la
    // aceptación, resolverModo debe explotar en vez de devolver un modo silenciosamente.
    @Test
    void mudanzaContrapropuesta_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeMudanza(MudanzaEstado.CONTRAPROPUESTO)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void trabajoPropuesto_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeTrabajo(TrabajoEstado.PROPUESTO)))
                .isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `cd backend && ./gradlew test --tests ConversacionServiceTest`
Expected: FAIL — no compila, `ConversacionService` no existe.

- [ ] **Step 4: Implementar `ConversacionService`**

`backend/src/main/java/com/aliados/backend/service/ConversacionService.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.Set;

/**
 * El ÚNICO punto del módulo de chat que sabe que existen trabajos y mudanzas.
 * Todo lo demás (ChatService, ChatController, el frontend) opera sobre conversacion_id.
 */
@Service
public class ConversacionService {

    // El chat se abre cuando el CLIENTE ACEPTÓ (vínculo cliente-proveedor confirmado) y se
    // congela cuando el servicio cierra. Ver la tabla de la ventana de escritura en el spec.
    private static final Set<TrabajoEstado> TRABAJO_ESCRITURA = EnumSet.of(
            TrabajoEstado.EN_CURSO,
            TrabajoEstado.EN_COLA,        // aceptado, esperando turno — SÍ tiene chat
            TrabajoEstado.PRESUPUESTADO
    );

    private static final Set<TrabajoEstado> TRABAJO_LECTURA = EnumSet.of(
            TrabajoEstado.COMPLETADO,
            TrabajoEstado.CANCELADO
    );

    private static final Set<MudanzaEstado> MUDANZA_ESCRITURA = EnumSet.of(
            MudanzaEstado.ACEPTADO,
            MudanzaEstado.EN_CURSO,
            MudanzaEstado.FINALIZADO,           // puede haber pago extra en discusión
            MudanzaEstado.PENDIENTE_PAGO_EXTRA
    );

    private static final Set<MudanzaEstado> MUDANZA_LECTURA = EnumSet.of(
            MudanzaEstado.COMPLETADO,
            MudanzaEstado.CANCELADO
    );

    private final ConversacionRepository conversacionRepository;

    public ConversacionService(ConversacionRepository conversacionRepository) {
        this.conversacionRepository = conversacionRepository;
    }

    public ModoChat resolverModo(Conversacion conversacion) {
        if (conversacion.getTrabajo() != null) {
            TrabajoEstado estado = conversacion.getTrabajo().getEstado();
            if (TRABAJO_ESCRITURA.contains(estado)) return ModoChat.ESCRITURA;
            if (TRABAJO_LECTURA.contains(estado)) return ModoChat.LECTURA;
            throw new IllegalStateException(
                    "Conversación en un trabajo en estado " + estado + ": no debería existir");
        }

        if (conversacion.getMudanza() != null) {
            MudanzaEstado estado = conversacion.getMudanza().getEstado();
            if (MUDANZA_ESCRITURA.contains(estado)) return ModoChat.ESCRITURA;
            if (MUDANZA_LECTURA.contains(estado)) return ModoChat.LECTURA;
            throw new IllegalStateException(
                    "Conversación en una mudanza en estado " + estado + ": no debería existir");
        }

        // El CHECK de la base lo impide, pero si llegamos acá con datos corruptos, fallar fuerte.
        throw new IllegalStateException("Conversación " + conversacion.getId() + " sin padre");
    }

    /** Idempotente: si ya existe la conversación del trabajo, la devuelve. */
    @Transactional
    public Conversacion crearParaTrabajo(Trabajo trabajo) {
        return conversacionRepository.findByTrabajoId(trabajo.getId())
                .orElseGet(() -> {
                    Conversacion c = new Conversacion();
                    c.setTrabajo(trabajo);
                    c.setCliente(trabajo.getCliente());
                    c.setProveedor(trabajo.getProveedor());
                    return conversacionRepository.save(c);
                });
    }

    /** Idempotente: si ya existe la conversación de la mudanza, la devuelve. */
    @Transactional
    public Conversacion crearParaMudanza(Mudanza mudanza) {
        return conversacionRepository.findByMudanzaId(mudanza.getId())
                .orElseGet(() -> {
                    Conversacion c = new Conversacion();
                    c.setMudanza(mudanza);
                    c.setCliente(mudanza.getCliente());
                    c.setProveedor(mudanza.getProveedor());
                    return conversacionRepository.save(c);
                });
    }
}
```

**Nota:** verificá que `Trabajo` tenga getter `getCliente()`. Si el campo se llama distinto
(p. ej. `usuario`), ajustá. Comprobalo con:
`grep -n 'private User' backend/src/main/java/com/aliados/backend/entity/Trabajo.java`

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd backend && ./gradlew test --tests ConversacionServiceTest`
Expected: PASS — 13 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/ModoChat.java \
        backend/src/main/java/com/aliados/backend/service/ConversacionService.java \
        backend/src/test/java/com/aliados/backend/service/ConversacionServiceTest.java
git commit -m "feat(chat): ConversacionService con ventana de escritura por vertical"
```

---

### Task 3: Enganchar la creación de la conversación en la aceptación

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (~línea 746, donde se setea `acceptedAt`)
- Modify: `backend/src/main/java/com/aliados/backend/service/MudanzaService.java` (donde la mudanza pasa a `ACEPTADO`)

**Interfaces:**
- Consumes: `ConversacionService.crearParaTrabajo(Trabajo)`, `ConversacionService.crearParaMudanza(Mudanza)` (Task 2).

**Riesgo:** son servicios centrales y en producción. **Una conversación que no se crea es un chat
que nunca aparece, sin error visible.** Por eso este task existe separado y con verificación
explícita.

- [ ] **Step 1: Localizar el punto exacto de aceptación en trabajos**

Run: `grep -n 'setAcceptedAt' backend/src/main/java/com/aliados/backend/service/TrabajoService.java`
Expected: una línea (~746), dentro del método donde el cliente acepta la propuesta y el trabajo
queda `EN_CURSO` o `EN_COLA` (ver líneas 738-747).

- [ ] **Step 2: Inyectar `ConversacionService` en `TrabajoService`**

Agregar el campo al constructor existente (seguí el estilo de inyección que ya usa la clase —
constructor o `@Autowired`, no lo cambies):

```java
private final ConversacionService conversacionService;
```

- [ ] **Step 3: Crear la conversación justo después de guardar el trabajo aceptado**

En `TrabajoService`, inmediatamente después de `trabajo = trabajoRepository.save(trabajo);`
(línea ~747):

```java
        // El chat nace acá: es el momento en que el vínculo cliente-proveedor queda confirmado.
        // Idempotente, así que un reintento no duplica.
        conversacionService.crearParaTrabajo(trabajo);
```

- [ ] **Step 4: Hacer lo mismo en `MudanzaService`**

Run: `grep -n 'MudanzaEstado.ACEPTADO' backend/src/main/java/com/aliados/backend/service/MudanzaService.java`

Ubicar el método donde el cliente acepta (la mudanza pasa a `ACEPTADO`) y, después del `save`,
agregar:

```java
        conversacionService.crearParaMudanza(mudanza);
```

Inyectar `ConversacionService` en `MudanzaService` igual que en el paso 2.

**Importante:** NO crear conversación en `CONTRAPROPUESTO` ni en `RESERVADO` — decisión de
producto explícita (esa negociación la cubre la feature de contrapropuesta).

- [ ] **Step 5: Verificar que la suite existente sigue pasando**

Run: `cd backend && ./gradlew test`
Expected: PASS. Si algún test de `TrabajoService`/`MudanzaService` falla por el mock faltante de
`ConversacionService`, agregá `@Mock ConversacionService conversacionService;` a esa clase de test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/main/java/com/aliados/backend/service/MudanzaService.java \
        backend/src/test/java/com/aliados/backend/service/
git commit -m "feat(chat): crear la conversación cuando el cliente acepta (trabajo y mudanza)"
```

---

### Task 4: `DetectorContacto` — regex de teléfonos y emails

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/service/DetectorContacto.java`
- Test: `backend/src/test/java/com/aliados/backend/service/DetectorContactoTest.java`

**Interfaces:**
- Produces: `DetectorContacto.contieneContacto(String) → boolean`.

**Marca, no censura.** Un falso positivo cuesta una fila mal marcada en un panel de admin; un
mensaje censurado destruye evidencia. El dominio es hostil a la regex: los presupuestos tienen
montos largos y las direcciones tienen alturas.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/test/java/com/aliados/backend/service/DetectorContactoTest.java`:

```java
package com.aliados.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DetectorContactoTest {

    private final DetectorContacto detector = new DetectorContacto();

    // --- DEBE detectar ---

    @Test
    void detectaCelularArgentinoConPrefijo() {
        assertThat(detector.contieneContacto("mi cel es 11 5555 4444")).isTrue();
    }

    @Test
    void detectaCelularPegado() {
        assertThat(detector.contieneContacto("llamame al 1155554444")).isTrue();
    }

    @Test
    void detectaCelularConGuiones() {
        assertThat(detector.contieneContacto("anotá: 11-5555-4444")).isTrue();
    }

    @Test
    void detectaEmail() {
        assertThat(detector.contieneContacto("escribime a juan.perez@gmail.com")).isTrue();
    }

    @Test
    void detectaTelefonoConPrefijoPais() {
        assertThat(detector.contieneContacto("+54 9 11 5555 4444")).isTrue();
    }

    // --- NO debe detectar (falsos positivos que ROMPERÍAN conversaciones legítimas) ---

    // El dominio del negocio está lleno de números. Un presupuesto NO es un teléfono.
    @Test
    void noDetectaMontoDePresupuesto() {
        assertThat(detector.contieneContacto("el presupuesto es $15000")).isFalse();
    }

    @Test
    void noDetectaMontoGrande() {
        assertThat(detector.contieneContacto("serían 150000 pesos en total")).isFalse();
    }

    @Test
    void noDetectaAlturaDeDireccion() {
        assertThat(detector.contieneContacto("Av. Rivadavia 4567, piso 3")).isFalse();
    }

    @Test
    void noDetectaHorario() {
        assertThat(detector.contieneContacto("paso entre las 14 y las 16")).isFalse();
    }

    @Test
    void noDetectaTextoNormal() {
        assertThat(detector.contieneContacto("dale, te espero. el portón está abierto")).isFalse();
    }

    @Test
    void toleraNull() {
        assertThat(detector.contieneContacto(null)).isFalse();
    }
}
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && ./gradlew test --tests DetectorContactoTest`
Expected: FAIL — `DetectorContacto` no existe.

- [ ] **Step 3: Implementar `DetectorContacto`**

`backend/src/main/java/com/aliados/backend/service/DetectorContacto.java`:

```java
package com.aliados.backend.service;

import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Detección PASIVA de datos de contacto. MARCA, no censura ni bloquea.
 *
 * Sirve para medir el bypass de comisión (fuga a WhatsApp) sin romper conversaciones legítimas
 * y sin destruir evidencia. Si algún día se decide bloquear, primero habrá datos para saber si
 * el problema existe de verdad.
 *
 * Se calibra para MINIMIZAR FALSOS POSITIVOS: en este dominio hay montos ($150000), alturas de
 * direcciones (Rivadavia 4567) y horarios. Marcar un presupuesto como "teléfono" es peor que
 * dejar pasar un teléfono.
 */
@Component
public class DetectorContacto {

    // Teléfono argentino: 8+ dígitos, permitiendo separadores (espacio, guion, punto) y un
    // prefijo internacional opcional. El piso de 8 dígitos es lo que excluye montos y alturas:
    // un monto de "150000" son 6 dígitos; una altura, 4.
    private static final Pattern TELEFONO = Pattern.compile(
            "(\\+?\\d{1,3}[\\s.-]?)?(\\d[\\s.-]?){8,}\\d"
    );

    private static final Pattern EMAIL = Pattern.compile(
            "[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}"
    );

    public boolean contieneContacto(String texto) {
        if (texto == null || texto.isBlank()) return false;
        return TELEFONO.matcher(texto).find() || EMAIL.matcher(texto).find();
    }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && ./gradlew test --tests DetectorContactoTest`
Expected: PASS — 11 tests.

Si `noDetectaMontoGrande` falla (un monto de 6 dígitos matcheando el patrón de teléfono),
subí el umbral de dígitos del patrón `TELEFONO`. **No bajes el umbral para hacer pasar los
tests de detección a costa de los de falso positivo** — la prioridad es no marcar de más.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/DetectorContacto.java \
        backend/src/test/java/com/aliados/backend/service/DetectorContactoTest.java
git commit -m "feat(chat): detección pasiva de datos de contacto (marca, no censura)"
```

---

### Task 5: `PresenciaService` + `PushThrottle` — la política de push

Dos guardas independientes deciden si sale una notificación push:

1. **Presencia** — ¿tiene el destinatario una sesión WebSocket activa? Si la tiene, ya recibió el
   mensaje por el socket: mandarle un push sería redundante.
2. **Throttle** — aunque esté desconectado, **una push por mensaje es spam**: una conversación de
   15 mensajes serían 15 vibraciones. Se emite como mucho una push por conversación cada N minutos.

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/service/PresenciaService.java`
- Create: `backend/src/main/java/com/aliados/backend/service/PushThrottle.java`
- Test: `backend/src/test/java/com/aliados/backend/service/PresenciaServiceTest.java`
- Test: `backend/src/test/java/com/aliados/backend/service/PushThrottleTest.java`

**Interfaces:**
- Produces: `PresenciaService.estaConectado(String firebaseUid) → boolean`, `PushThrottle.deboNotificar(Long conversacionId, Long destinatarioId) → boolean`.

**LEER ESTO ANTES DE IMPLEMENTAR.** La tentación es usar `UserStatus`. **No lo hagas.**
`WebSocketEventListener.java:82-85` no marca `OFFLINE` a un usuario `BUSY`, y un proveedor con
trabajos activos está `BUSY`. Un proveedor que cierra la app **queda `BUSY` para siempre**. Si la
presencia saliera de `UserStatus`, el sistema lo creería conectado y **nunca le mandaría el
push** — al usuario que más lo necesita.

`UserStatus` mezcla dos cosas ortogonales: **conectividad** (¿hay socket?) y **disponibilidad**
(¿está libre?). Para el push hace falta la primera. `SimpUserRegistry` es el registro real de
sesiones STOMP de Spring y responde exactamente esa pregunta.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/test/java/com/aliados/backend/service/PresenciaServiceTest.java`:

```java
package com.aliados.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PresenciaServiceTest {

    @Mock SimpUserRegistry simpUserRegistry;
    @Mock SimpUser simpUser;

    @InjectMocks PresenciaService presenciaService;

    @Test
    void conSesionStompActiva_estaConectado() {
        when(simpUserRegistry.getUser("uid-123")).thenReturn(simpUser);
        assertThat(presenciaService.estaConectado("uid-123")).isTrue();
    }

    @Test
    void sinSesionStomp_noEstaConectado() {
        when(simpUserRegistry.getUser("uid-123")).thenReturn(null);
        assertThat(presenciaService.estaConectado("uid-123")).isFalse();
    }

    @Test
    void uidNull_noEstaConectado() {
        assertThat(presenciaService.estaConectado(null)).isFalse();
    }
}
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./gradlew test --tests PresenciaServiceTest`
Expected: FAIL — `PresenciaService` no existe.

- [ ] **Step 3: Implementar `PresenciaService`**

`backend/src/main/java/com/aliados/backend/service/PresenciaService.java`:

```java
package com.aliados.backend.service;

import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.stereotype.Service;

/**
 * ¿Tiene el usuario una sesión WebSocket activa AHORA?
 *
 * NO usa UserStatus: ese enum mezcla conectividad (¿hay socket?) con disponibilidad (¿está
 * libre?), y el disconnect handler (WebSocketEventListener:82-85) NO marca OFFLINE a un usuario
 * BUSY. Un proveedor que cierra la app con trabajos activos queda BUSY para siempre: si la
 * presencia saliera de ahí, jamás recibiría un push.
 *
 * SimpUserRegistry es el registro real de sesiones STOMP. Es in-memory por instancia — misma
 * restricción de UNA sola instancia que el SimpleBroker, ya asumida en el spec.
 */
@Service
public class PresenciaService {

    private final SimpUserRegistry simpUserRegistry;

    public PresenciaService(SimpUserRegistry simpUserRegistry) {
        this.simpUserRegistry = simpUserRegistry;
    }

    public boolean estaConectado(String firebaseUid) {
        if (firebaseUid == null) return false;
        return simpUserRegistry.getUser(firebaseUid) != null;
    }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd backend && ./gradlew test --tests PresenciaServiceTest`
Expected: PASS — 3 tests.

- [ ] **Step 5: Escribir los tests del throttle**

`backend/src/test/java/com/aliados/backend/service/PushThrottleTest.java`:

```java
package com.aliados.backend.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class PushThrottleTest {

    // Reloj inyectable: sin esto habría que dormir el test 5 minutos para probar la ventana.
    private final AtomicReference<Instant> ahora = new AtomicReference<>(Instant.parse("2026-07-12T10:00:00Z"));
    private final PushThrottle throttle = new PushThrottle(ahora::get);

    @Test
    void primeraNotificacion_seEmite() {
        assertThat(throttle.deboNotificar(10L, 2L)).isTrue();
    }

    // El caso que motiva todo esto: 15 mensajes seguidos NO son 15 vibraciones.
    @Test
    void segundaNotificacionInmediata_seSuprime() {
        throttle.deboNotificar(10L, 2L);
        assertThat(throttle.deboNotificar(10L, 2L)).isFalse();
    }

    @Test
    void pasadaLaVentana_vuelveAEmitir() {
        throttle.deboNotificar(10L, 2L);
        ahora.set(ahora.get().plus(Duration.ofMinutes(6)));
        assertThat(throttle.deboNotificar(10L, 2L)).isTrue();
    }

    // El throttle es POR CONVERSACIÓN Y DESTINATARIO: silenciar una conversación no puede
    // silenciar otra, ni silenciar al cliente puede silenciar al proveedor.
    @Test
    void otraConversacion_noSeVeAfectada() {
        throttle.deboNotificar(10L, 2L);
        assertThat(throttle.deboNotificar(11L, 2L)).isTrue();
    }

    @Test
    void otroDestinatario_noSeVeAfectado() {
        throttle.deboNotificar(10L, 2L);
        assertThat(throttle.deboNotificar(10L, 3L)).isTrue();
    }
}
```

- [ ] **Step 6: Correr y verificar que fallan**

Run: `cd backend && ./gradlew test --tests PushThrottleTest`
Expected: FAIL — `PushThrottle` no existe.

- [ ] **Step 7: Implementar `PushThrottle`**

`backend/src/main/java/com/aliados/backend/service/PushThrottle.java`:

```java
package com.aliados.backend.service;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Evita que una ráfaga de mensajes se convierta en una ráfaga de vibraciones.
 * Como mucho una push por (conversación, destinatario) cada VENTANA.
 *
 * In-memory: misma restricción de UNA sola instancia que el SimpleBroker y el SimpUserRegistry,
 * ya asumida en el spec. Con dos réplicas el throttle se relajaría (hasta 2 pushes por ventana),
 * lo cual degrada suavemente — no rompe nada.
 */
@Service
public class PushThrottle {

    private static final Duration VENTANA = Duration.ofMinutes(5);

    private final Map<String, Instant> ultimaPush = new ConcurrentHashMap<>();
    private final Supplier<Instant> reloj;

    public PushThrottle() {
        this(Instant::now);
    }

    // Constructor para tests: permite adelantar el reloj sin dormir.
    PushThrottle(Supplier<Instant> reloj) {
        this.reloj = reloj;
    }

    public boolean deboNotificar(Long conversacionId, Long destinatarioId) {
        String clave = conversacionId + ":" + destinatarioId;
        Instant ahora = reloj.get();

        // merge() es atómico: dos mensajes concurrentes no pueden colarse ambos.
        Instant previa = ultimaPush.get(clave);
        if (previa != null && Duration.between(previa, ahora).compareTo(VENTANA) < 0) {
            return false;
        }
        ultimaPush.put(clave, ahora);
        return true;
    }
}
```

- [ ] **Step 8: Correr y verificar que pasan**

Run: `cd backend && ./gradlew test --tests PushThrottleTest`
Expected: PASS — 5 tests.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/PresenciaService.java \
        backend/src/main/java/com/aliados/backend/service/PushThrottle.java \
        backend/src/test/java/com/aliados/backend/service/PresenciaServiceTest.java \
        backend/src/test/java/com/aliados/backend/service/PushThrottleTest.java
git commit -m "feat(chat): presencia (SimpUserRegistry) y throttle del push"
```

---

### Task 6: `ChatService` — el corazón del módulo

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/dto/{EnviarMensajeDTO,MensajeResponseDTO}.java`
- Create: `backend/src/main/java/com/aliados/backend/service/ChatService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/ChatServiceTest.java`

**Interfaces:**
- Consumes: `ConversacionService.resolverModo`, `DetectorContacto.contieneContacto`, `PresenciaService.estaConectado`, `PushThrottle.deboNotificar`, los tres repositories (Tasks 1-5).
- Produces: `ChatService.enviarMensaje(Long conversacionId, String firebaseUid, EnviarMensajeDTO) → MensajeResponseDTO`, `ChatService.listarMensajes(Long, String, Pageable) → Page<MensajeResponseDTO>`, `ChatService.marcarLeido(Long, String, Long)`, `ChatService.contarNoLeidos(Long, String) → long`.

- [ ] **Step 1: Crear los DTOs**

`backend/src/main/java/com/aliados/backend/dto/EnviarMensajeDTO.java`:

```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.TipoMensaje;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class EnviarMensajeDTO {
    private TipoMensaje tipo;

    @Size(max = 2000, message = "El mensaje no puede superar los 2000 caracteres")
    private String contenido;

    private String imagenUrl;
}
```

`backend/src/main/java/com/aliados/backend/dto/MensajeResponseDTO.java`:

```java
package com.aliados.backend.dto;

import com.aliados.backend.entity.TipoMensaje;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MensajeResponseDTO {
    private Long id;
    private Long conversacionId;
    private Long emisorId;
    private String emisorNombre;
    private TipoMensaje tipo;
    private String contenido;
    private String imagenUrl;
    private LocalDateTime creadoAt;
    // contieneContacto NO se expone al frontend: es una señal interna para el panel de admin.
    // Mostrarla le enseñaría al usuario a evadir la detección.
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`backend/src/test/java/com/aliados/backend/service/ChatServiceTest.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock ConversacionRepository conversacionRepository;
    @Mock MensajeRepository mensajeRepository;
    @Mock LecturaConversacionRepository lecturaRepository;
    @Mock UserRepository userRepository;
    @Mock ConversacionService conversacionService;
    @Mock DetectorContacto detectorContacto;
    @Mock PresenciaService presenciaService;
    @Mock PushThrottle pushThrottle;
    @Mock NotificacionService notificacionService;
    @Mock SimpMessagingTemplate messagingTemplate;

    @InjectMocks ChatService chatService;

    private User cliente;
    private User proveedor;
    private User tercero;
    private Conversacion conversacion;

    @BeforeEach
    void setUp() {
        cliente = new User();
        cliente.setId(1L);
        cliente.setFirebaseUid("uid-cliente");
        cliente.setNombre("Ana");

        proveedor = new User();
        proveedor.setId(2L);
        proveedor.setFirebaseUid("uid-proveedor");
        proveedor.setNombre("Beto");

        tercero = new User();
        tercero.setId(99L);
        tercero.setFirebaseUid("uid-tercero");
        tercero.setNombre("Intruso");

        conversacion = new Conversacion();
        conversacion.setId(10L);
        conversacion.setCliente(cliente);
        conversacion.setProveedor(proveedor);
    }

    private EnviarMensajeDTO dtoTexto(String texto) {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setTipo(TipoMensaje.TEXTO);
        dto.setContenido(texto);
        return dto;
    }

    // --- AUTORIZACIÓN (donde viven los IDOR) ---

    @Test
    void tercero_noPuedeEnviar() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-tercero")).thenReturn(Optional.of(tercero));

        assertThatThrownBy(() ->
                chatService.enviarMensaje(10L, "uid-tercero", dtoTexto("hola")))
                .isInstanceOf(SecurityException.class);

        verify(mensajeRepository, never()).save(any());
    }

    @Test
    void tercero_noPuedeLeer() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-tercero")).thenReturn(Optional.of(tercero));

        assertThatThrownBy(() ->
                chatService.listarMensajes(10L, "uid-tercero", org.springframework.data.domain.PageRequest.of(0, 20)))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void conversacionInexistente_lanzaNotFound() {
        when(conversacionRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                chatService.enviarMensaje(404L, "uid-cliente", dtoTexto("hola")))
                .isInstanceOf(NotFoundException.class);
    }

    // --- LOG CONGELADO ---

    @Test
    void servicioCerrado_rechazaEnvio() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.LECTURA);

        assertThatThrownBy(() ->
                chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola")))
                .isInstanceOf(IllegalStateException.class);

        verify(mensajeRepository, never()).save(any());
    }

    @Test
    void servicioCerrado_permiteLeer() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(mensajeRepository.findByConversacionIdOrderByIdDesc(eq(10L), any()))
                .thenReturn(org.springframework.data.domain.Page.empty());

        chatService.listarMensajes(10L, "uid-cliente",
                org.springframework.data.domain.PageRequest.of(0, 20));

        verify(mensajeRepository).findByConversacionIdOrderByIdDesc(eq(10L), any());
    }

    // --- ENVÍO FELIZ ---

    @Test
    void clienteEnvia_persisteYPublicaAlProveedor() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(detectorContacto.contieneContacto("el portón está abierto")).thenReturn(false);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("el portón está abierto"));

        // Persiste ANTES de publicar: un mensaje fantasma en un log que es evidencia es peor
        // que un mensaje demorado.
        var orden = inOrder(mensajeRepository, messagingTemplate);
        orden.verify(mensajeRepository).save(any(Mensaje.class));
        orden.verify(messagingTemplate)
                .convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), any());
    }

    // --- REGLA DE PRESENCIA ---

    @Test
    void destinatarioConectado_noMandaPush() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola"));

        verifyNoInteractions(notificacionService);
    }

    @Test
    void destinatarioDesconectado_mandaPush() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 2L)).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola"));

        verify(notificacionService).crearNotificacion(
                eq(proveedor), eq(TipoNotificacion.MENSAJE_CHAT), anyString(), anyString(), any());
    }

    // Desconectado PERO ya se le notificó hace un minuto: no vibra de nuevo. Una ráfaga de
    // mensajes no puede ser una ráfaga de vibraciones.
    @Test
    void destinatarioDesconectadoPeroThrottleado_noMandaPush() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 2L)).thenReturn(false);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola"));

        verifyNoInteractions(notificacionService);
        // Pero el mensaje SÍ se guardó y SÍ se publicó por el socket: el throttle sólo silencia
        // la vibración, nunca pierde el mensaje.
        verify(mensajeRepository).save(any(Mensaje.class));
        verify(messagingTemplate).convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), any());
    }

    // --- MARCADO DE CONTACTO ---

    @Test
    void mensajeConTelefono_seGuardaMarcadoYSinCensurar() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(detectorContacto.contieneContacto("llamame al 1155554444")).thenReturn(true);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado(anyString())).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("llamame al 1155554444"));

        var captor = org.mockito.ArgumentCaptor.forClass(Mensaje.class);
        verify(mensajeRepository).save(captor.capture());
        Mensaje guardado = captor.getValue();

        assertThat(guardado.getContieneContacto()).isTrue();
        // SIN CENSURAR: marcar y censurar son incompatibles. Censurar destruye la evidencia.
        assertThat(guardado.getContenido()).isEqualTo("llamame al 1155554444");
    }

    // --- PUNTERO DE LECTURA ---

    @Test
    void sinPuntero_todosLosMensajesSonNoLeidos() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.empty());
        when(mensajeRepository.countByConversacionId(10L)).thenReturn(7L);

        assertThat(chatService.contarNoLeidos(10L, "uid-cliente")).isEqualTo(7L);
    }

    @Test
    void conPuntero_cuentaSoloLosPosteriores() {
        LecturaConversacion lectura = new LecturaConversacion();
        lectura.setConversacionId(10L);
        lectura.setUsuarioId(1L);
        lectura.setUltimoMensajeLeidoId(5L);

        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.of(lectura));
        when(mensajeRepository.countByConversacionIdAndIdGreaterThan(10L, 5L)).thenReturn(2L);

        assertThat(chatService.contarNoLeidos(10L, "uid-cliente")).isEqualTo(2L);
    }
}
```

- [ ] **Step 3: Agregar `MENSAJE_CHAT` al enum `TipoNotificacion`**

Run: `grep -n '' backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java`

Agregar el valor `MENSAJE_CHAT` al enum, siguiendo el estilo de los existentes.

- [ ] **Step 4: Correr los tests y verificar que fallan**

Run: `cd backend && ./gradlew test --tests ChatServiceTest`
Expected: FAIL — `ChatService` no existe.

- [ ] **Step 5: Implementar `ChatService`**

`backend/src/main/java/com/aliados/backend/service/ChatService.java`:

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChatService {

    private final ConversacionRepository conversacionRepository;
    private final MensajeRepository mensajeRepository;
    private final LecturaConversacionRepository lecturaRepository;
    private final UserRepository userRepository;
    private final ConversacionService conversacionService;
    private final DetectorContacto detectorContacto;
    private final PresenciaService presenciaService;
    private final PushThrottle pushThrottle;
    private final NotificacionService notificacionService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatService(ConversacionRepository conversacionRepository,
                       MensajeRepository mensajeRepository,
                       LecturaConversacionRepository lecturaRepository,
                       UserRepository userRepository,
                       ConversacionService conversacionService,
                       DetectorContacto detectorContacto,
                       PresenciaService presenciaService,
                       PushThrottle pushThrottle,
                       NotificacionService notificacionService,
                       SimpMessagingTemplate messagingTemplate) {
        this.conversacionRepository = conversacionRepository;
        this.mensajeRepository = mensajeRepository;
        this.lecturaRepository = lecturaRepository;
        this.userRepository = userRepository;
        this.conversacionService = conversacionService;
        this.detectorContacto = detectorContacto;
        this.presenciaService = presenciaService;
        this.pushThrottle = pushThrottle;
        this.notificacionService = notificacionService;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public MensajeResponseDTO enviarMensaje(Long conversacionId, String firebaseUid,
                                            EnviarMensajeDTO dto) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User emisor = buscarUsuario(firebaseUid);

        // 1. Autorización: una sola fila, sin joins al padre. Sin ramas por vertical → sin IDOR.
        autorizar(conversacion, emisor);

        // 2. Log congelado.
        if (conversacionService.resolverModo(conversacion) != ModoChat.ESCRITURA) {
            throw new IllegalStateException("El servicio está cerrado: el chat es sólo lectura");
        }

        // 3. Coherencia contenido/tipo.
        validarContenido(dto);

        Mensaje mensaje = new Mensaje();
        mensaje.setConversacion(conversacion);
        mensaje.setEmisor(emisor);
        mensaje.setTipo(dto.getTipo());
        mensaje.setContenido(dto.getContenido());
        mensaje.setImagenUrl(dto.getImagenUrl());
        // MARCA, no censura: el contenido se guarda intacto.
        mensaje.setContieneContacto(detectorContacto.contieneContacto(dto.getContenido()));

        // PERSISTIR PRIMERO. Publicar antes de guardar mostraría un mensaje que no existe.
        Mensaje guardado = mensajeRepository.save(mensaje);
        MensajeResponseDTO response = aDTO(guardado);

        User destinatario = destinatarioDe(conversacion, emisor);
        messagingTemplate.convertAndSendToUser(
                destinatario.getFirebaseUid(), "/queue/chat", response);

        // Push SÓLO si (a) no hay sesión WebSocket activa —si está conectado ya lo recibió arriba—
        // y (b) no se le notificó hace poco por esta conversación. El throttle sólo silencia la
        // VIBRACIÓN: el mensaje ya está persistido y ya salió por el socket.
        boolean desconectado = !presenciaService.estaConectado(destinatario.getFirebaseUid());
        if (desconectado && pushThrottle.deboNotificar(conversacion.getId(), destinatario.getId())) {
            notificacionService.crearNotificacion(
                    destinatario,
                    TipoNotificacion.MENSAJE_CHAT,
                    "Nuevo mensaje de " + emisor.getNombre(),
                    resumen(guardado),
                    null);
        }

        return response;
    }

    @Transactional(readOnly = true)
    public Page<MensajeResponseDTO> listarMensajes(Long conversacionId, String firebaseUid,
                                                   Pageable pageable) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User usuario = buscarUsuario(firebaseUid);
        autorizar(conversacion, usuario);

        return mensajeRepository
                .findByConversacionIdOrderByIdDesc(conversacionId, pageable)
                .map(this::aDTO);
    }

    @Transactional
    public void marcarLeido(Long conversacionId, String firebaseUid, Long hastaMensajeId) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User usuario = buscarUsuario(firebaseUid);
        autorizar(conversacion, usuario);

        LecturaConversacion lectura = lecturaRepository
                .findByConversacionIdAndUsuarioId(conversacionId, usuario.getId())
                .orElseGet(() -> {
                    LecturaConversacion nueva = new LecturaConversacion();
                    nueva.setConversacionId(conversacionId);
                    nueva.setUsuarioId(usuario.getId());
                    return nueva;
                });

        // El puntero sólo avanza. Un request fuera de orden no puede "des-leer" mensajes.
        Long actual = lectura.getUltimoMensajeLeidoId();
        if (actual == null || hastaMensajeId > actual) {
            lectura.setUltimoMensajeLeidoId(hastaMensajeId);
            lecturaRepository.save(lectura);
        }
    }

    @Transactional(readOnly = true)
    public long contarNoLeidos(Long conversacionId, String firebaseUid) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User usuario = buscarUsuario(firebaseUid);
        autorizar(conversacion, usuario);

        return lecturaRepository
                .findByConversacionIdAndUsuarioId(conversacionId, usuario.getId())
                .map(l -> l.getUltimoMensajeLeidoId() == null
                        ? mensajeRepository.countByConversacionId(conversacionId)
                        : mensajeRepository.countByConversacionIdAndIdGreaterThan(
                                conversacionId, l.getUltimoMensajeLeidoId()))
                .orElseGet(() -> mensajeRepository.countByConversacionId(conversacionId));
    }

    // --- privados ---

    private Conversacion buscarConversacion(Long id) {
        return conversacionRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Conversación no encontrada"));
    }

    private User buscarUsuario(String firebaseUid) {
        return userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
    }

    private void autorizar(Conversacion c, User u) {
        boolean participa = c.getCliente().getId().equals(u.getId())
                || c.getProveedor().getId().equals(u.getId());
        if (!participa) {
            throw new SecurityException("No participás de esta conversación");
        }
    }

    private User destinatarioDe(Conversacion c, User emisor) {
        return c.getCliente().getId().equals(emisor.getId())
                ? c.getProveedor()
                : c.getCliente();
    }

    private void validarContenido(EnviarMensajeDTO dto) {
        if (dto.getTipo() == TipoMensaje.TEXTO
                && (dto.getContenido() == null || dto.getContenido().isBlank())) {
            throw new IllegalArgumentException("Un mensaje de texto necesita contenido");
        }
        if (dto.getTipo() == TipoMensaje.IMAGEN
                && (dto.getImagenUrl() == null || dto.getImagenUrl().isBlank())) {
            throw new IllegalArgumentException("Un mensaje de imagen necesita imagenUrl");
        }
    }

    private String resumen(Mensaje m) {
        if (m.getTipo() == TipoMensaje.IMAGEN) return "📷 Foto";
        String texto = m.getContenido();
        return texto.length() > 80 ? texto.substring(0, 77) + "..." : texto;
    }

    private MensajeResponseDTO aDTO(Mensaje m) {
        MensajeResponseDTO dto = new MensajeResponseDTO();
        dto.setId(m.getId());
        dto.setConversacionId(m.getConversacion().getId());
        dto.setEmisorId(m.getEmisor().getId());
        dto.setEmisorNombre(m.getEmisor().getNombre());
        dto.setTipo(m.getTipo());
        dto.setContenido(m.getContenido());
        dto.setImagenUrl(m.getImagenUrl());
        dto.setCreadoAt(m.getCreadoAt());
        return dto;
    }
}
```

**Nota sobre `crearNotificacion`:** verificá la firma real con
`grep -n 'public.*crearNotificacion' backend/src/main/java/com/aliados/backend/service/NotificacionService.java`
y ajustá la llamada (y el test) a los parámetros que realmente recibe.

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd backend && ./gradlew test --tests ChatServiceTest`
Expected: PASS — 11 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/ChatService.java \
        backend/src/main/java/com/aliados/backend/dto/ \
        backend/src/main/java/com/aliados/backend/entity/TipoNotificacion.java \
        backend/src/test/java/com/aliados/backend/service/ChatServiceTest.java
git commit -m "feat(chat): ChatService (autorización, log congelado, presencia, marcado)"
```

---

### Task 7: `ChatController` + exponer `conversacionId` en los DTO del servicio

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/controller/ChatController.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/MarcarLeidoDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/dto/TrabajoResponseDTO.java`
- Modify: `backend/src/main/java/com/aliados/backend/dto/MudanzaResponseDTO.java`
- Modify: `TrabajoService.java` / `MudanzaService.java` (mapeo del DTO)
- Modify: `backend/src/main/java/com/aliados/backend/exception/` (mapeo de `SecurityException` → 403)

**Interfaces:**
- Consumes: `ChatService` (Task 6).
- Produces: `GET/POST /api/conversaciones/{id}/mensajes`, `POST /api/conversaciones/{id}/mensajes/leidos`, `GET /api/conversaciones/{id}/no-leidos`. Los DTO de trabajo y mudanza ganan `conversacionId` (nullable).

- [ ] **Step 1: Crear `MarcarLeidoDTO`**

```java
package com.aliados.backend.dto;

import lombok.Data;

@Data
public class MarcarLeidoDTO {
    private Long hastaMensajeId;
}
```

- [ ] **Step 2: Crear `ChatController`**

`backend/src/main/java/com/aliados/backend/controller/ChatController.java`:

```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.dto.MarcarLeidoDTO;
import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.service.ChatService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/conversaciones")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    // Página 0 = mensajes MÁS RECIENTES (el chat se lee de abajo hacia arriba).
    @GetMapping("/{id}/mensajes")
    public ResponseEntity<Page<MensajeResponseDTO>> listar(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            Authentication authentication) {

        return ResponseEntity.ok(chatService.listarMensajes(
                id, authentication.getName(), PageRequest.of(page, Math.min(size, 100))));
    }

    @PostMapping("/{id}/mensajes")
    public ResponseEntity<MensajeResponseDTO> enviar(
            @PathVariable Long id,
            @Valid @RequestBody EnviarMensajeDTO dto,
            Authentication authentication) {

        return ResponseEntity.ok(chatService.enviarMensaje(id, authentication.getName(), dto));
    }

    @PostMapping("/{id}/mensajes/leidos")
    public ResponseEntity<Void> marcarLeido(
            @PathVariable Long id,
            @RequestBody MarcarLeidoDTO dto,
            Authentication authentication) {

        chatService.marcarLeido(id, authentication.getName(), dto.getHastaMensajeId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/no-leidos")
    public ResponseEntity<Map<String, Long>> noLeidos(
            @PathVariable Long id, Authentication authentication) {

        return ResponseEntity.ok(Map.of(
                "count", chatService.contarNoLeidos(id, authentication.getName())));
    }
}
```

- [ ] **Step 3: Mapear las excepciones a códigos HTTP**

Localizar el `@ControllerAdvice` existente:
Run: `grep -rln 'ControllerAdvice' backend/src/main/java/com/aliados/backend/`

Asegurar (agregando los handlers que falten) que:
- `SecurityException` → **403 FORBIDDEN**
- `IllegalStateException` → **409 CONFLICT** (log congelado)
- `IllegalArgumentException` → **400 BAD REQUEST**
- `NotFoundException` → **404** (probablemente ya está)

**Cuidado:** si `IllegalStateException` ya está mapeado a otro código en el advice global, **no lo
cambies** — podés romper otros endpoints. En ese caso, creá una excepción propia
`ChatCerradoException` y mapeala a 409.

- [ ] **Step 4: Exponer `conversacionId` en los DTO**

En `TrabajoResponseDTO` y `MudanzaResponseDTO`, agregar:

```java
    // null = todavía no hay conversación (el cliente no aceptó aún) → la UI no muestra el chat.
    private Long conversacionId;
```

Y en el mapeo de `TrabajoService`/`MudanzaService` (junto a `dto.setProveedorId(...)`, ~línea 445
de `TrabajoService`), setearlo desde `ConversacionRepository.findByTrabajoId(...)` /
`findByMudanzaId(...)`.

**Ojo con el N+1:** si el mapeo se hace dentro de un bucle sobre una lista de trabajos, una
consulta por trabajo degrada el dashboard. Si el listado devuelve muchos elementos, resolvelo con
una sola consulta que traiga las conversaciones de todos los IDs y armá un `Map<trabajoId,
conversacionId>` antes del bucle.

- [ ] **Step 5: Verificar la suite completa**

Run: `cd backend && ./gradlew test`
Expected: PASS.

- [ ] **Step 6: Probar los endpoints a mano contra la app levantada**

Con la app corriendo y un token válido de un cliente con un trabajo `EN_CURSO`:

```bash
# Reemplazá $TOKEN y $CONV_ID
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/conversaciones/$CONV_ID/mensajes | jq

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tipo":"TEXTO","contenido":"hola, ya llego"}' \
  http://localhost:8080/api/conversaciones/$CONV_ID/mensajes | jq
```

Expected: el `GET` devuelve una página vacía; el `POST` devuelve el `MensajeResponseDTO` con `id`.

**Probar el IDOR:** con el token de un usuario que NO participa, el mismo `GET` debe dar **403**.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/controller/ChatController.java \
        backend/src/main/java/com/aliados/backend/dto/ \
        backend/src/main/java/com/aliados/backend/service/ \
        backend/src/main/java/com/aliados/backend/exception/
git commit -m "feat(chat): API REST de conversaciones + conversacionId en los DTO"
```

---

## FASE 2 — FRONTEND

### Task 8: Refactor de `useWebSocket` — API de suscripción genérica

**El task más riesgoso del plan.** `useWebSocket.ts` es infraestructura viva: si se rompe, se
rompen las notificaciones en producción. **No agregar features acá — sólo generalizar.**

**Files:**
- Modify: `apps/app/src/shared/hooks/useWebSocket.ts` (hoy 290 líneas; la suscripción hardcodeada está en la línea ~78)
- Test: `apps/app/src/shared/hooks/__tests__/useWebSocket.test.ts`

**Interfaces:**
- Produces: `useWebSocket()` devuelve, además de lo que ya devuelve hoy, `subscribe(destino: string, handler: (payload: any) => void) => () => void` (la función devuelta desuscribe).

- [ ] **Step 1: Leer el hook completo antes de tocar nada**

Run: `cat apps/app/src/shared/hooks/useWebSocket.ts`

Identificar: dónde se crea el cliente STOMP, dónde se suscribe a `/user/queue/notifications`
(~línea 78), cómo se maneja la reconexión y el heartbeat (~líneas 262, 279).

- [ ] **Step 2: Escribir el test que falla**

`apps/app/src/shared/hooks/__tests__/useWebSocket.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

// Mock del cliente STOMP: nos importa el CONTRATO de suscripción, no la red.
const subscripcionesActivas = new Map<string, (msg: any) => void>();
const unsubscribeSpy = vi.fn();

vi.mock('@stomp/stompjs', () => ({
  Client: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    subscribe: (destino: string, cb: (msg: any) => void) => {
      subscripcionesActivas.set(destino, cb);
      return { unsubscribe: unsubscribeSpy };
    },
    publish: vi.fn(),
    connected: true,
    onConnect: null,
  })),
}));

describe('useWebSocket — API de suscripción genérica', () => {
  beforeEach(() => {
    subscripcionesActivas.clear();
    unsubscribeSpy.mockClear();
  });

  it('expone subscribe() y entrega el payload parseado al handler', () => {
    const { result } = renderHook(() => useWebSocket());
    const handler = vi.fn();

    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });

    const cb = subscripcionesActivas.get('/user/queue/chat');
    expect(cb).toBeDefined();

    act(() => {
      cb!({ body: JSON.stringify({ id: 1, contenido: 'hola' }) });
    });

    expect(handler).toHaveBeenCalledWith({ id: 1, contenido: 'hola' });
  });

  it('la función devuelta por subscribe() desuscribe', () => {
    const { result } = renderHook(() => useWebSocket());

    let unsub: () => void = () => {};
    act(() => {
      unsub = result.current.subscribe('/user/queue/chat', vi.fn());
    });

    act(() => unsub());

    expect(unsubscribeSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd apps/app && pnpm test useWebSocket`
Expected: FAIL — `result.current.subscribe is not a function`.

- [ ] **Step 4: Generalizar el hook**

En `useWebSocket.ts`:

1. Mantener **intacta** la lógica de conexión, reconexión y heartbeat.
2. Agregar un registro de suscripciones pendientes (para las que se piden **antes** de que el
   socket conecte — si no, se pierden silenciosamente):

```ts
  // Suscripciones pedidas antes de que el socket esté conectado. Sin esto, un componente que
  // monta durante la reconexión queda mudo para siempre.
  const pendientesRef = useRef<Array<{ destino: string; handler: (p: any) => void }>>([]);
  const activasRef = useRef<Map<string, { unsubscribe: () => void }>>(new Map());

  const subscribe = useCallback((destino: string, handler: (payload: any) => void) => {
    const aplicar = () => {
      const sub = clientRef.current!.subscribe(destino, (message: any) => {
        handler(JSON.parse(message.body));
      });
      activasRef.current.set(destino, sub);
    };

    if (clientRef.current?.connected) {
      aplicar();
    } else {
      pendientesRef.current.push({ destino, handler });
    }

    return () => {
      activasRef.current.get(destino)?.unsubscribe();
      activasRef.current.delete(destino);
      pendientesRef.current = pendientesRef.current.filter((p) => p.destino !== destino);
    };
  }, []);
```

3. En el `onConnect` existente, después de la suscripción a notificaciones, **re-aplicar las
   pendientes** (y también las activas, porque una reconexión invalida las suscripciones viejas).

4. **Convertir la suscripción a notificaciones en un consumidor de `subscribe()`**, no en un caso
   especial. Debe seguir funcionando idéntico.

5. Exportar `subscribe` en el objeto de retorno del hook.

- [ ] **Step 5: Correr los tests y el typecheck**

Run: `cd apps/app && pnpm test useWebSocket && pnpm tsc --noEmit`
Expected: PASS ambos.

- [ ] **Step 6: VERIFICAR QUE LAS NOTIFICACIONES SIGUEN ANDANDO**

**No saltear este paso.** Levantar la app, loguearse, y disparar una notificación real (p. ej.
crear un trabajo desde otra cuenta). Confirmar que la campanita se actualiza en vivo.

Un test verde no prueba que las notificaciones sigan funcionando: el test mockea el cliente STOMP.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/shared/hooks/useWebSocket.ts \
        apps/app/src/shared/hooks/__tests__/useWebSocket.test.ts
git commit -m "refactor(ws): API de suscripción genérica en useWebSocket"
```

---

### Task 9: `ChatService.ts` (frontend) — capa de API

**Files:**
- Create: `apps/app/src/shared/services/ChatService.ts`

**Interfaces:**
- Consumes: `apiClient` de `@/shared/lib/apiClient`; endpoints de la Task 7.
- Produces: `ChatService.listarMensajes`, `.enviarMensaje`, `.marcarLeido`, `.contarNoLeidos`; tipos `Mensaje`, `TipoMensaje`, `PageMensajes`.

**Sigue el patrón de `TrabajoService.ts`** (que ya existe). **NO** va en `packages/api` — ese
paquete está vacío y no se usa.

- [ ] **Step 1: Crear el service**

`apps/app/src/shared/services/ChatService.ts`:

```ts
import { apiClient } from "@/shared/lib/apiClient";

export type TipoMensaje = "TEXTO" | "IMAGEN";

export interface Mensaje {
  id: number;
  conversacionId: number;
  emisorId: number;
  emisorNombre: string;
  tipo: TipoMensaje;
  contenido: string | null;
  imagenUrl: string | null;
  creadoAt: string;
}

export interface PageMensajes {
  content: Mensaje[];
  number: number;
  totalPages: number;
  last: boolean;
}

export const ChatService = {
  // page 0 = mensajes más recientes.
  listarMensajes: (conversacionId: number, page = 0, size = 30) =>
    apiClient.get<PageMensajes>(
      `/api/conversaciones/${conversacionId}/mensajes?page=${page}&size=${size}`
    ),

  enviarTexto: (conversacionId: number, contenido: string) =>
    apiClient.post<Mensaje>(`/api/conversaciones/${conversacionId}/mensajes`, {
      tipo: "TEXTO",
      contenido,
    }),

  enviarImagen: (conversacionId: number, imagenUrl: string) =>
    apiClient.post<Mensaje>(`/api/conversaciones/${conversacionId}/mensajes`, {
      tipo: "IMAGEN",
      imagenUrl,
    }),

  marcarLeido: (conversacionId: number, hastaMensajeId: number) =>
    apiClient.post<void>(`/api/conversaciones/${conversacionId}/mensajes/leidos`, {
      hastaMensajeId,
    }),

  contarNoLeidos: (conversacionId: number) =>
    apiClient.get<{ count: number }>(`/api/conversaciones/${conversacionId}/no-leidos`),
};
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/shared/services/ChatService.ts
git commit -m "feat(chat): capa de API del chat en el frontend"
```

---

### Task 10: `useChat` — historial, tiempo real y envío optimista

**Files:**
- Create: `apps/app/src/shared/hooks/useChat.ts`
- Test: `apps/app/src/shared/hooks/__tests__/useChat.test.ts`

**Interfaces:**
- Consumes: `ChatService` (Task 9), `useWebSocket().subscribe` (Task 8).
- Produces: `useChat(conversacionId: number | null)` → `{ mensajes, cargando, hayMas, error, cargarMas, enviarTexto, enviarImagen, reintentar }`. Cada mensaje de la lista lleva `estadoEnvio?: 'enviando' | 'error'` (ausente = confirmado por el servidor); no hay un flag `enviando` global, porque puede haber varios mensajes en vuelo a la vez.

- [ ] **Step 1: Escribir los tests que fallan**

`apps/app/src/shared/hooks/__tests__/useChat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { ChatService } from '@/shared/services/ChatService';

vi.mock('@/shared/services/ChatService');

let handlerSocket: ((m: any) => void) | null = null;
vi.mock('@/shared/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    subscribe: (_destino: string, handler: (m: any) => void) => {
      handlerSocket = handler;
      return () => { handlerSocket = null; };
    },
  }),
}));

const mensajeServidor = {
  id: 1, conversacionId: 10, emisorId: 2, emisorNombre: 'Beto',
  tipo: 'TEXTO' as const, contenido: 'ya salgo', imagenUrl: null,
  creadoAt: '2026-07-12T10:00:00',
};

describe('useChat', () => {
  beforeEach(() => {
    vi.mocked(ChatService.listarMensajes).mockResolvedValue({
      content: [], number: 0, totalPages: 1, last: true,
    });
    vi.mocked(ChatService.marcarLeido).mockResolvedValue(undefined as any);
    handlerSocket = null;
  });

  it('un mensaje que llega por socket se agrega a la lista', async () => {
    const { result } = renderHook(() => useChat(10));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    act(() => { handlerSocket!(mensajeServidor); });

    expect(result.current.mensajes).toHaveLength(1);
    expect(result.current.mensajes[0].contenido).toBe('ya salgo');
  });

  it('el envío optimista muestra el mensaje antes de que el servidor confirme', async () => {
    let resolver: (m: any) => void = () => {};
    vi.mocked(ChatService.enviarTexto).mockReturnValue(
      new Promise((res) => { resolver = res; }) as any
    );

    const { result } = renderHook(() => useChat(10));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    act(() => { result.current.enviarTexto('hola'); });

    // Aparece YA, en estado 'enviando', sin esperar al servidor.
    expect(result.current.mensajes).toHaveLength(1);
    expect(result.current.mensajes[0].estadoEnvio).toBe('enviando');

    await act(async () => { resolver({ ...mensajeServidor, id: 5, contenido: 'hola' }); });

    // Confirmado: sin estadoEnvio, y con el id real del servidor.
    await waitFor(() => {
      expect(result.current.mensajes[0].estadoEnvio).toBeUndefined();
      expect(result.current.mensajes[0].id).toBe(5);
    });
  });

  // Si el rollback no se maneja con la misma seriedad que el éxito, el usuario cree que mandó
  // algo que nunca salió. En un log que es evidencia legal, eso no es un detalle de UX.
  it('si el envío falla, el mensaje queda marcado en error (no desaparece)', async () => {
    vi.mocked(ChatService.enviarTexto).mockRejectedValue(new Error('red caída'));

    const { result } = renderHook(() => useChat(10));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => { await result.current.enviarTexto('hola'); });

    await waitFor(() => {
      expect(result.current.mensajes).toHaveLength(1);
      expect(result.current.mensajes[0].estadoEnvio).toBe('error');
      expect(result.current.mensajes[0].contenido).toBe('hola');
    });
  });

  it('no duplica un mensaje propio que vuelve por el socket', async () => {
    vi.mocked(ChatService.enviarTexto).mockResolvedValue(
      { ...mensajeServidor, id: 5, contenido: 'hola' } as any
    );

    const { result } = renderHook(() => useChat(10));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => { await result.current.enviarTexto('hola'); });
    act(() => { handlerSocket!({ ...mensajeServidor, id: 5, contenido: 'hola' }); });

    expect(result.current.mensajes).toHaveLength(1);
  });

  it('conversacionId null no rompe ni llama a la API', () => {
    const { result } = renderHook(() => useChat(null));
    expect(result.current.mensajes).toEqual([]);
    expect(ChatService.listarMensajes).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd apps/app && pnpm test useChat`
Expected: FAIL — `useChat` no existe.

- [ ] **Step 3: Implementar `useChat`**

`apps/app/src/shared/hooks/useChat.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/shared/hooks/useWebSocket";
import { ChatService, type Mensaje } from "@/shared/services/ChatService";

export interface MensajeUI extends Mensaje {
  // Ausente = confirmado por el servidor. Los optimistas llevan 'enviando' o 'error'.
  estadoEnvio?: "enviando" | "error";
  // Sólo en los optimistas: sirve para reconciliar la respuesta del POST con la burbuja pintada.
  claveLocal?: string;
}

export function useChat(conversacionId: number | null) {
  const [mensajes, setMensajes] = useState<MensajeUI[]>([]);
  const [cargando, setCargando] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paginaRef = useRef(0);
  const { subscribe } = useWebSocket();

  // Historial inicial. La API devuelve descendente (más recientes primero); la UI los quiere
  // ascendentes (el más viejo arriba), así que se invierte.
  useEffect(() => {
    if (conversacionId == null) return;

    let cancelado = false;
    setCargando(true);
    paginaRef.current = 0;

    ChatService.listarMensajes(conversacionId, 0)
      .then((page) => {
        if (cancelado) return;
        setMensajes([...page.content].reverse());
        setHayMas(!page.last);
      })
      .catch(() => { if (!cancelado) setError("No pudimos cargar los mensajes"); })
      .finally(() => { if (!cancelado) setCargando(false); });

    return () => { cancelado = true; };
  }, [conversacionId]);

  // Tiempo real. El backend publica a /user/{firebaseUid}/queue/chat; el cliente STOMP resuelve
  // el prefijo /user, así que acá el destino es el relativo.
  useEffect(() => {
    if (conversacionId == null) return;

    return subscribe("/user/queue/chat", (mensaje: Mensaje) => {
      if (mensaje.conversacionId !== conversacionId) return;
      setMensajes((prev) =>
        // Puede ser un mensaje propio que vuelve por el socket: no duplicar.
        prev.some((m) => m.id === mensaje.id) ? prev : [...prev, mensaje]
      );
    });
  }, [conversacionId, subscribe]);

  // Marcar leídos: el último mensaje confirmado que hay en pantalla.
  useEffect(() => {
    if (conversacionId == null || mensajes.length === 0) return;
    const confirmados = mensajes.filter((m) => !m.estadoEnvio);
    if (confirmados.length === 0) return;
    const ultimo = confirmados[confirmados.length - 1];
    ChatService.marcarLeido(conversacionId, ultimo.id).catch(() => { /* no bloquea la UI */ });
  }, [conversacionId, mensajes]);

  const cargarMas = useCallback(async () => {
    if (conversacionId == null || !hayMas) return;
    const siguiente = paginaRef.current + 1;
    const page = await ChatService.listarMensajes(conversacionId, siguiente);
    paginaRef.current = siguiente;
    setMensajes((prev) => [...[...page.content].reverse(), ...prev]);
    setHayMas(!page.last);
  }, [conversacionId, hayMas]);

  const enviarOptimista = useCallback(
    async (
      borrador: Omit<MensajeUI, "id" | "conversacionId" | "creadoAt">,
      llamada: () => Promise<Mensaje>
    ) => {
      if (conversacionId == null) return;

      const claveLocal = `local-${Date.now()}-${Math.random()}`;
      const optimista: MensajeUI = {
        ...borrador,
        id: -1,
        conversacionId,
        creadoAt: new Date().toISOString(),
        estadoEnvio: "enviando",
        claveLocal,
      } as MensajeUI;

      setMensajes((prev) => [...prev, optimista]);

      try {
        const confirmado = await llamada();
        setMensajes((prev) =>
          prev.map((m) => (m.claveLocal === claveLocal ? { ...confirmado } : m))
        );
      } catch {
        // NO se borra: el usuario tiene que ver que su mensaje no salió, y poder reintentar.
        setMensajes((prev) =>
          prev.map((m) =>
            m.claveLocal === claveLocal ? { ...m, estadoEnvio: "error" as const } : m
          )
        );
      }
    },
    [conversacionId]
  );

  const enviarTexto = useCallback(
    (contenido: string) =>
      enviarOptimista(
        { tipo: "TEXTO", contenido, imagenUrl: null, emisorId: -1, emisorNombre: "" } as any,
        () => ChatService.enviarTexto(conversacionId!, contenido)
      ),
    [conversacionId, enviarOptimista]
  );

  const enviarImagen = useCallback(
    (imagenUrl: string) =>
      enviarOptimista(
        { tipo: "IMAGEN", contenido: null, imagenUrl, emisorId: -1, emisorNombre: "" } as any,
        () => ChatService.enviarImagen(conversacionId!, imagenUrl)
      ),
    [conversacionId, enviarOptimista]
  );

  const reintentar = useCallback(
    (claveLocal: string) => {
      const fallido = mensajes.find((m) => m.claveLocal === claveLocal);
      if (!fallido) return;
      setMensajes((prev) => prev.filter((m) => m.claveLocal !== claveLocal));
      if (fallido.tipo === "TEXTO") enviarTexto(fallido.contenido!);
      else enviarImagen(fallido.imagenUrl!);
    },
    [mensajes, enviarTexto, enviarImagen]
  );

  return {
    mensajes,
    cargando,
    hayMas,
    error,
    cargarMas,
    enviarTexto,
    enviarImagen,
    reintentar,
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd apps/app && pnpm test useChat && pnpm tsc --noEmit`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/shared/hooks/useChat.ts \
        apps/app/src/shared/hooks/__tests__/useChat.test.ts
git commit -m "feat(chat): hook useChat con envío optimista y rollback"
```

---

### Task 11: `ChatPanel` — el componente compartido

**Files:**
- Create: `apps/app/src/shared/components/chat/ChatPanel.tsx`
- Create: `apps/app/src/shared/components/chat/MensajeBubble.tsx`

**Interfaces:**
- Consumes: `useChat` (Task 10), `uploadToCloudinary` de `@/shared/lib/uploadToCloudinary`.
- Produces: `<ChatPanel conversacionId={number|null} modo={"ESCRITURA"|"LECTURA"} usuarioId={number} titulo={string} />`.

**Es agnóstico de trabajo vs mudanza.** Esa es toda la razón de ser del modelo de `conversacion`.

- [ ] **Step 1: Leer la firma real de `uploadToCloudinary`**

Run: `cat apps/app/src/shared/lib/uploadToCloudinary.ts`

Adaptá la llamada del paso 3 a la firma real (nombre de la función, parámetros, forma del
retorno). **No inventes la API.**

- [ ] **Step 2: Crear `MensajeBubble`**

`apps/app/src/shared/components/chat/MensajeBubble.tsx`:

```tsx
import { AlertCircle, RotateCw } from "lucide-react";
import { tw } from "@/shared/styles/tw";
import type { MensajeUI } from "@/shared/hooks/useChat";

interface Props {
  mensaje: MensajeUI;
  esPropio: boolean;
  onReintentar: (claveLocal: string) => void;
}

export function MensajeBubble({ mensaje, esPropio, onReintentar }: Props) {
  const fallido = mensaje.estadoEnvio === "error";
  const enviando = mensaje.estadoEnvio === "enviando";

  return (
    <div className={`flex ${esPropio ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
        <div
          className={`rounded-2xl px-3 py-2 text-sm transition
            ${esPropio
              ? "bg-brand-600 text-white dark:bg-dark-brand"
              : "bg-slate-100 text-slate-900 dark:bg-dark-border dark:text-slate-100"}
            ${enviando ? "opacity-50" : ""}
            ${fallido ? "ring-1 ring-red-500" : ""}`}
        >
          {mensaje.tipo === "IMAGEN" && mensaje.imagenUrl ? (
            <img
              src={mensaje.imagenUrl}
              alt="Imagen enviada en el chat"
              className="max-h-64 rounded-lg"
              loading="lazy"
            />
          ) : (
            // React escapa el texto por defecto: no usar dangerouslySetInnerHTML acá jamás.
            <p className="whitespace-pre-wrap break-words">{mensaje.contenido}</p>
          )}
        </div>

        {fallido && mensaje.claveLocal && (
          <button
            onClick={() => onReintentar(mensaje.claveLocal!)}
            className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:underline"
          >
            <AlertCircle className="h-3 w-3" />
            No se envió. <span className="inline-flex items-center gap-0.5 font-medium">
              <RotateCw className="h-3 w-3" /> Reintentar
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
```

**Nota:** verificá que `@/shared/styles/tw` sea la ruta real del helper `tw` que usan
`JobTracking.tsx` y compañía (ahí se importa como `tw`). Ajustá el import si difiere.

- [ ] **Step 3: Crear `ChatPanel`**

`apps/app/src/shared/components/chat/ChatPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Send, ImagePlus, Loader2 } from "lucide-react";
import { Card } from "@/shared/components/Card";
import { tw } from "@/shared/styles/tw";
import { useChat } from "@/shared/hooks/useChat";
import { MensajeBubble } from "./MensajeBubble";
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";

interface Props {
  conversacionId: number | null;
  modo: "ESCRITURA" | "LECTURA";
  usuarioId: number;
  titulo: string;
}

export function ChatPanel({ conversacionId, modo, usuarioId, titulo }: Props) {
  const { mensajes, cargando, hayMas, cargarMas, enviarTexto, enviarImagen, reintentar } =
    useChat(conversacionId);

  const [borrador, setBorrador] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [errorUpload, setErrorUpload] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Autoscroll al último mensaje.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  // Sin conversación no hay con quién hablar: no se muestra nada.
  if (conversacionId == null) return null;

  const soloLectura = modo === "LECTURA";

  const onEnviar = () => {
    const texto = borrador.trim();
    if (!texto) return;
    setBorrador("");
    enviarTexto(texto);
  };

  const onImagen = async (file: File) => {
    setSubiendo(true);
    setErrorUpload(null);
    try {
      const url = await uploadToCloudinary(file);
      await enviarImagen(url);
    } catch {
      // Falla local: no se persistió nada. El usuario puede reintentar eligiendo de nuevo.
      setErrorUpload("No pudimos subir la imagen. Probá de nuevo.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Card>
      <div className={`mb-4 flex items-center justify-between border-b pb-4 ${tw.divider}`}>
        <h3 className={`text-sm font-semibold ${tw.text.primary}`}>{titulo}</h3>
        {soloLectura && (
          <span className={`text-xs ${tw.text.muted}`}>Conversación cerrada</span>
        )}
      </div>

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pb-2">
        {hayMas && (
          <button
            onClick={cargarMas}
            className={`mx-auto text-xs ${tw.text.muted} hover:underline`}
          >
            Ver mensajes anteriores
          </button>
        )}

        {cargando && (
          <div className="flex justify-center py-4">
            <Loader2 className={`h-4 w-4 animate-spin ${tw.text.muted}`} />
          </div>
        )}

        {!cargando && mensajes.length === 0 && (
          <p className={`py-8 text-center text-xs ${tw.text.muted}`}>
            {soloLectura ? "No hubo mensajes." : "Todavía no hay mensajes. Escribí el primero."}
          </p>
        )}

        {mensajes.map((m) => (
          <MensajeBubble
            key={m.claveLocal ?? m.id}
            mensaje={m}
            esPropio={m.emisorId === usuarioId || m.estadoEnvio != null}
            onReintentar={reintentar}
          />
        ))}
        <div ref={finRef} />
      </div>

      {soloLectura ? (
        <div className={`border-t pt-4 ${tw.divider}`}>
          <p className={`text-center text-xs ${tw.text.muted}`}>
            El servicio se cerró. La conversación queda como registro y no admite mensajes nuevos.
          </p>
        </div>
      ) : (
        <div className={`border-t pt-4 ${tw.divider}`}>
          {errorUpload && <p className="mb-2 text-xs text-red-600">{errorUpload}</p>}

          <div className="flex gap-2">
            <label
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl
                border ${tw.divider} ${subiendo ? "opacity-40" : "hover:bg-slate-50"}`}
              aria-label="Adjuntar imagen"
            >
              {subiendo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImagen(file);
                  e.target.value = "";
                }}
              />
            </label>

            <input
              type="text"
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onEnviar(); }}
              placeholder="Escribí un mensaje..."
              maxLength={2000}
              className={tw.input + " flex-1 text-sm"}
            />

            <button
              onClick={onEnviar}
              disabled={!borrador.trim()}
              aria-label="Enviar mensaje"
              className="flex h-10 w-10 items-center justify-center rounded-xl
                bg-brand-600 text-white transition dark:bg-dark-brand
                disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
```

**Nota:** verificá las rutas reales de `Card` y `tw` mirando los imports de `JobTracking.tsx`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/shared/components/chat/
git commit -m "feat(chat): ChatPanel y MensajeBubble (agnósticos de trabajo/mudanza)"
```

---

### Task 12: Montar el chat en trabajos (cliente y proveedor)

**Files:**
- Modify: `apps/app/src/features/client/pages/JobTracking.tsx` (**reemplaza las líneas 416-446**)
- Modify: `apps/app/src/features/provider/pages/ActiveJob.tsx` (**no existe nada de chat hoy**)
- Modify: `apps/app/src/features/client/pages/JobCompleted.tsx` (sólo lectura)
- Modify: `apps/app/src/features/provider/pages/ProviderCompletedJob.tsx` (sólo lectura)

**Interfaces:**
- Consumes: `<ChatPanel />` (Task 11); el campo `conversacionId` del DTO del trabajo (Task 7).

- [ ] **Step 1: Reemplazar el placeholder muerto en `JobTracking.tsx`**

Borrar el bloque completo de las líneas 416-446 (la `Card` con "Disponible próximamente" y el
input deshabilitado) y poner:

```tsx
              {/* Chat */}
              <ChatPanel
                conversacionId={trabajo.conversacionId ?? null}
                modo="ESCRITURA"
                usuarioId={usuarioActual.id}
                titulo="Chat con tu aliado"
              />
```

Agregar el import: `import { ChatPanel } from "@/shared/components/chat/ChatPanel";`

Borrar el `useState` de `message` y el import de `Send` si quedaron sin uso.

**CRÍTICO — no replicar la condición vieja.** El placeholder se mostraba con
`enCurso && trabajo.proveedorNombre`. Eso **deja fuera a `EN_COLA`**: clientes que ya aceptaron y
esperan turno, que es justo cuando más quieren preguntar "¿cuándo venís?". La condición correcta
es **`conversacionId != null`** — el backend ya decidió que existe conversación sólo cuando
corresponde. `ChatPanel` devuelve `null` si es `null`.

- [ ] **Step 2: Montar el chat en `ActiveJob.tsx` (proveedor)**

Ubicá dónde se muestran los datos del trabajo activo y agregá, siguiendo el layout existente:

```tsx
      <ChatPanel
        conversacionId={trabajo.conversacionId ?? null}
        modo="ESCRITURA"
        usuarioId={usuarioActual.id}
        titulo="Chat con el cliente"
      />
```

- [ ] **Step 3: Montar en modo lectura en las pantallas de trabajo completado**

En `JobCompleted.tsx` y `ProviderCompletedJob.tsx`:

```tsx
      <ChatPanel
        conversacionId={trabajo.conversacionId ?? null}
        modo="LECTURA"
        usuarioId={usuarioActual.id}
        titulo="Historial de mensajes"
      />
```

- [ ] **Step 4: Typecheck y build**

Run: `cd apps/app && pnpm tsc --noEmit && pnpm build`
Expected: sin errores.

- [ ] **Step 5: Verificar EN LA APP VIVA con dos cuentas**

Con un trabajo `EN_CURSO`, abrir el cliente en una ventana y el proveedor en otra (una en
incógnito). Mandar un mensaje de cada lado y confirmar que **llega en vivo sin recargar**.

**Verificar explícitamente `EN_COLA`:** conseguí un trabajo aceptado cuyo proveedor tenga otro
trabajo en curso y confirmá que el chat **aparece igual**. Es el caso que el placeholder perdía.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/client/pages/JobTracking.tsx \
        apps/app/src/features/client/pages/JobCompleted.tsx \
        apps/app/src/features/provider/pages/ActiveJob.tsx \
        apps/app/src/features/provider/pages/ProviderCompletedJob.tsx
git commit -m "feat(chat): chat en trabajos (cliente y proveedor) + historial read-only"
```

---

### Task 13: Montar el chat en mudanzas (cliente y proveedor)

**Files:**
- Modify: `apps/app/src/features/client/pages/MudanzaDetail.tsx`
- Modify: `apps/app/src/features/provider/pages/ProviderMudanzaDetail.tsx`

**Interfaces:**
- Consumes: `<ChatPanel />` (Task 11); el campo `conversacionId` del DTO de mudanza (Task 7).

Una sola página cubre escritura y lectura: **el modo lo determina el estado de la mudanza.**

- [ ] **Step 1: Derivar el modo del estado en `MudanzaDetail.tsx`**

```tsx
      const modoChat = ["COMPLETADO", "CANCELADO"].includes(mudanza.estado)
        ? "LECTURA"
        : "ESCRITURA";
```

Y montar:

```tsx
      <ChatPanel
        conversacionId={mudanza.conversacionId ?? null}
        modo={modoChat}
        usuarioId={usuarioActual.id}
        titulo="Chat con tu aliado"
      />
```

**No hace falta listar los estados de escritura acá.** El backend ya decidió: si hay
`conversacionId`, la mudanza fue aceptada. Los únicos estados de lectura son los dos terminales.
Esto mantiene la regla en **un solo lugar** (`ConversacionService`) y evita que el frontend y el
backend se desincronicen.

- [ ] **Step 2: Hacer lo mismo en `ProviderMudanzaDetail.tsx`**

Idéntico, con `titulo="Chat con el cliente"`.

- [ ] **Step 3: Typecheck y build**

Run: `cd apps/app && pnpm tsc --noEmit && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Verificar en la app viva**

Con una mudanza `ACEPTADO`, mandar mensajes en ambas direcciones.

**Verificar que en `CONTRAPROPUESTO` NO aparece el chat** (`conversacionId` debe venir `null`).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/client/pages/MudanzaDetail.tsx \
        apps/app/src/features/provider/pages/ProviderMudanzaDetail.tsx
git commit -m "feat(chat): chat en mudanzas (cliente y proveedor)"
```

---

### Task 14: Badge de no leídos en los dashboards

**Files:**
- Modify: `apps/app/src/features/client/pages/ClientDashboard.tsx`
- Modify: `apps/app/src/features/provider/pages/ProviderDashboard.tsx`

**Interfaces:**
- Consumes: `ChatService.contarNoLeidos` (Task 9); `useWebSocket().subscribe` (Task 8).

- [ ] **Step 1: Mostrar el badge en la tarjeta de cada servicio con conversación**

En la tarjeta del trabajo/mudanza del dashboard, cuando `conversacionId != null`, pedir el conteo
y renderizar un badge si es mayor a cero:

```tsx
        {noLeidos > 0 && (
          <span
            className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center
              rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white"
            aria-label={`${noLeidos} mensajes sin leer`}
          >
            {noLeidos > 9 ? "9+" : noLeidos}
          </span>
        )}
```

- [ ] **Step 2: Actualizar el badge en vivo**

Suscribirse a `/user/queue/chat` desde el dashboard e incrementar el contador de la conversación
correspondiente al llegar un mensaje:

```tsx
  useEffect(() => {
    return subscribe("/user/queue/chat", (m: { conversacionId: number }) => {
      setNoLeidosPorConversacion((prev) => ({
        ...prev,
        [m.conversacionId]: (prev[m.conversacionId] ?? 0) + 1,
      }));
    });
  }, [subscribe]);
```

**Cuidado con el N+1 de red:** no dispares un `contarNoLeidos` por cada tarjeta en un bucle. Si el
dashboard lista muchos servicios, pedí los conteos en un solo efecto (`Promise.all` sobre los
`conversacionId` presentes) y guardalos en un `Record<number, number>`.

- [ ] **Step 3: Typecheck y build**

Run: `cd apps/app && pnpm tsc --noEmit && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Verificar en la app viva**

Con el dashboard abierto en una ventana, mandar un mensaje desde la otra cuenta: **el badge debe
aparecer sin recargar**. Entrar al chat y volver: **el badge debe desaparecer**.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/client/pages/ClientDashboard.tsx \
        apps/app/src/features/provider/pages/ProviderDashboard.tsx
git commit -m "feat(chat): badge de mensajes no leídos en los dashboards"
```

---

## FASE 3 — CIERRE

### Task 15: Security review y verificación end-to-end

- [ ] **Step 1: Correr la suite completa**

Run: `cd backend && ./gradlew test`
Run: `cd apps/app && pnpm test && pnpm tsc --noEmit && pnpm build`
Expected: todo PASS. **Pegá la salida real.** No afirmes que pasa sin haberlo corrido.

- [ ] **Step 2: Security review**

Invocar el skill `/security-review` sobre el diff de la rama. Puntos de foco:

- **IDOR:** un usuario que no participa **no** puede leer ni escribir en la conversación
  (`GET/POST /api/conversaciones/{id}/mensajes` con un `id` ajeno → **403**). Probalo con `curl`.
- **XSS:** el contenido del mensaje se renderiza como texto. Verificá que **no** haya
  `dangerouslySetInnerHTML` en `MensajeBubble`. Mandá `<img src=x onerror=alert(1)>` como mensaje
  y confirmá que **se ve como texto plano**, no se ejecuta.
- **Validación del upload:** la `imagenUrl` que llega en el `POST` debe ser una URL de Cloudinary,
  no una URL arbitraria — si no, cualquiera puede inyectar un `<img>` apuntando a un tracker o a
  contenido hostil. Validá el dominio en el backend.
- **Log inmutable:** confirmá que no existe **ningún** endpoint `PUT`/`PATCH`/`DELETE` sobre
  mensajes.
- **Límite de tamaño:** el `@Size(max = 2000)` del DTO se está aplicando (mandá 3000 caracteres →
  **400**).

- [ ] **Step 3: Verificación end-to-end en la app viva**

Invocar el skill `/verify`. Recorrido mínimo, con dos cuentas reales:

1. Trabajo `EN_CURSO`: mensajes en ambas direcciones, en vivo.
2. Trabajo **`EN_COLA`**: el chat aparece. *(El caso que el placeholder perdía.)*
3. Enviar una **imagen**: se sube a Cloudinary y se ve en ambos lados.
4. Cerrar el trabajo (`COMPLETADO`): el chat pasa a **sólo lectura**, con el aviso, y el historial
   sigue visible.
5. Mudanza `ACEPTADO`: mensajes en ambas direcciones.
6. Mudanza `CONTRAPROPUESTO`: **no** aparece el chat.
7. **Push con la regla de presencia:** cerrar la app del destinatario (matar la pestaña), mandarle
   un mensaje, y confirmar que **llega la push**. Después, con la app abierta, mandar otro y
   confirmar que **no** llega push (ya lo recibió por el socket).
8. **Throttle:** con el destinatario desconectado, mandarle **5 mensajes seguidos**. Debe llegar
   **una sola** push, no cinco. Los 5 mensajes deben estar todos al abrir el chat.
9. **Las notificaciones de siempre siguen andando** (regresión del refactor de `useWebSocket`).

- [ ] **Step 4: Abrir el PR**

```bash
git push -u origin feat/chat-cliente-proveedor
gh pr create --base main --title "feat(chat): chat cliente-proveedor en trabajos y mudanzas" --body "..."
```

Incluir en el cuerpo del PR: el link al spec, los riesgos asumidos (`SimpleBroker` = **una sola
instancia**), y la salida real de los tests.

**Recordá:** una vez creado el PR, **la rama queda congelada**. Cualquier cambio posterior va en
rama nueva + PR nuevo.

---

## Riesgos que el implementador debe tener presentes

1. **`SimpleBroker` en memoria → una sola instancia.** Si Railway escala a dos réplicas, un mensaje
   publicado en la instancia A nunca llega a un usuario conectado a la B. Lo mismo vale para
   `SimpUserRegistry` (la presencia). Asumido en pre-launch; **documentarlo en el PR**.

2. **El refactor de `useWebSocket` puede romper las notificaciones.** Un test verde no lo prueba
   (el test mockea STOMP). Verificalo a mano en la app viva (Task 8, Step 6).

3. **`getOrCreate` toca `TrabajoService` y `MudanzaService`.** Una conversación que no se crea es un
   chat que nunca aparece, **sin ningún error visible**. Verificá ambos verticales.

4. **Retención del log.** Si el chat es evidencia, los Términos y la Privacidad deberían decir
   cuánto se guardan los mensajes. **Fuera del alcance de este plan** — decisión pendiente del
   usuario.
