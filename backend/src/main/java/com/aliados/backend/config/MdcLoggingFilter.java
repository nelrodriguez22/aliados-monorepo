package com.aliados.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Puebla el MDC por request para que cada línea de log sea correlacionable:
 *
 *  - requestId: respeta el X-Request-Id entrante (proxies/Railway suelen mandarlo);
 *    si no viene, UUID corto (8 chars alcanzan para correlacionar). Se devuelve
 *    también como header de respuesta → el cliente puede reportar "mi request fue X".
 *  - uid: firebaseUid del SecurityContext (lo puso FirebaseAuthFilter — por eso este
 *    filtro se registra DESPUÉS de aquel en SecurityConfig). Es un id pseudonímico,
 *    coherente con la política de Sentry (id+rol, nunca email/nombre).
 *
 * El clear() del finally NO es opcional: los threads del pool se reusan, y sin
 * limpieza un request loguearía con el uid del anterior (fuga cruzada de contexto).
 *
 * Limitación aceptada (spec 2026-07-16): scheduler y mensajes STOMP no pasan por
 * filtros HTTP → esas líneas salen sin requestId/uid. Se propaga recién cuando duela.
 *
 * El formato JSON de salida NO vive acá: es el structured logging nativo de Boot 3.4,
 * activado por env var en Railway (LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs), que
 * incluye el MDC automáticamente. Sin la var, pattern legible de siempre.
 */
@Component
public class MdcLoggingFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Request-Id";

    // A1 (auditoría 2026-07-16): el header es input del cliente y termina en CADA línea de
    // log y reflejado en la respuesta. Allowlist estricta: un id que no sea corto y
    // alfanumérico se descarta y se genera uno propio — nadie pierde correlación legítima
    // (los proxies mandan UUIDs) y nadie puede empapelar los logs con basura arbitraria.
    private static final java.util.regex.Pattern ID_VALIDO =
            java.util.regex.Pattern.compile("[A-Za-z0-9_-]{1,64}");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String requestId = request.getHeader(HEADER);
        if (requestId == null || !ID_VALIDO.matcher(requestId).matches()) {
            requestId = UUID.randomUUID().toString().substring(0, 8);
        }

        try {
            MDC.put("requestId", requestId);
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.getName() != null) {
                MDC.put("uid", auth.getName());
            }
            response.setHeader(HEADER, requestId);

            filterChain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
