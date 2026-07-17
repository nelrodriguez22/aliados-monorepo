package com.aliados.backend.config;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El MDC es lo que vuelve correlacionables los logs: sin requestId no se puede
 * reconstruir un request entre líneas, y sin la limpieza del finally un thread
 * reusado del pool loguearía con el uid del request ANTERIOR (fuga cruzada).
 */
class MdcLoggingFilterTest {

    private final MdcLoggingFilter filter = new MdcLoggingFilter();

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
        MDC.clear();
    }

    /** FilterChain fake que captura el MDC visto DURANTE la cadena (después del filtro, el MDC ya está limpio). */
    private FilterChain capturaMdc(AtomicReference<String> requestId, AtomicReference<String> uid) {
        return (req, res) -> {
            requestId.set(MDC.get("requestId"));
            uid.set(MDC.get("uid"));
        };
    }

    @Test
    void respetaElRequestIdEntrante() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "abc-123");
        AtomicReference<String> visto = new AtomicReference<>();

        filter.doFilter(request, new MockHttpServletResponse(), capturaMdc(visto, new AtomicReference<>()));

        assertThat(visto.get()).isEqualTo("abc-123");
    }

    @Test
    void sinHeaderGeneraUnId() throws Exception {
        AtomicReference<String> visto = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturaMdc(visto, new AtomicReference<>()));

        assertThat(visto.get()).isNotBlank();
    }

    @Test
    void devuelveElRequestIdComoHeaderDeRespuesta() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "abc-123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader("X-Request-Id")).isEqualTo("abc-123");
    }

    @Test
    void conAuthElUidVaAlMdc() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("uid-firebase-1", null, List.of()));
        AtomicReference<String> uid = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturaMdc(new AtomicReference<>(), uid));

        assertThat(uid.get()).isEqualTo("uid-firebase-1");
    }

    @Test
    void sinAuthNoHayUid() throws Exception {
        AtomicReference<String> uid = new AtomicReference<>();

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), capturaMdc(new AtomicReference<>(), uid));

        assertThat(uid.get()).isNull();
    }

    // A1 (auditoría 2026-07-16): el header es input del cliente y termina en CADA línea
    // de log y en la respuesta. Sin allowlist, 8KB de basura por request contaminan el
    // log entero. Un id que no matchea el formato esperado se descarta y se genera uno.

    @Test
    void unRequestIdConCaracteresRarosSeDescarta() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "abc\t123 {inyección}");
        AtomicReference<String> visto = new AtomicReference<>();

        filter.doFilter(request, new MockHttpServletResponse(), capturaMdc(visto, new AtomicReference<>()));

        assertThat(visto.get()).isNotBlank().doesNotContain("inyección");
    }

    @Test
    void unRequestIdKilometricoSeDescarta() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "a".repeat(65));
        AtomicReference<String> visto = new AtomicReference<>();

        filter.doFilter(request, new MockHttpServletResponse(), capturaMdc(visto, new AtomicReference<>()));

        assertThat(visto.get()).isNotBlank().hasSizeLessThan(65);
    }

    @Test
    void elMdcQuedaLimpioAunSiElDownstreamLanza() {
        FilterChain explota = (req, res) -> { throw new RuntimeException("boom"); };

        assertThatThrownBy(() ->
                filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), explota))
                .isInstanceOf(RuntimeException.class);

        assertThat(MDC.get("requestId")).isNull();
        assertThat(MDC.get("uid")).isNull();
    }
}
