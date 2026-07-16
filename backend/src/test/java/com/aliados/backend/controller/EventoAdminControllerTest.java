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
