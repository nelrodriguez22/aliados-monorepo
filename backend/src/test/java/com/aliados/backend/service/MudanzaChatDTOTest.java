package com.aliados.backend.service;

import com.aliados.backend.dto.MudanzaResponseDTO;
import com.aliados.backend.entity.Conversacion;
import com.aliados.backend.entity.ModoChat;
import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEstado;
import com.aliados.backend.entity.MudanzaTier;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.MudanzaTierRepository;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * MINOR 2 del informe de chat (equivalente mudanzas de TrabajoChatDTOTest): cubre el mapeo
 * de conversacionId/chatModo a MudanzaResponseDTO, tanto en el detalle (mapToDTO de un solo
 * elemento) como en los listados (batch), y protege findByMudanzaIdIn contra una regresión
 * N+1 (un findByMudanzaId por fila dentro del bucle). También cubre el MINOR 1: si
 * ConversacionService.resolverModo() lanza IllegalStateException, el DTO degrada
 * conversacionId Y chatModo a null en vez de tumbar el listado completo.
 */
@ExtendWith(MockitoExtension.class)
class MudanzaChatDTOTest {

    @Mock MudanzaRepository mudanzaRepository;
    @Mock MudanzaTierRepository mudanzaTierRepository;
    @Mock UserRepository userRepository;
    @Mock NotificacionService notificacionService;
    @Mock CloudinaryService cloudinaryService;
    @Mock FeatureFlagService featureFlagService;
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;

    @InjectMocks MudanzaService mudanzaService;

    private User cliente(long id, String uid) {
        User u = new User();
        u.setId(id);
        u.setFirebaseUid(uid);
        u.setRole(UserRole.CLIENT);
        u.setNombre("cliente-" + id);
        return u;
    }

    private MudanzaTier tier() {
        MudanzaTier t = new MudanzaTier();
        t.setId(1L);
        t.setNombre("ORO");
        t.setEmoji("🥇");
        t.setPrecioBase(new BigDecimal("50000"));
        return t;
    }

    private Mudanza mudanza(long id, User cliente, MudanzaEstado estado) {
        Mudanza m = new Mudanza();
        m.setId(id);
        m.setCliente(cliente);
        m.setTier(tier());
        m.setEstado(estado);
        return m;
    }

    private Conversacion conversacion(long id, Mudanza mudanza) {
        Conversacion c = new Conversacion();
        c.setId(id);
        c.setMudanza(mudanza);
        return c;
    }

    // ── detalle (mapToDTO de un solo elemento, usado por getMudanzaById) ────────────────

    @Test
    void getMudanzaById_conConversacion_traeConversacionIdYChatModo() {
        User cli = cliente(1L, "cli");
        Mudanza m = mudanza(100L, cli, MudanzaEstado.ACEPTADO);
        Conversacion conv = conversacion(55L, m);

        when(mudanzaRepository.findById(100L)).thenReturn(Optional.of(m));
        when(conversacionRepository.findByMudanzaId(100L)).thenReturn(Optional.of(conv));
        when(conversacionService.resolverModo(conv)).thenReturn(ModoChat.ESCRITURA);

        MudanzaResponseDTO dto = mudanzaService.getMudanzaById(100L);

        assertThat(dto.getConversacionId()).isEqualTo(55L);
        assertThat(dto.getChatModo()).isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void getMudanzaById_sinConversacion_dejaAmbosNull() {
        User cli = cliente(1L, "cli");
        Mudanza m = mudanza(100L, cli, MudanzaEstado.PENDIENTE);

        when(mudanzaRepository.findById(100L)).thenReturn(Optional.of(m));
        when(conversacionRepository.findByMudanzaId(100L)).thenReturn(Optional.empty());

        MudanzaResponseDTO dto = mudanzaService.getMudanzaById(100L);

        assertThat(dto.getConversacionId()).isNull();
        assertThat(dto.getChatModo()).isNull();
    }

    @Test
    void getMudanzaById_resolverModoLanza_degradaAmbosANullSinExplotar() {
        User cli = cliente(1L, "cli");
        Mudanza m = mudanza(100L, cli, MudanzaEstado.ACEPTADO);
        Conversacion conv = conversacion(55L, m);

        when(mudanzaRepository.findById(100L)).thenReturn(Optional.of(m));
        when(conversacionRepository.findByMudanzaId(100L)).thenReturn(Optional.of(conv));
        when(conversacionService.resolverModo(conv))
                .thenThrow(new IllegalStateException("estado no contemplado"));

        MudanzaResponseDTO dto = mudanzaService.getMudanzaById(100L);

        assertThat(dto.getConversacionId()).isNull();
        assertThat(dto.getChatModo()).isNull();
    }

    // ── listados (batch) ─────────────────────────────────────────────────────────────────

    @Test
    void getMudanzasByCliente_batchUnaSolaQuery_yNuncaFindByMudanzaId() {
        User cli = cliente(1L, "cli");
        Mudanza m1 = mudanza(101L, cli, MudanzaEstado.ACEPTADO);
        Mudanza m2 = mudanza(102L, cli, MudanzaEstado.PENDIENTE); // sin conversación
        Conversacion conv1 = conversacion(201L, m1);

        when(mudanzaRepository.findByClienteFirebaseUidOrderByCreatedAtDesc("cli"))
                .thenReturn(List.of(m1, m2));
        when(conversacionRepository.findByMudanzaIdIn(anyList())).thenReturn(List.of(conv1));
        when(conversacionService.resolverModo(conv1)).thenReturn(ModoChat.ESCRITURA);

        List<MudanzaResponseDTO> dtos = mudanzaService.getMudanzasByCliente("cli");

        assertThat(dtos).hasSize(2);
        MudanzaResponseDTO dto1 = dtos.stream().filter(d -> d.getId().equals(101L)).findFirst().orElseThrow();
        MudanzaResponseDTO dto2 = dtos.stream().filter(d -> d.getId().equals(102L)).findFirst().orElseThrow();
        assertThat(dto1.getConversacionId()).isEqualTo(201L);
        assertThat(dto1.getChatModo()).isEqualTo(ModoChat.ESCRITURA);
        assertThat(dto2.getConversacionId()).isNull();
        assertThat(dto2.getChatModo()).isNull();

        // El test que protege el N+1: el batch se llama UNA sola vez, y jamás el
        // findByMudanzaId por fila (la query que degradaría el dashboard con muchas mudanzas).
        verify(conversacionRepository, times(1)).findByMudanzaIdIn(any());
        verify(conversacionRepository, never()).findByMudanzaId(any());
    }

    @Test
    void getMudanzasByCliente_resolverModoLanza_dtoQuedaConAmbosNullYElListadoNoExplota() {
        User cli = cliente(1L, "cli");
        Mudanza m1 = mudanza(101L, cli, MudanzaEstado.ACEPTADO);
        Conversacion conv1 = conversacion(201L, m1);

        when(mudanzaRepository.findByClienteFirebaseUidOrderByCreatedAtDesc("cli"))
                .thenReturn(List.of(m1));
        when(conversacionRepository.findByMudanzaIdIn(anyList())).thenReturn(List.of(conv1));
        when(conversacionService.resolverModo(conv1))
                .thenThrow(new IllegalStateException(
                        "Conversación en una mudanza en estado XXX: no debería existir"));

        List<MudanzaResponseDTO> dtos = mudanzaService.getMudanzasByCliente("cli");

        assertThat(dtos).hasSize(1);
        assertThat(dtos.get(0).getConversacionId()).isNull();
        assertThat(dtos.get(0).getChatModo()).isNull();
    }
}
