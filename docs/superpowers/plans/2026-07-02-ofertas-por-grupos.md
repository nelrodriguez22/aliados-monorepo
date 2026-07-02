# Ofertas por grupos + penalización de no-respuesta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ofrecer cada trabajo a grupos de 10 proveedores por score (5 min entre grupos, carrera dentro del grupo) y penalizar en el score a quien recibe la oferta y no responde.

**Architecture:** Nueva tabla `trabajo_oferta` (proveedor × trabajo) reemplaza el único `Trabajo.proveedorNotificadoId` y sirve además de historial para el score. El `TrabajoEscalationScheduler` (tick 60s existente) avanza de grupo. La toma se resuelve con un UPDATE condicional atómico. `ProviderScoreService` suma un 4º factor con peso configurable por feature flag.

**Tech Stack:** Java 21, Spring Boot 3.4.2, JPA/Hibernate, Flyway (Postgres), JUnit 5 + Mockito + AssertJ. Tests de persistencia via `@DataJpaTest` + Testcontainers (`@Tag("integration")`, corre en CI).

## Global Constraints

- Esquema **solo** por Flyway; Hibernate `ddl-auto=validate` (entidad y migración deben coincidir exactamente).
- Enums persistidos como **STRING** (`@Enumerated(EnumType.STRING)`), igual que `TrabajoEstado`.
- Config operativa y pesos de score van como **feature flags** (`value_type='NUMBER'`), seed idempotente `ON CONFLICT (key) DO NOTHING`, leídos con `featureFlagService.getNumber(key, default)`.
- Tests unitarios de servicio con `@ExtendWith(MockitoExtension.class)`, `@Mock` repos + `@InjectMocks TrabajoService`.
- Commits firmados (GPG ya configurado). Mensajes en español, imperativo.

---

### Task 1: Entidad `TrabajoOferta` + enum + migración de esquema y flags

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/entity/ResultadoOferta.java`
- Create: `backend/src/main/java/com/aliados/backend/entity/TrabajoOferta.java`
- Create: `backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java`
- Create: `backend/src/main/resources/db/migration/V7__ofertas_por_grupos.sql`
- Test: verificación via `backend/src/test/java/com/aliados/backend/SchemaMigrationIT.java` (ya existe; valida entidades vs Flyway en CI).

**Interfaces:**
- Produces: `TrabajoOferta{ Long id; Trabajo trabajo; User proveedor; Integer grupo; LocalDateTime ofrecidoAt; LocalDateTime respondioAt; ResultadoOferta resultado }`, `enum ResultadoOferta{ OFRECIDA, PROPUSO, DURMIO }`, `TrabajoOfertaRepository extends JpaRepository<TrabajoOferta, Long>`.

- [ ] **Step 1: Crear el enum**

```java
// ResultadoOferta.java
package com.aliados.backend.entity;

public enum ResultadoOferta {
    OFRECIDA, // oferta viva, ventana en curso, sin desenlace
    PROPUSO,  // el proveedor propuso (respondió)
    DURMIO    // ofertado y el trabajo se resolvió/avanzó sin su propuesta
}
```

- [ ] **Step 2: Crear la entidad**

```java
// TrabajoOferta.java
package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "trabajo_oferta",
       uniqueConstraints = @UniqueConstraint(name = "uq_trabajo_oferta_trabajo_proveedor",
               columnNames = {"trabajo_id", "proveedor_id"}))
@Data
public class TrabajoOferta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proveedor_id", nullable = false)
    private User proveedor;

    @Column(nullable = false)
    private Integer grupo;

    @CreationTimestamp
    @Column(name = "ofrecido_at", nullable = false, updatable = false)
    private LocalDateTime ofrecidoAt;

    @Column(name = "respondio_at")
    private LocalDateTime respondioAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ResultadoOferta resultado = ResultadoOferta.OFRECIDA;
}
```

- [ ] **Step 3: Crear el repositorio (vacío por ahora, se llena en tasks siguientes)**

```java
// TrabajoOfertaRepository.java
package com.aliados.backend.repository;

import com.aliados.backend.entity.TrabajoOferta;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrabajoOfertaRepository extends JpaRepository<TrabajoOferta, Long> {
}
```

- [ ] **Step 4: Escribir la migración (tabla + índices + flags)**

```sql
-- V7__ofertas_por_grupos.sql
-- Modelo de ofertas por grupos: reemplaza el único proveedor_notificado_id por N ofertas
-- por trabajo, y guarda el historial (PROPUSO/DURMIO) que alimenta el score.
CREATE TABLE trabajo_oferta (
    id            BIGSERIAL PRIMARY KEY,
    trabajo_id    BIGINT      NOT NULL REFERENCES trabajos(id),
    proveedor_id  BIGINT      NOT NULL REFERENCES users(id),
    grupo         INT         NOT NULL,
    ofrecido_at   TIMESTAMP   NOT NULL DEFAULT now(),
    respondio_at  TIMESTAMP,
    resultado     VARCHAR(20) NOT NULL DEFAULT 'OFRECIDA',
    CONSTRAINT uq_trabajo_oferta_trabajo_proveedor UNIQUE (trabajo_id, proveedor_id)
);
CREATE INDEX idx_trabajo_oferta_trabajo   ON trabajo_oferta (trabajo_id);
CREATE INDEX idx_trabajo_oferta_prov_res  ON trabajo_oferta (proveedor_id, resultado);

-- Backfill: cada trabajo PENDIENTE ya ofertado a un proveedor pasa a una fila OFRECIDA (grupo 1).
INSERT INTO trabajo_oferta (trabajo_id, proveedor_id, grupo, ofrecido_at, resultado)
SELECT id, proveedor_notificado_id, 1, COALESCE(notificado_at, now()), 'OFRECIDA'
FROM trabajos
WHERE estado = 'PENDIENTE' AND proveedor_notificado_id IS NOT NULL;

-- Config nueva (feature flags). Seed idempotente.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('trabajo_oferta_grupo_tamano', true, '10', 'NUMBER',
   'Cantidad de proveedores por grupo al ofrecer un trabajo.'),
  ('trabajo_oferta_grupo_intervalo_min', true, '5', 'NUMBER',
   'Minutos de espera por grupo antes de pasar al siguiente.'),
  ('score_peso_respuesta_ofertas', true, '0.20', 'NUMBER',
   'Peso de la tasa de respuesta a ofertas en el score (se normaliza).')
ON CONFLICT (key) DO NOTHING;
```

_Nota: el DROP de `proveedor_notificado_id`/`notificado_at` NO va acá — se hace en la Task 11, cuando ningún código los usa._

- [ ] **Step 5: Verificar que compila y el esquema valida (en CI con Docker)**

Run local: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL
Run en CI (o local con Docker): `./gradlew integrationTest`
Expected: `SchemaMigrationIT` PASS (Flyway aplica V7 y las entidades validan).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/entity/ResultadoOferta.java \
        backend/src/main/java/com/aliados/backend/entity/TrabajoOferta.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java \
        backend/src/main/resources/db/migration/V7__ofertas_por_grupos.sql
git commit -m "feat(ofertas): tabla trabajo_oferta + enum + migración y flags"
```

---

### Task 2: 4º factor de score (tasa de respuesta a ofertas)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/ProviderScoreService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java`

**Interfaces:**
- Consumes: `TrabajoOfertaRepository`, `ResultadoOferta`.
- Produces: `long TrabajoOfertaRepository.countByProveedorIdAndResultado(Long, ResultadoOferta)`; `double ProviderScoreService.combinarScore(calif, aceptacion, velocidad, respuestaOfertas, w1, w2, w3, w4)` (firma nueva, 4 factores).

- [ ] **Step 1: Escribir los tests que fallan**

```java
// añadir a ProviderScoreServiceTest.java (imita el estilo existente)
@Test
void combinarScore_conCuatroPesos_normaliza() {
    // 4 factores en 100, pesos iguales → 100
    double s = service.combinarScore(100, 100, 100, 100, 0.25, 0.25, 0.25, 0.25);
    assertThat(s).isEqualTo(100.0);
}

@Test
void combinarScore_sumaPesosCero_usaDefaults() {
    double s = service.combinarScore(100, 0, 0, 0, 0, 0, 0, 0);
    // defaults 0.40/0.35/0.25/0.20 → 100*0.40/1.20 = 33.33
    assertThat(s).isCloseTo(33.33, within(0.1));
}

@Test
void tasaRespuestaOfertas_sinDatos_neutral50() {
    when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.PROPUSO)).thenReturn(0L);
    when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.DURMIO)).thenReturn(0L);
    assertThat(service.calcularTasaRespuestaOfertas(7L)).isEqualTo(50.0);
}

@Test
void tasaRespuestaOfertas_calcula() {
    when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.PROPUSO)).thenReturn(3L);
    when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.DURMIO)).thenReturn(1L);
    assertThat(service.calcularTasaRespuestaOfertas(7L)).isEqualTo(75.0); // 3/(3+1)
}
```

Añadir `@Mock TrabajoOfertaRepository trabajoOfertaRepository;` al test y `import static org.assertj.core.api.Assertions.within;`, `import com.aliados.backend.entity.ResultadoOferta;`.

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.ProviderScoreServiceTest"`
Expected: FAIL — no compila (`combinarScore` de 4 args y `calcularTasaRespuestaOfertas` no existen).

- [ ] **Step 3: Añadir el count al repositorio**

```java
// TrabajoOfertaRepository.java
import com.aliados.backend.entity.ResultadoOferta;
long countByProveedorIdAndResultado(Long proveedorId, ResultadoOferta resultado);
```

- [ ] **Step 4: Implementar en ProviderScoreService**

Inyectar `@Autowired private TrabajoOfertaRepository trabajoOfertaRepository;`. Cambiar `calcularScore` y `combinarScore`:

```java
public double calcularScore(User proveedor) {
    double calificacionNorm   = calcularCalificacionNormalizada(proveedor);
    double tasaAceptacion     = calcularTasaAceptacion(proveedor.getId());
    double velocidadRespuesta = calcularVelocidadRespuesta(proveedor.getId());
    double respuestaOfertas   = calcularTasaRespuestaOfertas(proveedor.getId());

    double w1 = featureFlagService.getNumber("score_peso_calificacion", 0.40);
    double w2 = featureFlagService.getNumber("score_peso_aceptacion", 0.35);
    double w3 = featureFlagService.getNumber("score_peso_velocidad", 0.25);
    double w4 = featureFlagService.getNumber("score_peso_respuesta_ofertas", 0.20);
    return combinarScore(calificacionNorm, tasaAceptacion, velocidadRespuesta, respuestaOfertas, w1, w2, w3, w4);
}

double combinarScore(double calif, double aceptacion, double velocidad, double respuestaOfertas,
                     double w1, double w2, double w3, double w4) {
    double suma = w1 + w2 + w3 + w4;
    if (suma <= 0) {
        w1 = 0.40; w2 = 0.35; w3 = 0.25; w4 = 0.20; suma = 1.20;
    }
    return (calif * (w1 / suma)) + (aceptacion * (w2 / suma))
         + (velocidad * (w3 / suma)) + (respuestaOfertas * (w4 / suma));
}

/** Tasa de respuesta a ofertas: PROPUSO / (PROPUSO + DURMIO) * 100. Sin datos → 50 (neutral). */
double calcularTasaRespuestaOfertas(Long proveedorId) {
    long propuso = trabajoOfertaRepository.countByProveedorIdAndResultado(proveedorId, ResultadoOferta.PROPUSO);
    long durmio  = trabajoOfertaRepository.countByProveedorIdAndResultado(proveedorId, ResultadoOferta.DURMIO);
    long total = propuso + durmio;
    if (total == 0) return 50.0;
    return ((double) propuso / total) * 100.0;
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.ProviderScoreServiceTest"`
Expected: PASS (todos, incluidos los previos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/ProviderScoreService.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java \
        backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java
git commit -m "feat(score): 4º factor tasa de respuesta a ofertas (peso configurable)"
```

---

### Task 3: Ofrecer el siguiente grupo (helper) + `crearTrabajo`

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (reemplaza `notificarProveedorDisponible`, líneas 276-322; `crearTrabajo:109`)
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java` (nuevo)

**Interfaces:**
- Consumes: `userRepository.findProveedoresDisponibles(localidad, oficioId, maxTrabajos)`, `providerScoreService.ordenarPorScore(List<User>)`, `getLimiteTrabajos(Oficio)`, `trabajoOfertaRepository`.
- Produces: `void TrabajoService.ofrecerSiguienteGrupo(Trabajo trabajo)`; `List<TrabajoOferta> TrabajoOfertaRepository.findByTrabajoId(Long)`.

- [ ] **Step 1: Escribir el test que falla**

```java
// TrabajoOfertaGrupoTest.java — mismo header de mocks que TrabajoEscalacionTest,
// agregando @Mock TrabajoOfertaRepository trabajoOfertaRepository;
@Test
void ofrecerSiguienteGrupo_creaFilasOfrecidaYNotifica() {
    Trabajo t = pendiente(0, null); // helper como en TrabajoEscalacionTest
    when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(2.0);
    when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
    User p1 = proveedor(10L), p2 = proveedor(11L), p3 = proveedor(12L);
    when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
            .thenReturn(new java.util.ArrayList<>(List.of(p1, p2, p3)));
    when(providerScoreService.ordenarPorScore(anyList()))
            .thenAnswer(inv -> inv.getArgument(0)); // ya ordenado
    when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of());

    trabajoService.ofrecerSiguienteGrupo(t);

    // top 2 → 2 ofertas guardadas + 2 push
    verify(trabajoOfertaRepository, times(2)).save(any(TrabajoOferta.class));
    verify(notificacionService, times(2)).enviarNotificacion(anyString(), any(), anyString(), anyString(), anyLong(), anyString());
}
```

Añadir helper `proveedor(Long id)` que arma un `User` con ese id, oficio y firebaseUid.

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: FAIL — `ofrecerSiguienteGrupo` y `findByTrabajoId` no existen.

- [ ] **Step 3: Añadir la query al repositorio**

```java
// TrabajoOfertaRepository.java
import com.aliados.backend.entity.TrabajoOferta;
import java.util.List;
List<TrabajoOferta> findByTrabajoId(Long trabajoId);
```

- [ ] **Step 4: Implementar `ofrecerSiguienteGrupo` (reemplaza `notificarProveedorDisponible`)**

Borrar los dos métodos `notificarProveedorDisponible(...)` (276-322) y escribir:

```java
/**
 * Ofrece el trabajo al siguiente grupo de proveedores por score, excluyendo a los ya
 * ofertados. Inserta una fila OFRECIDA por proveedor y notifica. Si no queda nadie nuevo,
 * no hace nada (el caller decide cancelar).
 * @return true si ofreció a alguien; false si ya no hay proveedores nuevos.
 */
boolean ofrecerSiguienteGrupo(Trabajo trabajo) {
    String localidad = trabajo.getCliente().getLocalidad() != null ? trabajo.getCliente().getLocalidad() : "Rosario";
    int limite = getLimiteTrabajos(trabajo.getOficio());
    int tamano = (int) featureFlagService.getNumber("trabajo_oferta_grupo_tamano", 10);

    List<TrabajoOferta> previas = trabajoOfertaRepository.findByTrabajoId(trabajo.getId());
    java.util.Set<Long> yaOfertados = previas.stream().map(o -> o.getProveedor().getId()).collect(Collectors.toSet());
    int grupo = previas.stream().map(TrabajoOferta::getGrupo).max(Integer::compareTo).orElse(0) + 1;

    List<User> candidatos = new ArrayList<>(
            userRepository.findProveedoresDisponibles(localidad, trabajo.getOficio().getId(), limite));
    candidatos.removeIf(p -> yaOfertados.contains(p.getId()));
    if (candidatos.isEmpty()) {
        return false;
    }
    providerScoreService.ordenarPorScore(candidatos);
    List<User> grupoProveedores = candidatos.stream().limit(tamano).toList();

    for (User p : grupoProveedores) {
        TrabajoOferta of = new TrabajoOferta();
        of.setTrabajo(trabajo);
        of.setProveedor(p);
        of.setGrupo(grupo);
        of.setResultado(ResultadoOferta.OFRECIDA);
        trabajoOfertaRepository.save(of);

        notificacionService.enviarNotificacion(
                p.getFirebaseUid(),
                TipoNotificacion.NUEVO_TRABAJO,
                "Nueva Solicitud de Trabajo",
                "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                trabajo.getId(),
                "/proveedor/trabajo/" + trabajo.getId());
    }
    return true;
}
```

Cambiar `crearTrabajo:109` de `notificarProveedorDisponible(trabajo);` a `ofrecerSiguienteGrupo(trabajo);`. Agregar imports `ResultadoOferta`, `TrabajoOferta`, `java.util.Set`.

- [ ] **Step 5: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java
git commit -m "feat(ofertas): ofrecer trabajo por grupos de N (reemplaza notificación 1:1)"
```

---

### Task 4: Vista del proveedor (`getTrabajosPendientes`) por oferta OFRECIDA

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java:114-137`
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java`

**Interfaces:**
- Produces: `List<Trabajo> TrabajoRepository.findPendientesOfrecidosA(Long proveedorId, Long oficioId)`.

- [ ] **Step 1: Escribir el test que falla**

```java
@Test
void getTrabajosPendientes_devuelveLosOfrecidosAlProveedor() {
    User prov = proveedor(10L);
    when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
    Trabajo t = pendiente(0, null);
    when(trabajoRepository.findPendientesOfrecidosA(10L, prov.getOficio().getId())).thenReturn(List.of(t));

    List<TrabajoResponseDTO> res = trabajoService.getTrabajosPendientes("uid-10");

    assertThat(res).hasSize(1);
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: FAIL — `findPendientesOfrecidosA` no existe.

- [ ] **Step 3: Añadir la query**

```java
// TrabajoRepository.java
@Query("""
    SELECT t FROM Trabajo t
    JOIN TrabajoOferta o ON o.trabajo = t
    WHERE t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE
      AND t.oficio.id = :oficioId
      AND o.proveedor.id = :proveedorId
      AND o.resultado = com.aliados.backend.entity.ResultadoOferta.OFRECIDA
    """)
List<Trabajo> findPendientesOfrecidosA(@Param("proveedorId") Long proveedorId, @Param("oficioId") Long oficioId);
```

- [ ] **Step 4: Cambiar `getTrabajosPendientes`**

Reemplazar la línea que llama `findByEstadoAndOficioIdAndProveedorNotificadoId(...)` por:

```java
List<Trabajo> trabajos = trabajoRepository.findPendientesOfrecidosA(
        proveedor.getId(), proveedor.getOficio().getId());
```

- [ ] **Step 5: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java
git commit -m "feat(ofertas): proveedor ve trabajos por oferta OFRECIDA"
```

---

### Task 5: Toma con lock atómico (la carrera) en `proponerTrabajo`

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java:548-589`
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java`

**Interfaces:**
- Produces: `int TrabajoRepository.tomarTrabajoSiPendiente(Long id)`; `Optional<TrabajoOferta> TrabajoOfertaRepository.findByTrabajoIdAndProveedorId(Long, Long)`.

- [ ] **Step 1: Escribir los tests que fallan**

```java
@Test
void proponer_ganaLaCarrera_marcaPropusoYNotificaCliente() {
    User prov = proveedor(10L);
    when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
    Trabajo t = pendiente(0, null);
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    TrabajoOferta oferta = new TrabajoOferta();
    oferta.setProveedor(prov); oferta.setTrabajo(t); oferta.setResultado(ResultadoOferta.OFRECIDA);
    when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L)).thenReturn(Optional.of(oferta));
    when(trabajoRepository.tomarTrabajoSiPendiente(t.getId())).thenReturn(1);

    trabajoService.proponerTrabajo(t.getId(), "uid-10", 20, -32.9, -60.6, new java.math.BigDecimal("15000"));

    assertThat(oferta.getResultado()).isEqualTo(ResultadoOferta.PROPUSO);
    assertThat(oferta.getRespondioAt()).isNotNull();
    verify(notificacionService).enviarNotificacion(eq(t.getCliente().getFirebaseUid()), any(), anyString(), anyString(), anyLong(), anyString());
}

@Test
void proponer_pierdeLaCarrera_lanza409() {
    User prov = proveedor(11L);
    when(userRepository.findByFirebaseUid("uid-11")).thenReturn(Optional.of(prov));
    Trabajo t = pendiente(0, null);
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    TrabajoOferta oferta = new TrabajoOferta();
    oferta.setProveedor(prov); oferta.setTrabajo(t); oferta.setResultado(ResultadoOferta.OFRECIDA);
    when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 11L)).thenReturn(Optional.of(oferta));
    when(trabajoRepository.tomarTrabajoSiPendiente(t.getId())).thenReturn(0);

    assertThatThrownBy(() -> trabajoService.proponerTrabajo(t.getId(), "uid-11", 20, null, null, null))
            .hasMessageContaining("ya no está disponible");
}

@Test
void proponer_sinOferta_lanzaForbidden() {
    User prov = proveedor(12L);
    when(userRepository.findByFirebaseUid("uid-12")).thenReturn(Optional.of(prov));
    Trabajo t = pendiente(0, null);
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 12L)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> trabajoService.proponerTrabajo(t.getId(), "uid-12", 20, null, null, null))
            .isInstanceOf(ForbiddenException.class);
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: FAIL — `tomarTrabajoSiPendiente` / `findByTrabajoIdAndProveedorId` no existen.

- [ ] **Step 3: Añadir las queries**

```java
// TrabajoRepository.java
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

@Modifying(clearAutomatically = true, flushAutomatically = true)
@Transactional
@Query("""
    UPDATE Trabajo t SET t.estado = com.aliados.backend.entity.TrabajoEstado.PROPUESTO
    WHERE t.id = :id AND t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE
    """)
int tomarTrabajoSiPendiente(@Param("id") Long id);
```

```java
// TrabajoOfertaRepository.java
import java.util.Optional;
Optional<TrabajoOferta> findByTrabajoIdAndProveedorId(Long trabajoId, Long proveedorId);
```

- [ ] **Step 4: Reescribir `proponerTrabajo`**

```java
public TrabajoResponseDTO proponerTrabajo(Long trabajoId, String proveedorFirebaseUid,
                                          Integer tiempoEstimadoMinutos, Double latitud, Double longitud, BigDecimal tarifaVisita) {
    User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
            .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));
    Trabajo trabajo = trabajoRepository.findById(trabajoId)
            .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

    TrabajoOferta oferta = trabajoOfertaRepository.findByTrabajoIdAndProveedorId(trabajoId, proveedor.getId())
            .filter(o -> o.getResultado() == ResultadoOferta.OFRECIDA)
            .orElseThrow(() -> new ForbiddenException("No estás asignado a este trabajo"));

    // Lock atómico: solo uno de los N ofertados flipea PENDIENTE→PROPUESTO.
    if (trabajoRepository.tomarTrabajoSiPendiente(trabajoId) == 0) {
        throw new RuntimeException("El trabajo ya no está disponible");
    }
    trabajo = trabajoRepository.findById(trabajoId).orElseThrow();

    trabajo.setProveedor(proveedor);
    trabajo.setTiempoEstimadoMinutos(tiempoEstimadoMinutos);
    BigDecimal tarifaEfectiva = tarifaVisita != null ? tarifaVisita : new BigDecimal("15000");
    trabajo.setTarifaVisita(tarifaEfectiva);
    trabajo.setPropuestoAt(LocalDateTime.now());
    if (latitud != null && longitud != null) {
        trabajo.setLatitudProveedor(latitud);
        trabajo.setLongitudProveedor(longitud);
    }
    trabajo = trabajoRepository.save(trabajo);

    oferta.setResultado(ResultadoOferta.PROPUSO);
    oferta.setRespondioAt(LocalDateTime.now());
    trabajoOfertaRepository.save(oferta);

    String tarifaFmt = NumberFormat.getIntegerInstance(Locale.of("es", "AR")).format(tarifaEfectiva);
    notificacionService.enviarNotificacion(
            trabajo.getCliente().getFirebaseUid(),
            TipoNotificacion.PROPUESTA_RECIBIDA,
            "Propuesta de Profesional",
            proveedor.getNombre() + " puede llegar en " + tiempoEstimadoMinutos + " minutos. Tarifa de visita: $" + tarifaFmt,
            trabajo.getId(),
            "/cliente/propuesta/" + trabajo.getId());

    return mapToDTO(trabajo);
}
```

Añadir `@Autowired private TrabajoOfertaRepository trabajoOfertaRepository;` a `TrabajoService`.

- [ ] **Step 5: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java
git commit -m "feat(ofertas): toma con lock atómico (carrera) en proponerTrabajo"
```

---

### Task 6: Escalada por grupos + cancelación por agotamiento

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java:721-746` (`escalarUnTrabajo`)
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoEscalationScheduler.java:26-35`
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java`

**Interfaces:**
- Consumes: `ofrecerSiguienteGrupo(Trabajo)`, `aplicarCancelacion(Trabajo, String)`, `notificarCliente(...)`.
- Produces: `List<TrabajoOferta> TrabajoOfertaRepository.findByTrabajoIdAndResultado(Long, ResultadoOferta)`; `void TrabajoService.escalarUnTrabajo(Long trabajoId, int intervaloMin)` (firma nueva, un solo umbral).

- [ ] **Step 1: Escribir los tests que fallan**

```java
// en TrabajoEscalacionTest.java (agregar @Mock TrabajoOfertaRepository trabajoOfertaRepository;)
@Test
void escalar_grupoDurmio_marcaDurmioYAvanza() {
    Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(6));
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    TrabajoOferta o1 = ofrecida(t, proveedor(10L)), o2 = ofrecida(t, proveedor(11L));
    when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
            .thenReturn(List.of(o1, o2));
    // hay grupo siguiente
    when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
            .thenReturn(new java.util.ArrayList<>(List.of(proveedor(12L))));
    when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
    when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of(o1, o2));
    when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(10.0);

    trabajoService.escalarUnTrabajo(t.getId(), 5);

    assertThat(o1.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
    assertThat(o2.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
    verify(trabajoOfertaRepository, atLeastOnce()).save(argThat(o -> o.getResultado() == ResultadoOferta.OFRECIDA));
}

@Test
void escalar_sinMasProveedores_cancela() {
    Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(6));
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
            .thenReturn(List.of(ofrecida(t, proveedor(10L))));
    when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of(ofrecida(t, proveedor(10L))));
    when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
            .thenReturn(new java.util.ArrayList<>()); // nadie nuevo
    when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(10.0);

    trabajoService.escalarUnTrabajo(t.getId(), 5);

    assertThat(t.getEstado()).isEqualTo(TrabajoEstado.CANCELADO);
    verify(notificacionService).enviarNotificacion(eq(t.getCliente().getFirebaseUid()), eq(TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR), anyString(), anyString(), anyLong(), any());
}
```

Añadir helper `ofrecida(Trabajo t, User p)` → `TrabajoOferta` con `resultado=OFRECIDA`, `ofrecidoAt = t.notificado…` (usar `LocalDateTime.now().minusMinutes(6)` para que la ventana esté vencida).

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoEscalacionTest"`
Expected: FAIL — firma vieja de `escalarUnTrabajo(id,int,int)` y `findByTrabajoIdAndResultado` inexistente.

- [ ] **Step 3: Añadir la query**

```java
// TrabajoOfertaRepository.java
List<TrabajoOferta> findByTrabajoIdAndResultado(Long trabajoId, ResultadoOferta resultado);
```

- [ ] **Step 4: Reescribir `escalarUnTrabajo` y el scheduler**

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void escalarUnTrabajo(Long trabajoId, int intervaloMin) {
    Trabajo t = trabajoRepository.findById(trabajoId).orElse(null);
    if (t == null || t.getEstado() != TrabajoEstado.PENDIENTE) {
        return;
    }
    List<TrabajoOferta> grupoActual = trabajoOfertaRepository
            .findByTrabajoIdAndResultado(trabajoId, ResultadoOferta.OFRECIDA);
    // ofrecidoAt del grupo vivo (todas comparten ventana; tomamos la más reciente)
    LocalDateTime ref = grupoActual.stream()
            .map(TrabajoOferta::getOfrecidoAt)
            .max(LocalDateTime::compareTo)
            .orElse(t.getCreatedAt());
    if (ChronoUnit.MINUTES.between(ref, LocalDateTime.now()) < intervaloMin) {
        return; // la ventana del grupo actual sigue abierta
    }
    // El grupo durmió: finalizar sus ofertas y avanzar.
    for (TrabajoOferta o : grupoActual) {
        o.setResultado(ResultadoOferta.DURMIO);
        trabajoOfertaRepository.save(o);
    }
    boolean ofrecio = ofrecerSiguienteGrupo(t);
    if (ofrecio) {
        notificarCliente(t, TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR,
                "Seguimos buscando",
                "Seguimos buscando un profesional para tu pedido de " + t.getOficio().getNombre() + ".");
    } else {
        aplicarCancelacion(t, "No encontramos un profesional disponible");
        notificarCliente(t, TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR,
                "Pedido cancelado",
                "No encontramos un profesional disponible. Cancelamos tu pedido de "
                        + t.getOficio().getNombre() + "; podés volver a intentarlo.");
    }
}
```

```java
// TrabajoEscalationScheduler.java — escalar()
@Scheduled(fixedDelay = 60_000)
public void escalar() {
    int intervalo = (int) featureFlagService.getNumber("trabajo_oferta_grupo_intervalo_min", 5);
    for (Long id : trabajoService.idsTrabajosPendientes()) {
        try {
            trabajoService.escalarUnTrabajo(id, intervalo);
        } catch (Exception e) {
            logger.error("Error escalando trabajo {}: {}", id, e.getMessage(), e);
        }
    }
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoEscalacionTest"`
Expected: PASS. Ajustar los tests viejos de este archivo que usaban la firma `(id,t1,t2)` para que usen `(id, intervalo)` y el nuevo modelo.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoEscalationScheduler.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java
git commit -m "feat(ofertas): escalada por grupos cada 5min + cancelar al agotar proveedores"
```

---

### Task 7: Finalizar DURMIO al aceptar + reabrir grupo al rechazar

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java:591-651` (`aceptarPropuesta`), `653-690` (`rechazarPropuesta`)
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java`

**Interfaces:**
- Consumes: `trabajoOfertaRepository.findByTrabajoIdAndResultado`, `trabajoOfertaRepository.findByTrabajoIdAndProveedorId`, `ofrecerSiguienteGrupo`.

- [ ] **Step 1: Escribir los tests que fallan**

```java
@Test
void aceptar_finalizaOfrecidasRestantesComoDurmio() {
    // trabajo PROPUESTO con proveedor ganador + 1 oferta OFRECIDA restante
    Trabajo t = pendiente(0, null);
    t.setEstado(TrabajoEstado.PROPUESTO);
    User ganador = proveedor(10L); t.setProveedor(ganador);
    when(userRepository.findByFirebaseUid("uid-cli")).thenReturn(Optional.of(t.getCliente()));
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    when(trabajoRepository.countTrabajosActivosYCola(anyLong())).thenReturn(0);
    when(trabajoRepository.findTrabajoEnCursoByProveedorId(10L)).thenReturn(null);
    TrabajoOferta restante = ofrecida(t, proveedor(11L));
    when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
            .thenReturn(List.of(restante));

    trabajoService.aceptarPropuesta(t.getId(), "uid-cli");

    assertThat(restante.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
}

@Test
void rechazar_reabreAlRestoDelGrupo() {
    Trabajo t = pendiente(0, null);
    t.setEstado(TrabajoEstado.PROPUESTO);
    User rechazado = proveedor(10L); t.setProveedor(rechazado);
    when(userRepository.findByFirebaseUid("uid-cli")).thenReturn(Optional.of(t.getCliente()));
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    TrabajoOferta ofertaRechazado = new TrabajoOferta();
    ofertaRechazado.setProveedor(rechazado); ofertaRechazado.setTrabajo(t); ofertaRechazado.setResultado(ResultadoOferta.OFRECIDA);
    when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L)).thenReturn(Optional.of(ofertaRechazado));
    TrabajoOferta restante = ofrecida(t, proveedor(11L));
    when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
            .thenReturn(List.of(restante));

    trabajoService.rechazarPropuesta(t.getId(), "uid-cli");

    assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PENDIENTE);
    assertThat(ofertaRechazado.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
    // re-notifica al restante del grupo (no baja de grupo)
    verify(notificacionService).enviarNotificacion(eq(proveedor(11L).getFirebaseUid()), any(), anyString(), anyString(), anyLong(), anyString());
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: FAIL (aceptar no finaliza; rechazar aún llama al viejo flujo).

- [ ] **Step 3: Modificar `aceptarPropuesta`**

Después de `trabajo = trabajoRepository.save(trabajo);` (donde hoy setea EN_CURSO/EN_COLA, línea ~627); dejar por ahora las líneas `setNotificadoAt(null)`/`setProveedorNotificadoId(null)` si aún están (se limpian en la Task 9). Agregar:

```java
// El trabajo se tomó: las ofertas OFRECIDA restantes cuentan DURMIO (estricto).
for (TrabajoOferta o : trabajoOfertaRepository.findByTrabajoIdAndResultado(trabajo.getId(), ResultadoOferta.OFRECIDA)) {
    o.setResultado(ResultadoOferta.DURMIO);
    trabajoOfertaRepository.save(o);
}
```

- [ ] **Step 4: Reescribir `rechazarPropuesta` (reabrir al resto del grupo)**

Reemplazar el bloque final (desde `trabajo.setEstado(TrabajoEstado.PENDIENTE)` hasta `notificarProveedorDisponible(trabajo);`) por:

```java
// La oferta del rechazado cuenta DURMIO y queda fuera de este trabajo.
trabajoOfertaRepository.findByTrabajoIdAndProveedorId(trabajo.getId(), proveedorRechazado.getId())
        .ifPresent(o -> { o.setResultado(ResultadoOferta.DURMIO); trabajoOfertaRepository.save(o); });

trabajo.setEstado(TrabajoEstado.PENDIENTE);
trabajo.setProveedor(null);
trabajo.setTiempoEstimadoMinutos(null);
trabajo.setTarifaVisita(null);
trabajo.setLatitudProveedor(null);
trabajo.setLongitudProveedor(null);
trabajoRepository.save(trabajo);

// Reabrir al resto del grupo actual (OFRECIDA); si no queda nadie, avanzar de grupo.
List<TrabajoOferta> resto = trabajoOfertaRepository.findByTrabajoIdAndResultado(trabajo.getId(), ResultadoOferta.OFRECIDA);
if (resto.isEmpty()) {
    ofrecerSiguienteGrupo(trabajo);
} else {
    for (TrabajoOferta o : resto) {
        notificacionService.enviarNotificacion(
                o.getProveedor().getFirebaseUid(),
                TipoNotificacion.NUEVO_TRABAJO,
                "Trabajo disponible de nuevo",
                "Volvió a estar disponible un trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                trabajo.getId(),
                "/proveedor/trabajo/" + trabajo.getId());
    }
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java
git commit -m "feat(ofertas): aceptar finaliza durmió; rechazo reabre el grupo actual"
```

---

### Task 8: Reconciliar `rechazarTrabajo` (proveedor) y `asignarTrabajosAProveedorQueSeConecta`

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java:145-164` (`rechazarTrabajo`), `379-419` (`asignarTrabajosAProveedorQueSeConecta`)
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java`

**Interfaces:**
- Consumes: `trabajoOfertaRepository.findByTrabajoIdAndProveedorId`, `ofrecerSiguienteGrupo`, `trabajoRepository.findPendientesSinOfertaPara`.
- Produces: `List<Trabajo> TrabajoRepository.findPendientesSinOfertaPara(Long oficioId, Long proveedorId)`.

- [ ] **Step 1: Escribir los tests que fallan**

```java
@Test
void rechazarTrabajo_marcaOfertaDurmio() {
    User prov = proveedor(10L);
    when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
    Trabajo t = pendiente(0, null);
    when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
    TrabajoOferta oferta = new TrabajoOferta();
    oferta.setProveedor(prov); oferta.setTrabajo(t); oferta.setResultado(ResultadoOferta.OFRECIDA);
    when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L)).thenReturn(Optional.of(oferta));

    trabajoService.rechazarTrabajo(t.getId(), "uid-10");

    assertThat(oferta.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
}

@Test
void proveedorSeConecta_seSumaAlGrupoDeTrabajosSinOfertarle() {
    User prov = proveedor(10L);
    when(userRepository.findById(10L)).thenReturn(Optional.of(prov));
    when(trabajoRepository.countTrabajosActivosYCola(10L)).thenReturn(0);
    when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
    Trabajo t = pendiente(0, null);
    when(trabajoRepository.findPendientesSinOfertaPara(t.getOficio().getId(), 10L)).thenReturn(List.of(t));

    trabajoService.asignarTrabajosAProveedorQueSeConecta(prov);

    verify(trabajoOfertaRepository).save(argThat(o -> o.getProveedor().getId().equals(10L)
            && o.getResultado() == ResultadoOferta.OFRECIDA));
    verify(notificacionService).enviarNotificacion(eq(prov.getFirebaseUid()), any(), anyString(), anyString(), anyLong(), anyString());
}
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: FAIL — `findPendientesSinOfertaPara` no existe; `rechazarTrabajo` aún usa el modelo viejo.

- [ ] **Step 3: Añadir la query**

```java
// TrabajoRepository.java
@Query("""
    SELECT t FROM Trabajo t
    WHERE t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE
      AND t.oficio.id = :oficioId
      AND NOT EXISTS (SELECT 1 FROM TrabajoOferta o WHERE o.trabajo = t AND o.proveedor.id = :proveedorId)
    """)
List<Trabajo> findPendientesSinOfertaPara(@Param("oficioId") Long oficioId, @Param("proveedorId") Long proveedorId);
```

- [ ] **Step 4: Modificar `rechazarTrabajo`**

Leer el método actual (145-164) y reemplazar el bloqueo que setea `proveedorNotificadoId`/llama `notificarProveedorDisponible(trabajo, excluir)` por:

```java
trabajoOfertaRepository.findByTrabajoIdAndProveedorId(trabajoId, proveedor.getId())
        .ifPresent(o -> { o.setResultado(ResultadoOferta.DURMIO); trabajoOfertaRepository.save(o); });
// El trabajo sigue PENDIENTE con el resto del grupo; el scheduler avanza si nadie responde.
```

- [ ] **Step 5: Reescribir `asignarTrabajosAProveedorQueSeConecta` (sumar al grupo en vez de asignar directo)**

Reemplazar el bucle que setea `proveedorNotificadoId` por: insertar una fila `OFRECIDA` (grupo del trabajo = max actual, o 1) para cada trabajo `findPendientesSinOfertaPara`, respetando capacidad, + notificar. Cambiar `findTrabajosPendientesSinAsignar(...)` por `findPendientesSinOfertaPara(oficioId, proveedorId)`:

```java
List<Trabajo> candidatos = trabajoRepository.findPendientesSinOfertaPara(proveedor.getOficio().getId(), proveedor.getId());
for (Trabajo trabajo : candidatos) {
    if (trabajoRepository.countTrabajosActivosYCola(proveedor.getId()) >= limiteProveedor) break;
    int grupo = trabajoOfertaRepository.findByTrabajoId(trabajo.getId()).stream()
            .map(TrabajoOferta::getGrupo).max(Integer::compareTo).orElse(0);
    TrabajoOferta of = new TrabajoOferta();
    of.setTrabajo(trabajo); of.setProveedor(proveedor);
    of.setGrupo(grupo == 0 ? 1 : grupo); of.setResultado(ResultadoOferta.OFRECIDA);
    trabajoOfertaRepository.save(of);
    notificacionService.enviarNotificacion(
            proveedor.getFirebaseUid(), TipoNotificacion.NUEVO_TRABAJO,
            "Nueva Solicitud de Trabajo",
            "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
            trabajo.getId(), "/proveedor/trabajo/" + trabajo.getId());
}
```

- [ ] **Step 6: Correr y ver pasar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.TrabajoOfertaGrupoTest"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoOfertaGrupoTest.java
git commit -m "feat(ofertas): rechazo del proveedor = durmió; conexión suma al grupo"
```

---

### Task 9: Velocidad de respuesta sobre `trabajo_oferta` + limpieza de columnas viejas

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java`
- Modify: `backend/src/main/java/com/aliados/backend/service/ProviderScoreService.java:122-134`
- Modify: `backend/src/main/java/com/aliados/backend/entity/Trabajo.java` (quitar `notificadoAt`, `proveedorNotificadoId`)
- Modify: `backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java` (quitar `findByEstadoAndOficioIdAndProveedorNotificadoId`, `findTrabajosPendientesSinAsignar` si quedan sin uso)
- Create: `backend/src/main/resources/db/migration/V8__drop_proveedor_notificado.sql`
- Test: `backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java`

**Interfaces:**
- Produces: `Double TrabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(Long)`.

- [ ] **Step 1: Escribir el test que falla**

```java
@Test
void velocidad_usaTrabajoOferta() {
    when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(7L)).thenReturn(10.0);
    when(featureFlagService.getNumber("score_tiempo_max_respuesta_min", 30.0)).thenReturn(30.0);
    // 10 min sobre 30 → (1 - 10/30)*100 = 66.6
    assertThat(service.calcularVelocidadRespuesta(7L)).isCloseTo(66.6, within(0.2));
}
```

(hacer `calcularVelocidadRespuesta` package-private para testear, como los otros.)

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && ./gradlew test --tests "com.aliados.backend.service.ProviderScoreServiceTest"`
Expected: FAIL — `getPromedioMinutosRespuestaByProveedorId` no existe.

- [ ] **Step 3: Añadir la query y usarla**

```java
// TrabajoOfertaRepository.java
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
@Query("""
    SELECT AVG(EXTRACT(EPOCH FROM (o.respondioAt - o.ofrecidoAt)) / 60.0)
    FROM TrabajoOferta o
    WHERE o.proveedor.id = :proveedorId AND o.resultado = com.aliados.backend.entity.ResultadoOferta.PROPUSO
      AND o.respondioAt IS NOT NULL
    """)
Double getPromedioMinutosRespuestaByProveedorId(@Param("proveedorId") Long proveedorId);
```

En `ProviderScoreService.calcularVelocidadRespuesta`, cambiar la fuente:

```java
double calcularVelocidadRespuesta(Long proveedorId) {
    Double promedioMinutos = trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(proveedorId);
    if (promedioMinutos == null) return 50.0;
    // ... resto igual (guard <=0 → 100, normalización con score_tiempo_max_respuesta_min)
}
```

- [ ] **Step 4: Quitar columnas viejas de la entidad y queries sin uso**

En `Trabajo.java` borrar `notificadoAt` (67-68) y `proveedorNotificadoId` (70-71). En `aceptarPropuesta` quitar las líneas `trabajo.setNotificadoAt(null)` / `setProveedorNotificadoId(null)`. En `TrabajoRepository` borrar `findByEstadoAndOficioIdAndProveedorNotificadoId`, `getPromedioTiempoRespuestaMinutosByProveedorId` (movida), y `findTrabajosPendientesSinAsignar` si ya nadie la usa (grep).

- [ ] **Step 5: Migración de drop**

```sql
-- V8__drop_proveedor_notificado.sql
-- Ya migrado a trabajo_oferta (V7 hizo el backfill de PENDIENTE en vuelo).
ALTER TABLE trabajos DROP COLUMN IF EXISTS proveedor_notificado_id;
ALTER TABLE trabajos DROP COLUMN IF EXISTS notificado_at;
```

- [ ] **Step 6: Correr toda la suite**

Run: `cd backend && ./gradlew test`
Expected: PASS (unitarios). En CI: `integrationTest` valida el esquema post-V8.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/repository/TrabajoOfertaRepository.java \
        backend/src/main/java/com/aliados/backend/service/ProviderScoreService.java \
        backend/src/main/java/com/aliados/backend/entity/Trabajo.java \
        backend/src/main/java/com/aliados/backend/repository/TrabajoRepository.java \
        backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/main/resources/db/migration/V8__drop_proveedor_notificado.sql \
        backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java
git commit -m "feat(ofertas): velocidad sobre trabajo_oferta + drop de columnas viejas"
```

---

## Self-Review

**Cobertura del spec:**
- Tabla `trabajo_oferta` + enum + índices → Task 1 ✓
- Backfill + flags nuevos → Task 1 ✓
- Ofrecer por grupos (top N, excluir ofertados) → Task 3 ✓
- Vista del proveedor → Task 4 ✓
- Carrera / lock atómico → Task 5 ✓
- Escalada 5min + cancelar al agotar → Task 6 ✓
- DURMIO al aceptar + reabrir al rechazar (cliente) → Task 7 ✓
- Rechazo del proveedor + conexión → Task 8 ✓
- 4º factor de score + peso admin → Task 2 ✓
- Velocidad sobre nueva tabla + drop columnas → Task 9 ✓
- Panel admin: los flags aparecen solos en `FeatureFlagsPanel` (no requiere código) ✓

**Frontend:** este plan es backend-only. La UX del cliente no cambia (sigue viendo una propuesta). Si aparece algún ajuste de copy en el front (ej. "trabajo disponible de nuevo"), es cosmético y fuera de alcance.

**Riesgos anotados:** el backfill de V7 asume que los PENDIENTE en vuelo tienen a lo sumo un proveedor notificado (cierto en el modelo viejo). Verificar en CI con `integrationTest` que V7+V8 aplican sobre una base con datos.
