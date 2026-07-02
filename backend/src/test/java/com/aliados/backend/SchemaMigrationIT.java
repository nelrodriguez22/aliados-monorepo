package com.aliados.backend;

import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Test de integración de la capa de persistencia contra un Postgres real efímero
 * (Testcontainers → requiere Docker; corre con `./gradlew integrationTest`, no en la
 * suite unitaria por defecto).
 *
 * Reemplaza al viejo contextLoads (@SpringBootTest, que arrastraba Firebase/Cloudinary y
 * necesitaba toda la config externa). Verifica lo que de verdad rompe seguido:
 *  - que las migraciones Flyway apliquen sobre Postgres, y
 *  - que las entidades JPA validen contra el esquema resultante (ddl-auto=validate).
 * Si algo de eso está mal, el contexto no arranca y el test falla.
 */
@Tag("integration")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@TestPropertySource(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate",
})
class SchemaMigrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    UserRepository userRepository;

    @Test
    void flywayMigraYEntidadesValidanContraElEsquema() {
        // Que el contexto haya arrancado ya prueba Flyway + validación de entidades.
        // Un count trivial confirma además que la tabla mapeada existe y es consultable.
        assertThat(userRepository.count()).isGreaterThanOrEqualTo(0);
    }
}
