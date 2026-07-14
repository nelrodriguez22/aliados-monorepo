package com.aliados.backend.config;

import io.sentry.Sentry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;

/**
 * Etiqueta cada evento de Sentry con el ORIGEN del request (client_origin).
 *
 * El `environment` de Sentry siempre dice "production", y no miente: hay un solo backend. Pero
 * en pre-launch los devs corren el frontend en localhost apuntando a esa misma API, así que un
 * error disparado desde una máquina de desarrollo llega a Sentry indistinguible de uno sufrido
 * por un usuario real. Eso genera falsa urgencia y ensucia las métricas.
 *
 * Se usa el header Origin (con Referer como respaldo) en vez de un header propio tipo
 * X-Client-Env: el Origin lo pone el navegador, así que no hay forma de olvidarse de mandarlo
 * ni de que un cliente nuevo quede sin etiquetar.
 *
 * Se guarda SÓLO el host:puerto, nunca la URL completa: un Referer puede arrastrar paths con
 * ids u otros datos, y `sentry.send-default-pii=false` se mantiene por algo.
 */
@Component
public class SentryOrigenFilter extends OncePerRequestFilter {

    static final String DESCONOCIDO = "desconocido";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String origen = request.getHeader("Origin");
        if (origen == null || origen.isBlank()) {
            origen = request.getHeader("Referer");
        }
        final String tag = soloHost(origen);
        Sentry.configureScope(scope -> scope.setTag("client_origin", tag));

        filterChain.doFilter(request, response);
    }

    /**
     * "http://localhost:5173/cliente/dashboard" -> "localhost:5173"
     * "https://aliados-app-22.web.app"          -> "aliados-app-22.web.app"
     * null / basura                             -> "desconocido"
     *
     * Un request sin Origin ni Referer no es sospechoso: lo hace cualquier cliente que no sea un
     * navegador (curl, un healthcheck, la app móvil). Por eso se etiqueta y no se rechaza.
     */
    static String soloHost(String origen) {
        if (origen == null || origen.isBlank()) return DESCONOCIDO;
        try {
            URI uri = URI.create(origen.trim());
            String host = uri.getHost();
            if (host == null) return DESCONOCIDO;
            return uri.getPort() > 0 ? host + ":" + uri.getPort() : host;
        } catch (IllegalArgumentException e) {
            // Un Origin malformado no puede tumbar el request: es un dato de telemetría.
            return DESCONOCIDO;
        }
    }
}
