package com.aliados.backend.controller;

import com.aliados.backend.config.GlobalExceptionHandler;
import com.aliados.backend.service.CloudinaryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A2 (auditoría 2026-07-16): un body sin "tipo" hacía TipoUpload.valueOf(null) → NPE.
 * El handler genérico ya lo convertía en 400, PERO como NPE es subclase de
 * RuntimeException lo reportaba a Sentry como bug y con mensaje opaco. Un body
 * inválido es error del cliente: 400 con mensaje claro y sin ruido en Sentry.
 * El assert del mensaje es lo que distingue el camino limpio (IllegalArgumentException
 * explícita) del NPE accidental.
 */
@ExtendWith(MockitoExtension.class)
class UploadControllerTest {

    @Mock CloudinaryService cloudinaryService;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new UploadController(cloudinaryService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void sinTipoDevuelve400ConMensajeClaro() throws Exception {
        mockMvc.perform(post("/api/uploads/signature")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("tipo")));
    }

    @Test
    void conTipoInvalidoDevuelve400() throws Exception {
        mockMvc.perform(post("/api/uploads/signature")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tipo\":\"CUALQUIERA\"}"))
                .andExpect(status().isBadRequest());
    }
}
