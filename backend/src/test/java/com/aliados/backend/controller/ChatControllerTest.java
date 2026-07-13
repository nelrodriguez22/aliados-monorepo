package com.aliados.backend.controller;

import com.aliados.backend.config.GlobalExceptionHandler;
import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.dto.MarcarLeidoDTO;
import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.entity.TipoMensaje;
import com.aliados.backend.exception.ChatCerradoException;
import com.aliados.backend.service.ChatService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Standalone MockMvc + GlobalExceptionHandler real (no mockeado): el objetivo central de esta
 * clase es verificar de punta a punta que el mapeo de excepciones de ChatService a códigos HTTP
 * funciona (403 para IDOR, 409 para chat cerrado), no solo que ChatController delega bien.
 */
@ExtendWith(MockitoExtension.class)
class ChatControllerTest {

    @Mock
    ChatService chatService;

    MockMvc mockMvc;
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    // Authentication.getName() -> firebaseUid, igual que en producción (ver TrabajoController).
    Authentication authentication = new UsernamePasswordAuthenticationToken("uid-cliente", null, Collections.emptyList());

    @BeforeEach
    void setUp() {
        ChatController controller = new ChatController(chatService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private MensajeResponseDTO mensaje(long id) {
        MensajeResponseDTO dto = new MensajeResponseDTO();
        dto.setId(id);
        dto.setConversacionId(10L);
        dto.setEmisorId(1L);
        dto.setEmisorNombre("Ana");
        dto.setTipo(TipoMensaje.TEXTO);
        dto.setContenido("hola");
        return dto;
    }

    // --- felices ---

    @Test
    void listarMensajes_devuelve200ConLaPagina() throws Exception {
        // Pageable CONCRETO (no Pageable.unpaged(), que es lo que da el constructor de un solo
        // argumento): Pageable.unpaged() rompe la serialización Jackson porque getPageNumber()/
        // getPageSize() lanzan UnsupportedOperationException. En producción esto nunca pasa
        // porque el Page siempre viene de un findByConversacionIdOrderByIdDesc(id, pageable) con
        // un Pageable real.
        Page<MensajeResponseDTO> page =
                new PageImpl<>(List.of(mensaje(1L)), PageRequest.of(0, 30), 1);
        when(chatService.listarMensajes(eq(10L), eq("uid-cliente"), any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/conversaciones/10/mensajes").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(1));
    }

    @Test
    void listarMensajes_acotaElSizeMaximoA100() throws Exception {
        when(chatService.listarMensajes(eq(10L), eq("uid-cliente"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        mockMvc.perform(get("/api/conversaciones/10/mensajes")
                        .param("size", "10000")
                        .principal(authentication))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<Pageable> captor = org.mockito.ArgumentCaptor.forClass(Pageable.class);
        org.mockito.Mockito.verify(chatService).listarMensajes(eq(10L), eq("uid-cliente"), captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().getPageSize()).isEqualTo(100);
    }

    @Test
    void enviar_devuelve200ConElMensajeCreado() throws Exception {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setTipo(TipoMensaje.TEXTO);
        dto.setContenido("hola, ya llego");

        when(chatService.enviarMensaje(eq(10L), eq("uid-cliente"), any())).thenReturn(mensaje(5L));

        mockMvc.perform(post("/api/conversaciones/10/mensajes")
                        .principal(authentication)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5));
    }

    @Test
    void enviar_sinTipo_da400PorValidacion() throws Exception {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setContenido("hola"); // sin tipo -> @NotNull

        mockMvc.perform(post("/api/conversaciones/10/mensajes")
                        .principal(authentication)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void marcarLeido_devuelve204() throws Exception {
        MarcarLeidoDTO dto = new MarcarLeidoDTO();
        dto.setHastaMensajeId(7L);

        mockMvc.perform(post("/api/conversaciones/10/mensajes/leidos")
                        .principal(authentication)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isNoContent());
    }

    @Test
    void noLeidos_devuelveElCount() throws Exception {
        when(chatService.contarNoLeidos(10L, "uid-cliente")).thenReturn(3L);

        mockMvc.perform(get("/api/conversaciones/10/no-leidos").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(3));
    }

    // --- mapeo de excepciones de punta a punta (el punto crítico de esta tarea) ---

    @Test
    void securityException_delServicio_da403() throws Exception {
        when(chatService.listarMensajes(eq(10L), eq("uid-cliente"), any(Pageable.class)))
                .thenThrow(new SecurityException("No participás de esta conversación"));

        mockMvc.perform(get("/api/conversaciones/10/mensajes").principal(authentication))
                .andExpect(status().isForbidden());
    }

    @Test
    void chatCerradoException_alEnviar_da409() throws Exception {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setTipo(TipoMensaje.TEXTO);
        dto.setContenido("hola");

        when(chatService.enviarMensaje(eq(10L), eq("uid-cliente"), any()))
                .thenThrow(new ChatCerradoException("El servicio está cerrado: el chat es sólo lectura"));

        mockMvc.perform(post("/api/conversaciones/10/mensajes")
                        .principal(authentication)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isConflict());
    }

    @Test
    void illegalArgumentException_da400() throws Exception {
        when(chatService.contarNoLeidos(10L, "uid-cliente"))
                .thenThrow(new IllegalArgumentException("dato inválido"));

        mockMvc.perform(get("/api/conversaciones/10/no-leidos").principal(authentication))
                .andExpect(status().isBadRequest());
    }
}
