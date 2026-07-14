package com.aliados.backend.controller;

import com.aliados.backend.config.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Un {id} no numérico en la URL es entrada inválida del cliente, no un bug del servidor.
 *
 * El caso real: el frontend tenía una ruta rota que pedía GET /api/mudanzas/undefined. Eso
 * lanzaba MethodArgumentTypeMismatchException que, por ser subclase de RuntimeException, caía
 * en handleRuntimeException → se reportaba a Sentry como si fuera un bug nuestro, y devolvía
 * el mensaje crudo de Spring con los tipos Java adentro.
 *
 * Se usa un controller de juguete en vez de uno real: lo que se prueba es el mapeo del
 * GlobalExceptionHandler, y así el test no se rompe si mañana cambian las firmas de los
 * controllers de verdad.
 */
class PathParamInvalidoTest {

    @RestController
    static class ControllerDeJuguete {
        @GetMapping("/api/recursos/{id}")
        public String porId(@PathVariable Long id) {
            return "no debería llegar acá";
        }
    }

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ControllerDeJuguete())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @Test
    void unIdNoNumericoDevuelve400YNoRevientaConUn500() throws Exception {
        mockMvc.perform(get("/api/recursos/undefined").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("El parámetro 'id' no es válido"));
    }

    @Test
    void elMensajeDeErrorNoFiltraDetallesInternos() throws Exception {
        String cuerpo = mockMvc.perform(get("/api/recursos/pepe").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andReturn().getResponse().getContentAsString();

        // Spring, librado a su suerte, contesta con "Failed to convert value of type
        // 'java.lang.String' to required type 'java.lang.Long'". Eso le cuenta al mundo cómo
        // está hecho el backend por dentro; no tiene por qué salir de acá.
        org.junit.jupiter.api.Assertions.assertFalse(cuerpo.contains("java.lang"),
                "el error no debe exponer tipos internos de Java: " + cuerpo);
        org.junit.jupiter.api.Assertions.assertFalse(cuerpo.contains("NumberFormatException"),
                "el error no debe exponer nombres de excepciones internas: " + cuerpo);
    }
}
