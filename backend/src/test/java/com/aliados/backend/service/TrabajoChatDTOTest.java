package com.aliados.backend.service;

import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.Conversacion;
import com.aliados.backend.entity.ModoChat;
import com.aliados.backend.entity.Oficio;
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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * MINOR 2 del informe de chat: cubre el mapeo de conversacionId/chatModo a los DTO de
 * trabajos, tanto en el detalle (mapToDTO) como en los listados (mapToDTOOptimized), y
 * protege el batch (findByTrabajoIdIn) contra una regresión N+1 (un findByTrabajoId por
 * fila dentro del bucle, que degradaría el dashboard). También cubre el comportamiento
 * del MINOR 1: si ConversacionService.resolverModo() lanza IllegalStateException (estado
 * del padre no contemplado), el DTO degrada conversacionId Y chatModo a null en vez de
 * propagar la excepción y tumbar el listado entero.
 */
@ExtendWith(MockitoExtension.class)
class TrabajoChatDTOTest {

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

    private User cliente(long id, String uid) {
        User u = new User();
        u.setId(id);
        u.setFirebaseUid(uid);
        u.setRole(UserRole.CLIENT);
        u.setNombre("cliente-" + id);
        return u;
    }

    private Trabajo trabajo(long id, User cliente, TrabajoEstado estado) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        Trabajo t = new Trabajo();
        t.setId(id);
        t.setCliente(cliente);
        t.setOficio(oficio);
        t.setEstado(estado);
        return t;
    }

    private Conversacion conversacion(long id, Trabajo trabajo) {
        Conversacion c = new Conversacion();
        c.setId(id);
        c.setTrabajo(trabajo);
        return c;
    }

    // ── detalle (mapToDTO, usado por getTrabajoById) ────────────────────────────────────

    @Test
    void getTrabajoById_conConversacion_traeConversacionIdYChatModo() {
        User cli = cliente(1L, "cli");
        Trabajo t = trabajo(100L, cli, TrabajoEstado.EN_CURSO);
        Conversacion conv = conversacion(55L, t);

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cli));
        lenient().when(calificacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());
        when(conversacionRepository.findByTrabajoId(100L)).thenReturn(Optional.of(conv));
        when(conversacionService.resolverModo(conv)).thenReturn(ModoChat.ESCRITURA);

        TrabajoResponseDTO dto = trabajoService.getTrabajoById(100L, "cli");

        assertThat(dto.getConversacionId()).isEqualTo(55L);
        assertThat(dto.getChatModo()).isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void getTrabajoById_sinConversacion_dejaAmbosNull() {
        User cli = cliente(1L, "cli");
        Trabajo t = trabajo(100L, cli, TrabajoEstado.PENDIENTE);

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cli));
        lenient().when(calificacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());
        when(conversacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());

        TrabajoResponseDTO dto = trabajoService.getTrabajoById(100L, "cli");

        assertThat(dto.getConversacionId()).isNull();
        assertThat(dto.getChatModo()).isNull();
    }

    @Test
    void getTrabajoById_resolverModoLanza_degradaAmbosANullSinExplotar() {
        User cli = cliente(1L, "cli");
        Trabajo t = trabajo(100L, cli, TrabajoEstado.EN_CURSO);
        Conversacion conv = conversacion(55L, t);

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cli));
        lenient().when(calificacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());
        when(conversacionRepository.findByTrabajoId(100L)).thenReturn(Optional.of(conv));
        when(conversacionService.resolverModo(conv))
                .thenThrow(new IllegalStateException("estado no contemplado"));

        TrabajoResponseDTO dto = trabajoService.getTrabajoById(100L, "cli");

        assertThat(dto.getConversacionId()).isNull();
        assertThat(dto.getChatModo()).isNull();
    }

    // ── listados (mapToDTOOptimized + batch) ────────────────────────────────────────────

    @Test
    void getTrabajosByCliente_batchUnaSolaQuery_yNuncaFindByTrabajoId() {
        User cli = cliente(1L, "cli");
        Trabajo t1 = trabajo(101L, cli, TrabajoEstado.EN_CURSO);
        Trabajo t2 = trabajo(102L, cli, TrabajoEstado.PENDIENTE); // sin conversación
        Conversacion conv1 = conversacion(201L, t1);

        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cli));
        when(trabajoRepository.findByClienteFirebaseUidAndEstadoInOrderByCreatedAtDesc(eq("cli"), anyList()))
                .thenReturn(List.of(t1, t2));
        when(calificacionRepository.findByTrabajoIdIn(anyList())).thenReturn(List.of());
        when(conversacionRepository.findByTrabajoIdIn(anyList())).thenReturn(List.of(conv1));
        when(conversacionService.resolverModo(conv1)).thenReturn(ModoChat.ESCRITURA);

        List<TrabajoResponseDTO> dtos = trabajoService.getTrabajosByCliente("cli");

        assertThat(dtos).hasSize(2);
        TrabajoResponseDTO dto1 = dtos.stream().filter(d -> d.getId().equals(101L)).findFirst().orElseThrow();
        TrabajoResponseDTO dto2 = dtos.stream().filter(d -> d.getId().equals(102L)).findFirst().orElseThrow();
        assertThat(dto1.getConversacionId()).isEqualTo(201L);
        assertThat(dto1.getChatModo()).isEqualTo(ModoChat.ESCRITURA);
        assertThat(dto2.getConversacionId()).isNull();
        assertThat(dto2.getChatModo()).isNull();

        // El test que protege el N+1: el batch se llama UNA sola vez, y jamás el
        // findByTrabajoId por fila (la query que degradaría el dashboard con muchos trabajos).
        verify(conversacionRepository, times(1)).findByTrabajoIdIn(any());
        verify(conversacionRepository, never()).findByTrabajoId(any());
    }

    @Test
    void getTrabajosByCliente_resolverModoLanza_dtoQuedaConAmbosNullYElListadoNoExplota() {
        User cli = cliente(1L, "cli");
        Trabajo t1 = trabajo(101L, cli, TrabajoEstado.EN_CURSO);
        Conversacion conv1 = conversacion(201L, t1);

        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cli));
        when(trabajoRepository.findByClienteFirebaseUidAndEstadoInOrderByCreatedAtDesc(eq("cli"), anyList()))
                .thenReturn(List.of(t1));
        when(calificacionRepository.findByTrabajoIdIn(anyList())).thenReturn(List.of());
        when(conversacionRepository.findByTrabajoIdIn(anyList())).thenReturn(List.of(conv1));
        when(conversacionService.resolverModo(conv1))
                .thenThrow(new IllegalStateException(
                        "Conversación en un trabajo en estado XXX: no debería existir"));

        List<TrabajoResponseDTO> dtos = trabajoService.getTrabajosByCliente("cli");

        assertThat(dtos).hasSize(1);
        assertThat(dtos.get(0).getConversacionId()).isNull();
        assertThat(dtos.get(0).getChatModo()).isNull();
    }
}
