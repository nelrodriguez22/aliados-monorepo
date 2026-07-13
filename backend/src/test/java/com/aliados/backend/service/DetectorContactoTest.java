package com.aliados.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DetectorContactoTest {

    private final DetectorContacto detector = new DetectorContacto();

    // --- DEBE detectar ---

    @Test
    void detectaCelularArgentinoConPrefijo() {
        assertThat(detector.contieneContacto("mi cel es 11 5555 4444")).isTrue();
    }

    @Test
    void detectaCelularPegado() {
        assertThat(detector.contieneContacto("llamame al 1155554444")).isTrue();
    }

    @Test
    void detectaCelularConGuiones() {
        assertThat(detector.contieneContacto("anotá: 11-5555-4444")).isTrue();
    }

    @Test
    void detectaEmail() {
        assertThat(detector.contieneContacto("escribime a juan.perez@gmail.com")).isTrue();
    }

    @Test
    void detectaTelefonoConPrefijoPais() {
        assertThat(detector.contieneContacto("+54 9 11 5555 4444")).isTrue();
    }

    // --- NO debe detectar (falsos positivos que ROMPERÍAN conversaciones legítimas) ---

    // El dominio del negocio está lleno de números. Un presupuesto NO es un teléfono.
    @Test
    void noDetectaMontoDePresupuesto() {
        assertThat(detector.contieneContacto("el presupuesto es $15000")).isFalse();
    }

    @Test
    void noDetectaMontoGrande() {
        assertThat(detector.contieneContacto("serían 150000 pesos en total")).isFalse();
    }

    @Test
    void noDetectaAlturaDeDireccion() {
        assertThat(detector.contieneContacto("Av. Rivadavia 4567, piso 3")).isFalse();
    }

    @Test
    void noDetectaHorario() {
        assertThat(detector.contieneContacto("paso entre las 14 y las 16")).isFalse();
    }

    @Test
    void noDetectaTextoNormal() {
        assertThat(detector.contieneContacto("dale, te espero. el portón está abierto")).isFalse();
    }

    @Test
    void toleraNull() {
        assertThat(detector.contieneContacto(null)).isFalse();
    }
}
