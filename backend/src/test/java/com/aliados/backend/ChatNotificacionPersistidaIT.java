package com.aliados.backend;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.NotificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.service.ChatService;
import com.aliados.backend.service.PresenciaService;
import com.aliados.backend.service.PushNotificationService;
import com.cloudinary.Cloudinary;
import com.google.firebase.FirebaseApp;
import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * REGRESIÓN DEL PUSH MUERTO — leer esto antes de "simplificar" este test.
 *
 * Durante el desarrollo del chat se movió por error {@code notificacionService
 * .enviarNotificacion(...)} —que es {@code @Transactional(REQUIRED)} y hace su propio
 * {@code notificacionRepository.save(...)}— adentro de un {@code @TransactionalEventListener
 * (phase = AFTER_COMMIT)}. En Spring eso NO funciona: ese listener corre en
 * {@code afterCompletion(STATUS_COMMITTED)}, DESPUÉS del commit real pero ANTES de que Spring
 * haga {@code doCleanupAfterCompletion()} — en esa ventana el {@code EntityManagerHolder} sigue
 * bindeado al hilo, así que {@code isExistingTransaction()} da {@code true} y el
 * {@code @Transactional(REQUIRED)} anidado "participa" de la transacción YA COMMITEADA en vez de
 * abrir una nueva: sin BEGIN ni COMMIT nuevos, el save de la Notificacion NUNCA persistía.
 * Encadenado, el {@code NotificacionCreatedEvent} que dispara ese save quedaba invocado con
 * {@code STATUS_UNKNOWN} (no {@code STATUS_COMMITTED}), así que su listener tampoco corría.
 * Resultado, en SILENCIO (Spring traga las excepciones de esos listeners): para un destinatario
 * desconectado no quedaba fila en {@code notificaciones}, ni WebSocket, ni push FCM.
 *
 * Los 215 tests unitarios (ver {@code ChatServiceTest}) seguían en verde durante todo esto,
 * porque ahí {@code NotificacionService} está mockeado: el mock registra la llamada y da igual
 * si el método de verdad hubiera persistido algo o no. El bug SÓLO existe contra un
 * {@code JpaTransactionManager} real. Por eso este test corre con {@code @SpringBootTest} (no
 * {@code @DataJpaTest}) contra un Postgres real de Testcontainers, con {@code NotificacionService}
 * y {@code NotificacionRepository} reales, y afirma sobre la FILA PERSISTIDA — no sobre una
 * llamada a un mock. Si alguna vez alguien vuelve a mover ese bloque al listener AFTER_COMMIT
 * (ya pasó una vez, ver el comentario largo en {@code ChatService#enviarMensaje} y en
 * {@code MensajeEventListener}), este test tiene que fallar.
 *
 * Requiere Docker (Testcontainers) → corre con {@code ./gradlew integrationTest}, no en la
 * suite unitaria por defecto (ver {@code SchemaMigrationIT} para el mismo patrón).
 */
@Tag("integration")
// webEnvironment = MOCK (default), NO NONE: SecurityConfig hace `.cors(cors -> cors.configure(http))`,
// que necesita el CorsConfigurationSource que Spring MVC arma desde el WebMvcConfigurer de CorsConfig.
// Con NONE no hay contexto MVC → ese bean no existe → NoSuchBeanDefinitionException al arrancar.
// El test llama a ChatService directo (no hace requests HTTP), así que el contexto web mock alcanza.
@SpringBootTest
@Testcontainers
@TestPropertySource(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate",
        // Sin defaults en application.properties (vienen de env vars en prod). Los beans reales
        // que las necesitan (ChatService.prefijoImagenPermitido, EmailService, GeocodingController)
        // siguen instanciándose de verdad en este contexto, así que sus @Value tienen que resolver
        // a algo aunque el colaborador externo (Cloudinary, Resend, Google Maps) esté mockeado o
        // simplemente no se ejercite en este test.
        "cloudinary.cloud-name=test-cloud",
        "cloudinary.api-key=test-key",
        "cloudinary.api-secret=test-secret",
        "resend.api-key=test-resend-key",
        "google.maps.api.key=test-google-maps-key",
})
class ChatNotificacionPersistidaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ChatService chatService;
    @Autowired UserRepository userRepository;
    @Autowired OficioRepository oficioRepository;
    @Autowired TrabajoRepository trabajoRepository;
    @Autowired ConversacionRepository conversacionRepository;
    @Autowired NotificacionRepository notificacionRepository;

    // Infraestructura externa: mockeada. Nada de esto es lo que este test tiene que probar, y
    // sin mockearla el contexto no podría arrancar (Firebase real exige credenciales; Cloudinary
    // pega a una API real) o el test dependería de un broker/FCM de verdad.
    @MockitoBean FirebaseApp firebaseApp;
    @MockitoBean FirebaseRemoteConfig firebaseRemoteConfig;
    @MockitoBean Cloudinary cloudinary;
    @MockitoBean SimpMessagingTemplate simpMessagingTemplate;
    @MockitoBean PushNotificationService pushNotificationService;

    // Presencia: NO es infraestructura externa (es lógica nuestra sobre SimpUserRegistry), pero
    // acá se mockea para poder simular a voluntad "conectado" y "desconectado" sin necesitar una
    // sesión STOMP real. NotificacionService y NotificacionRepository, en cambio, son justo lo
    // que este test tiene que ejercitar de verdad: NO se mockean.
    @MockitoBean PresenciaService presenciaService;

    private EnviarMensajeDTO dtoTexto(String texto) {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setTipo(TipoMensaje.TEXTO);
        dto.setContenido(texto);
        return dto;
    }

    /** Crea cliente + proveedor + un trabajo EN_CURSO (ventana de escritura) + su conversación. */
    private Conversacion crearConversacionEnCurso(String sufijo) {
        Oficio oficio = oficioRepository.findByActivoTrueAndExclusivoFalse().get(0);

        User cliente = new User();
        cliente.setFirebaseUid("uid-cliente-" + sufijo);
        cliente.setEmail("cliente-" + sufijo + "@test.com");
        cliente.setRole(UserRole.CLIENT);
        cliente.setNombre("Cliente " + sufijo);
        cliente = userRepository.save(cliente);

        User proveedor = new User();
        proveedor.setFirebaseUid("uid-proveedor-" + sufijo);
        proveedor.setEmail("proveedor-" + sufijo + "@test.com");
        proveedor.setRole(UserRole.PROVIDER);
        proveedor.setNombre("Proveedor " + sufijo);
        proveedor = userRepository.save(proveedor);

        Trabajo trabajo = new Trabajo();
        trabajo.setCliente(cliente);
        trabajo.setProveedor(proveedor);
        trabajo.setOficio(oficio);
        trabajo.setEstado(TrabajoEstado.EN_CURSO);
        trabajo.setDescripcion("Arreglo de prueba para el test de notificación de chat");
        trabajo.setDireccion("Calle Falsa 123");
        trabajo.setLatitudCliente(-32.9468);
        trabajo.setLongitudCliente(-60.6393);
        trabajo = trabajoRepository.save(trabajo);

        Conversacion conversacion = new Conversacion();
        conversacion.setTrabajo(trabajo);
        conversacion.setCliente(cliente);
        conversacion.setProveedor(proveedor);
        return conversacionRepository.save(conversacion);
    }

    // --- EL CASO QUE IMPORTA: destinatario desconectado → tiene que quedar la fila ---

    @Test
    void destinatarioDesconectado_persisteFilaDeNotificacionMensajeChat() {
        Conversacion conversacion = crearConversacionEnCurso("desconectado");
        User proveedor = conversacion.getProveedor();

        when(presenciaService.estaConectado(proveedor.getFirebaseUid())).thenReturn(false);

        chatService.enviarMensaje(conversacion.getId(), conversacion.getCliente().getFirebaseUid(),
                dtoTexto("hola, ¿estás?"));

        // La aserción es sobre la fila PERSISTIDA en `notificaciones`, no sobre una llamada a un
        // mock: eso es exactamente lo que el bug del push muerto rompía en silencio (ver el
        // comentario de clase). Si notificacionService.enviarNotificacion() volviera a correr
        // dentro de un listener AFTER_COMMIT, esta lista viene vacía y el test falla.
        List<Notificacion> notificaciones =
                notificacionRepository.findByUsuarioIdOrderByCreatedAtDesc(proveedor.getId());

        assertThat(notificaciones).isNotEmpty();
        Notificacion notificacion = notificaciones.get(0);
        assertThat(notificacion.getTipo()).isEqualTo(TipoNotificacion.MENSAJE_CHAT);
        assertThat(notificacion.getUsuario().getId()).isEqualTo(proveedor.getId());
    }

    // --- CASO COMPLEMENTARIO: destinatario conectado → no hace falta la fila (ya llega por WS) ---

    @Test
    void destinatarioConectado_noPersisteNotificacion() {
        Conversacion conversacion = crearConversacionEnCurso("conectado");
        User proveedor = conversacion.getProveedor();

        when(presenciaService.estaConectado(proveedor.getFirebaseUid())).thenReturn(true);

        chatService.enviarMensaje(conversacion.getId(), conversacion.getCliente().getFirebaseUid(),
                dtoTexto("hola, ¿estás?"));

        List<Notificacion> notificaciones =
                notificacionRepository.findByUsuarioIdOrderByCreatedAtDesc(proveedor.getId());

        assertThat(notificaciones).isEmpty();
    }
}
