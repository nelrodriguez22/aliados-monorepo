# Structured Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logs correlacionables por request y por usuario (MDC), con formato JSON activable por env var sin tocar el repo.

**Architecture:** Structured logging nativo de Spring Boot 3.4 (se activa con `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs` en Railway; el formato ECS incluye el MDC automáticamente). Lo único que se programa es `MdcLoggingFilter`, registrado después de `FirebaseAuthFilter` para leer el `SecurityContext`.

**Tech Stack:** Spring Boot 3.4.2 (sin dependencias nuevas), JUnit 5, mocks de spring-test (`MockHttpServletRequest/Response`).

**Spec:** `docs/superpowers/specs/2026-07-16-structured-logging-design.md`

## Global Constraints

- Directorio backend: `/Users/nelrodriguez/proyectos/.pri/aliados/backend` — gradle ahí.
- CERO dependencias nuevas y CERO `logback-spring.xml` (decisión del spec: enfoque nativo Boot 3.4).
- Claves del MDC exactas: `requestId` y `uid` (las consumen queries futuras en el destino de logs).
- Header exacto: `X-Request-Id` (entrante respetado, saliente siempre).
- `MDC.clear()` en `finally` — obligatorio (threads del pool se reusan).
- Comentarios en español, densos en porqués. Commits en español, firmados GPG (si cuelga hay pinentry).

---

### Task 1: MdcLoggingFilter + registro + doc de activación

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/config/MdcLoggingFilter.java`
- Modify: `backend/src/main/java/com/aliados/backend/config/SecurityConfig.java` (constructor + `addFilterAfter`)
- Modify: `docs/backend/INFORME-MEJORAS-BACKEND.md` (activación en la sección Observabilidad)
- Test: `backend/src/test/java/com/aliados/backend/config/MdcLoggingFilterTest.java`

**Interfaces:**
- Consumes: `SecurityContextHolder` (el `FirebaseAuthFilter` deja un `Authentication` cuyo `getName()` es el firebaseUid).
- Produces: claves MDC `requestId`/`uid`; header de respuesta `X-Request-Id`. Nada más los consume dentro del repo.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/config/MdcLoggingFilterTest.java`:

```java
package com.aliados.backend.config;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El MDC es lo que vuelve correlacionables los logs: sin requestId no se puede
 * reconstruir un request entre líneas, y sin la limpieza del finally un thread
 * reusado del pool loguearía con el uid del request ANTERIOR (fuga cruzada).
 */
class MdcLoggingFilterTest {

    private final MdcLoggingFilter filter = new MdcLoggingFilter();

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
        MDC.clear();
    }

    /** FilterChain fake que captura el MDC visto DURANTE la cadena (después del filtro, el MDC ya está limpio). */
    private FilterChain capturaMdc(AtomicReference<String> requestId, AtomicReference<String> uid) {
        return (req, res) -> {
            requestId.set(MDC.get("requestId"));
            uid.set(MDC.get("uid"));
        };
    }

    @Test
    void respetaElRequestIdEntrante() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "abc-123");
        AtomicReference<String> visto = new AtomicReference<>();

        filter.doFilter(request, new MockHttpServletResponse(), capturaMdc(visto, new AtomicReference<>()));

        assertThat(visto.get()).isEqualTo("abc-123");
    }

    @Test
    void sinHeaderGeneraUnId() throws Exception {
        AtomicReference<String> visto = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturaMdc(visto, new AtomicReference<>()));

        assertThat(visto.get()).isNotBlank();
    }

    @Test
    void devuelveElRequestIdComoHeaderDeRespuesta() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "abc-123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader("X-Request-Id")).isEqualTo("abc-123");
    }

    @Test
    void conAuthElUidVaAlMdc() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("uid-firebase-1", null, List.of()));
        AtomicReference<String> uid = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturaMdc(new AtomicReference<>(), uid));

        assertThat(uid.get()).isEqualTo("uid-firebase-1");
    }

    @Test
    void sinAuthNoHayUid() throws Exception {
        AtomicReference<String> uid = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturaMdc(new AtomicReference<>(), uid));

        assertThat(uid.get()).isNull();
    }

    @Test
    void elMdcQuedaLimpioAunSiElDownstreamLanza() {
        FilterChain explota = (req, res) -> { throw new RuntimeException("boom"); };

        assertThatThrownBy(() ->
                filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), explota))
                .isInstanceOf(RuntimeException.class);

        assertThat(MDC.get("requestId")).isNull();
        assertThat(MDC.get("uid")).isNull();
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `./gradlew test --tests "com.aliados.backend.config.MdcLoggingFilterTest"`
Expected: FAIL de compilación — `MdcLoggingFilter` no existe.

- [ ] **Step 3: Implementar el filtro**

`backend/src/main/java/com/aliados/backend/config/MdcLoggingFilter.java`:

```java
package com.aliados.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Puebla el MDC por request para que cada línea de log sea correlacionable:
 *
 *  - requestId: respeta el X-Request-Id entrante (proxies/Railway suelen mandarlo);
 *    si no viene, UUID corto (8 chars alcanzan para correlacionar). Se devuelve
 *    también como header de respuesta → el cliente puede reportar "mi request fue X".
 *  - uid: firebaseUid del SecurityContext (lo puso FirebaseAuthFilter — por eso este
 *    filtro se registra DESPUÉS de aquel en SecurityConfig). Es un id pseudonímico,
 *    coherente con la política de Sentry (id+rol, nunca email/nombre).
 *
 * El clear() del finally NO es opcional: los threads del pool se reusan, y sin
 * limpieza un request loguearía con el uid del anterior (fuga cruzada de contexto).
 *
 * Limitación aceptada (spec 2026-07-16): scheduler y mensajes STOMP no pasan por
 * filtros HTTP → esas líneas salen sin requestId/uid. Se propaga recién cuando duela.
 *
 * El formato JSON de salida NO vive acá: es el structured logging nativo de Boot 3.4,
 * activado por env var en Railway (LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs), que
 * incluye el MDC automáticamente. Sin la var, pattern legible de siempre.
 */
@Component
public class MdcLoggingFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Request-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String requestId = request.getHeader(HEADER);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString().substring(0, 8);
        }

        try {
            MDC.put("requestId", requestId);
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.getName() != null) {
                MDC.put("uid", auth.getName());
            }
            response.setHeader(HEADER, requestId);

            filterChain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `./gradlew test --tests "com.aliados.backend.config.MdcLoggingFilterTest"`
Expected: PASS (6 tests).

- [ ] **Step 5: Registrar el filtro después de FirebaseAuthFilter**

En `SecurityConfig.java`: agregar el campo/parámetro y el `addFilterAfter`.

```java
    private final FirebaseAuthFilter firebaseAuthFilter;
    private final MdcLoggingFilter mdcLoggingFilter;

    public SecurityConfig(FirebaseAuthFilter firebaseAuthFilter, MdcLoggingFilter mdcLoggingFilter) {
        this.firebaseAuthFilter = firebaseAuthFilter;
        this.mdcLoggingFilter = mdcLoggingFilter;
    }
```

y en la cadena, reemplazar el cierre actual:

```java
                .addFilterBefore(firebaseAuthFilter,
                        UsernamePasswordAuthenticationFilter.class)
                // El MDC necesita el SecurityContext ya poblado (uid) → después del auth.
                .addFilterAfter(mdcLoggingFilter, FirebaseAuthFilter.class);
```

- [ ] **Step 6: Documentar la activación en el informe**

En `docs/backend/INFORME-MEJORAS-BACKEND.md`, al final de la sección `## Observabilidad (2026-06-19)` (antes de la sección de la decisión ELK), agregar:

```markdown
- **Structured logging (2026-07-16):** `MdcLoggingFilter` puebla `requestId` (header
  `X-Request-Id` respetado o UUID corto; se devuelve en la respuesta) y `uid` en el MDC.
  El JSON se activa SOLO por env var en Railway: `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs`
  (structured logging nativo de Boot 3.4, incluye MDC; rollback = borrar la var).
  Limitación: scheduler y STOMP no llevan MDC. Spec: 2026-07-16-structured-logging-design.md.
```

- [ ] **Step 7: Verificación integral**

Run: `./gradlew test`
Expected: PASS (suite completa; el registro en SecurityConfig compila y ningún test existente se ve afectado — el filtro es transparente).

Nota: el formato ECS solo se materializa cuando ARRANCA la app Spring (el structured
logging de Boot configura logback al boot, no en unit tests planos). La verificación
del JSON queda diferida al deploy: setear la env var en Railway y mirar una línea —
activable y reversible sin tocar el repo, riesgo mínimo. Los unit tests cubren lo que
sí es código nuestro: el MDC.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/config/MdcLoggingFilter.java \
        backend/src/main/java/com/aliados/backend/config/SecurityConfig.java \
        backend/src/test/java/com/aliados/backend/config/MdcLoggingFilterTest.java \
        docs/backend/INFORME-MEJORAS-BACKEND.md
git commit -m "feat(backend): MDC con requestId y uid por request + structured logging activable por env var"
```
