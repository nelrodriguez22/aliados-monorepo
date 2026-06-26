# Config operativa como feature flags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover 7 valores operativos (comisión de mudanza, límites de trabajos, pesos del scoring) de constantes/`@Value` a feature flags NUMBER, tuneables sin redeploy.

**Architecture:** Migración V5 seedea 7 flags. Tres services se reconectan para leer del flag (mismo patrón que `mudanza_ratio`), con default prod-safe. Los pesos del scoring se auto-normalizan al leerlos. Sin frontend (los flags aparecen solos en el `FeatureFlagsPanel`).

**Tech Stack:** Spring Boot 3.4.2 (Java 21, Flyway), Mockito 5.14.

## Global Constraints

- Backend package `com.aliados.backend`; Java 21. Próxima migración Flyway: `V5`.
- 7 flags NUMBER (key = value): `mudanza_comision_porcentaje`=10, `limite_trabajos_default`=3, `limite_trabajos_flete`=8, `score_peso_calificacion`=0.40, `score_peso_aceptacion`=0.35, `score_peso_velocidad`=0.25, `score_tiempo_max_respuesta_min`=30.
- Lectura: `FeatureFlagService.getNumber(String key, double fallback)` (devuelve `double`; cae al fallback si el flag falta/está disabled/no parsea).
- Pesos del scoring: normalizar al leer (`peso/suma`); si `suma <= 0` usar 0.40/0.35/0.25 (guard).
- Backend tests SIN base de datos (Mockito, no `@SpringBootTest`) → corren en el CI.
- Sin frontend.

---

### Task 1: Migración V5 + comisión de mudanza

**Files:**
- Create: `backend/src/main/resources/db/migration/V5__config_flags_operativa.sql`
- Modify: `backend/src/main/java/com/aliados/backend/service/MudanzaService.java`

**Interfaces:**
- Produces: los 7 flags en la tabla `feature_flags`.

- [ ] **Step 1: Crear la migración**

`backend/src/main/resources/db/migration/V5__config_flags_operativa.sql`:
```sql
-- Config operativa como feature flags (NUMBER). Seed idempotente: no pisa runtime.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('mudanza_comision_porcentaje', true, '10', 'NUMBER',
   'Porcentaje de comisión sobre el monto de la mudanza.'),
  ('limite_trabajos_default', true, '3', 'NUMBER',
   'Máximo de trabajos simultáneos asignables a un proveedor.'),
  ('limite_trabajos_flete', true, '8', 'NUMBER',
   'Máximo de trabajos simultáneos para fletes.'),
  ('score_peso_calificacion', true, '0.40', 'NUMBER',
   'Peso de la calificación en el score de matching (se normaliza con los otros pesos).'),
  ('score_peso_aceptacion', true, '0.35', 'NUMBER',
   'Peso de la tasa de aceptación en el score (se normaliza).'),
  ('score_peso_velocidad', true, '0.25', 'NUMBER',
   'Peso de la velocidad de respuesta en el score (se normaliza).'),
  ('score_tiempo_max_respuesta_min', true, '30', 'NUMBER',
   'Minutos de referencia para normalizar la velocidad (30+ min → 0).')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Reconectar la comisión en MudanzaService**

En `backend/src/main/java/com/aliados/backend/service/MudanzaService.java`:
- Eliminar el campo (líneas ~56-57):
  ```java
      @Value("${app.mudanza.comision-porcentaje:10.00}")
      private BigDecimal comisionPorcentaje;
  ```
- En el punto de uso (la línea `mudanza.setComisionPorcentaje(comisionPorcentaje);`), reemplazar por:
  ```java
      BigDecimal comisionPorcentaje = BigDecimal.valueOf(
              featureFlagService.getNumber("mudanza_comision_porcentaje", 10.0));
      mudanza.setComisionPorcentaje(comisionPorcentaje);
  ```
  (`featureFlagService` ya está inyectado en esta clase; `BigDecimal` ya está importado.)
- Verificar si queda algún otro `@Value` en el archivo: `grep -c "@Value" MudanzaService.java`. Si da `0`, eliminar el import `import org.springframework.beans.factory.annotation.Value;`.

- [ ] **Step 3: Compilar**

Run: `cd backend && ./gradlew compileJava --no-daemon`
Expected: BUILD SUCCESSFUL (sin referencias colgadas al campo `comisionPorcentaje`)

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V5__config_flags_operativa.sql \
        backend/src/main/java/com/aliados/backend/service/MudanzaService.java
git commit -m "feat(backend): comisión de mudanza + flags operativos (V5)"
```

---

### Task 2: Límites de trabajos por proveedor (flags)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java`

**Interfaces:**
- Consumes: `FeatureFlagService.getNumber(String, double)`.
- Produces: `TrabajoService.getLimiteTrabajos(Oficio)` (ahora **package-private**, lee de flags).

- [ ] **Step 1: Inyectar FeatureFlagService y reconectar getLimiteTrabajos**

En `TrabajoService.java`:
- Agregar el campo inyectado (junto a los otros `@Autowired`):
  ```java
      @Autowired
      private FeatureFlagService featureFlagService;
  ```
- Reemplazar el método y eliminar las constantes `LIMITE_TRABAJOS_DEFAULT` / `LIMITE_TRABAJOS_FLETE`:
  ```java
      // package-private para test; lee los límites de feature flags.
      int getLimiteTrabajos(Oficio oficio) {
          if (oficio != null && oficio.getNombre().equalsIgnoreCase("Flete")) {
              return (int) featureFlagService.getNumber("limite_trabajos_flete", 8);
          }
          return (int) featureFlagService.getNumber("limite_trabajos_default", 3);
      }
  ```
  (Borrar las 2 líneas `private static final int LIMITE_TRABAJOS_DEFAULT = 3;` / `... FLETE = 8;`.)

- [ ] **Step 2: Actualizar TrabajoEscalacionTest (mock + tests de límites)**

En `backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java`:
- Agregar el mock que faltaba (`TrabajoService` ahora depende de él; sin esto `@InjectMocks` lo deja null y los tests de escalado que llaman `notificarProveedorDisponible`→`getLimiteTrabajos` tirarían NPE):
  ```java
      @Mock com.aliados.backend.service.FeatureFlagService featureFlagService;
  ```
  (Agregar junto a los otros `@Mock`. Por default devuelve `0.0` en `getNumber`, lo cual no rompe los tests de escalado existentes porque usan `anyInt()` para el límite.)
- Agregar dos tests de `getLimiteTrabajos` (necesita `import com.aliados.backend.entity.Oficio;` — ya está):
  ```java
      @Test
      void getLimiteTrabajos_flete_usaFlagFlete() {
          Oficio flete = new Oficio();
          flete.setNombre("Flete");
          when(featureFlagService.getNumber("limite_trabajos_flete", 8.0)).thenReturn(8.0);
          assertThat(trabajoService.getLimiteTrabajos(flete)).isEqualTo(8);
      }

      @Test
      void getLimiteTrabajos_otroOficio_usaFlagDefault() {
          Oficio plomeria = new Oficio();
          plomeria.setNombre("Plomería");
          when(featureFlagService.getNumber("limite_trabajos_default", 3.0)).thenReturn(3.0);
          assertThat(trabajoService.getLimiteTrabajos(plomeria)).isEqualTo(3);
      }
  ```

- [ ] **Step 3: Correr los tests**

Run: `cd backend && ./gradlew test --tests '*TrabajoEscalacionTest' --no-daemon`
Expected: PASS (los 6 de escalado + los 2 nuevos de límites). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/TrabajoService.java \
        backend/src/test/java/com/aliados/backend/service/TrabajoEscalacionTest.java
git commit -m "feat(backend): límites de trabajos por proveedor desde feature flags"
```

---

### Task 3: Pesos del scoring (flags + auto-normalización) — TDD

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/ProviderScoreService.java`
- Test: `backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java`

**Interfaces:**
- Consumes: `FeatureFlagService.getNumber(String, double)`.
- Produces: `ProviderScoreService.combinarScore(double calif, double aceptacion, double velocidad, double w1, double w2, double w3)` (**package-private**, pura, normaliza).

- [ ] **Step 1: Escribir el test que falla**

`backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java`:
```java
package com.aliados.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ProviderScoreServiceTest {

    // combinarScore es pura (no usa los campos inyectados) → se testea sin mocks.
    private final ProviderScoreService service = new ProviderScoreService();

    @Test
    void combinarScore_pesosPorDefecto() {
        // 80*0.40 + 60*0.35 + 40*0.25 = 32 + 21 + 10 = 63
        assertThat(service.combinarScore(80, 60, 40, 0.40, 0.35, 0.25)).isCloseTo(63.0, within(1e-9));
    }

    @Test
    void combinarScore_pesosQueNoSuman1_seNormalizan() {
        // 1/1/1 → cada uno cuenta 1/3 → (80 + 60 + 40) / 3 = 60
        assertThat(service.combinarScore(80, 60, 40, 1, 1, 1)).isCloseTo(60.0, within(1e-9));
    }

    @Test
    void combinarScore_pesosEnCero_usaDefaults() {
        // suma <= 0 → guard usa 0.40/0.35/0.25 → 63
        assertThat(service.combinarScore(80, 60, 40, 0, 0, 0)).isCloseTo(63.0, within(1e-9));
    }
}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && ./gradlew test --tests '*ProviderScoreServiceTest' --no-daemon`
Expected: FAIL (no compila: `combinarScore` no existe)

- [ ] **Step 3: Inyectar FeatureFlagService + extraer combinarScore + usar flags**

En `ProviderScoreService.java`:
- Agregar el campo inyectado (junto al `@Autowired TrabajoRepository`):
  ```java
      @Autowired
      private FeatureFlagService featureFlagService;
  ```
- Eliminar las constantes `PESO_CALIFICACION`, `PESO_TASA_ACEPTACION`, `PESO_VELOCIDAD_RESPUESTA`, `TIEMPO_MAX_RESPUESTA_MIN`.
- En `calcularScore(User proveedor)`, reemplazar el cálculo del `score` por una lectura de flags + `combinarScore`:
  ```java
          double w1 = featureFlagService.getNumber("score_peso_calificacion", 0.40);
          double w2 = featureFlagService.getNumber("score_peso_aceptacion", 0.35);
          double w3 = featureFlagService.getNumber("score_peso_velocidad", 0.25);
          double score = combinarScore(calificacionNorm, tasaAceptacion, velocidadRespuesta, w1, w2, w3);
  ```
- Agregar el método puro (package-private):
  ```java
      // Combina los 3 componentes con sus pesos, normalizando para que sumen 1.0.
      // Si la suma de pesos es <= 0, usa los pesos por defecto (guard).
      double combinarScore(double calif, double aceptacion, double velocidad,
                           double w1, double w2, double w3) {
          double suma = w1 + w2 + w3;
          if (suma <= 0) {
              w1 = 0.40; w2 = 0.35; w3 = 0.25; suma = 1.0;
          }
          return (calif * (w1 / suma)) + (aceptacion * (w2 / suma)) + (velocidad * (w3 / suma));
      }
  ```
- En `calcularVelocidadRespuesta(...)`, reemplazar `TIEMPO_MAX_RESPUESTA_MIN` por la lectura del flag. La línea:
  ```java
          double normalizado = (1.0 - (promedioMinutos / TIEMPO_MAX_RESPUESTA_MIN)) * 100.0;
  ```
  pasa a:
  ```java
          double tiempoMax = featureFlagService.getNumber("score_tiempo_max_respuesta_min", 30.0);
          double normalizado = (1.0 - (promedioMinutos / tiempoMax)) * 100.0;
  ```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && ./gradlew test --tests '*ProviderScoreServiceTest' --no-daemon`
Expected: PASS (3 tests). Luego `./gradlew compileJava --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aliados/backend/service/ProviderScoreService.java \
        backend/src/test/java/com/aliados/backend/service/ProviderScoreServiceTest.java
git commit -m "feat(backend): pesos del scoring desde feature flags (auto-normalizados)"
```

---

## Deploy notes

- Migración V5 aditiva (solo seed idempotente). Los 7 flags aparecen en el `FeatureFlagsPanel` (pestaña Configuración).
- Tras deployar, borrar de Railway la env var `APP_MUDANZA_COMISION_PORCENTAJE` (o `app.mudanza.comision-porcentaje`) si estuviera seteada — ya no se lee.
