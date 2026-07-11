package com.aliados.backend.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CodigoProveedorTest {

    @Test
    void formateaElectricistaConPadding() {
        assertEquals("ELE-0047", CodigoProveedor.format("Electricista", 47L));
    }

    @Test
    void quitaAcentosDelPrefijo() {
        assertEquals("TEC-0047", CodigoProveedor.format("Técnico de electrodomésticos", 47L));
    }

    @Test
    void mudanzasUsaMud() {
        assertEquals("MUD-0003", CodigoProveedor.format("Mudanzas", 3L));
    }

    @Test
    void noTruncaIdsGrandes() {
        assertEquals("ELE-12345", CodigoProveedor.format("Electricista", 12345L));
    }

    @Test
    void oficioNuloDevuelveNull() {
        assertNull(CodigoProveedor.format(null, 47L));
    }

    @Test
    void idNuloDevuelveNull() {
        assertNull(CodigoProveedor.format("Electricista", null));
    }

    @Test
    void oficioSinLetrasDevuelveNull() {
        assertNull(CodigoProveedor.format("123 -- 456", 47L));
    }
}
