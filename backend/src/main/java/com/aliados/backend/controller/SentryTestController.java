package com.aliados.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * ⚠️ TEMPORAL — endpoint para verificar que Sentry captura errores del backend.
 * Lanza una IllegalStateException (subclase de RuntimeException) que el
 * GlobalExceptionHandler envía a Sentry. BORRAR este archivo + la ruta permitAll
 * `/api/_sentry-test` en SecurityConfig una vez confirmado.
 */
@RestController
public class SentryTestController {

    @GetMapping("/api/_sentry-test")
    public String trigger() {
        throw new IllegalStateException("🔧 Sentry backend test — ignorar");
    }
}
