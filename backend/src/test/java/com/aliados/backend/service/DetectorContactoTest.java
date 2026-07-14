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

    // El DNI argentino tiene 8 dígitos, igual que un fijo de CABA: son indistinguibles por
    // conteo de dígitos. Se eligió el piso de 9 dígitos en TELEFONO para NO marcar DNIs,
    // aceptando no detectar fijos de 8 dígitos. Este test es el que impide que alguien baje
    // el umbral de {8,} a {7,} "para que coincida con el comentario" y reintroduzca el
    // falso positivo de DNI.
    @Test
    void noDetectaDni() {
        assertThat(detector.contieneContacto("mi DNI es 35123456")).isFalse();
    }

    @Test
    void noDetectaDniConPuntos() {
        assertThat(detector.contieneContacto("DNI 35.123.456")).isFalse();
    }

    // El CUIT (11 dígitos) SÍ da falso positivo hoy, y es una decisión consciente, no un bug.
    // Un CUIT en un chat cliente-proveedor es raro (la plataforma ya maneja el pago), mientras
    // que montos y alturas aparecen todo el tiempo: el costo de este falso positivo es una fila
    // descartable en el panel de admin. Excluirlo por formato abriría un vector de evasión:
    // bastaría con escribir el teléfono con forma de CUIT para esquivar la detección. No
    // "arreglar" este test para que dé false.
    @Test
    void detectaCuit_falsoPositivoAceptado() {
        assertThat(detector.contieneContacto("mi CUIT es 20-12345678-9")).isTrue();
    }
}
