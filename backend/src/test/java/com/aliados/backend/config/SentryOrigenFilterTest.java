package com.aliados.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * El tag client_origin es lo que permite distinguir, en Sentry, un error disparado por un dev en
 * localhost de uno sufrido por un usuario real. Si el normalizador se rompe (o filtra la URL
 * entera con sus paths), el tag deja de servir para lo único que existe.
 */
class SentryOrigenFilterTest {

    @Test
    void distingueLaAppRealDeUnaMaquinaDeDesarrollo() {
        assertEquals("localhost:5173", SentryOrigenFilter.soloHost("http://localhost:5173"));
        assertEquals("aliados-app-22.web.app", SentryOrigenFilter.soloHost("https://aliados-app-22.web.app"));
    }

    @Test
    void seQuedaSoloConElHost() {
        // Un Referer trae la URL completa. El path puede arrastrar ids u otros datos, y
        // send-default-pii=false está puesto por algo: al tag va el host y nada más.
        assertEquals("localhost:5173",
                SentryOrigenFilter.soloHost("http://localhost:5173/cliente/seguimiento/32"));
        assertEquals("aliados-app-22.web.app",
                SentryOrigenFilter.soloHost("https://aliados-app-22.web.app/proveedor/trabajo-activo/32"));
    }

    @Test
    void sinOrigenNiRefererNoRompeNada() {
        // curl, un healthcheck o la app móvil no mandan Origin. No es sospechoso: se etiqueta.
        assertEquals(SentryOrigenFilter.DESCONOCIDO, SentryOrigenFilter.soloHost(null));
        assertEquals(SentryOrigenFilter.DESCONOCIDO, SentryOrigenFilter.soloHost(""));
        assertEquals(SentryOrigenFilter.DESCONOCIDO, SentryOrigenFilter.soloHost("   "));
    }

    @Test
    void unOrigenMalformadoNoTumbaElRequest() {
        // El tag es telemetría: pase lo que pase, el request tiene que seguir su curso.
        assertEquals(SentryOrigenFilter.DESCONOCIDO, SentryOrigenFilter.soloHost("no-es-una-url"));
        assertEquals(SentryOrigenFilter.DESCONOCIDO, SentryOrigenFilter.soloHost("http://"));
        assertEquals(SentryOrigenFilter.DESCONOCIDO, SentryOrigenFilter.soloHost(":::"));
    }
}
