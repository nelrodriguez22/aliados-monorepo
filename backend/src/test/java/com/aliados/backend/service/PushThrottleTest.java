package com.aliados.backend.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class PushThrottleTest {

    // Reloj inyectable: sin esto habría que dormir el test 5 minutos para probar la ventana.
    private final AtomicReference<Instant> ahora = new AtomicReference<>(Instant.parse("2026-07-12T10:00:00Z"));
    private final PushThrottle throttle = new PushThrottle(ahora::get);

    @Test
    void primeraNotificacion_seEmite() {
        assertThat(throttle.deboNotificar(10L, 2L)).isTrue();
    }

    // El caso que motiva todo esto: 15 mensajes seguidos NO son 15 vibraciones.
    @Test
    void segundaNotificacionInmediata_seSuprime() {
        throttle.deboNotificar(10L, 2L);
        assertThat(throttle.deboNotificar(10L, 2L)).isFalse();
    }

    @Test
    void pasadaLaVentana_vuelveAEmitir() {
        throttle.deboNotificar(10L, 2L);
        ahora.set(ahora.get().plus(Duration.ofMinutes(6)));
        assertThat(throttle.deboNotificar(10L, 2L)).isTrue();
    }

    // El throttle es POR CONVERSACIÓN Y DESTINATARIO: silenciar una conversación no puede
    // silenciar otra, ni silenciar al cliente puede silenciar al proveedor.
    @Test
    void otraConversacion_noSeVeAfectada() {
        throttle.deboNotificar(10L, 2L);
        assertThat(throttle.deboNotificar(11L, 2L)).isTrue();
    }

    @Test
    void otroDestinatario_noSeVeAfectado() {
        throttle.deboNotificar(10L, 2L);
        assertThat(throttle.deboNotificar(10L, 3L)).isTrue();
    }

    @Test
    void supresionesConsecutivas_noAdelantanLaVentana() {
        // Verifica que intentos suprimidos NO resetean la ventana.
        // Si cada intento (incluso suprimido) moviera el reloj, una conversación activa
        // nunca volvería a notificar: cada mensaje nuevo empujaría la ventana hacia adelante.

        // t=0: primera push, debe emitir
        assertThat(throttle.deboNotificar(10L, 2L)).isTrue();

        // t=2min: dentro de la ventana, se suprime
        ahora.set(ahora.get().plus(Duration.ofMinutes(2)));
        assertThat(throttle.deboNotificar(10L, 2L)).isFalse();

        // t=4min: sigue suprimido, y la última push sigue siendo la de t=0
        ahora.set(ahora.get().plus(Duration.ofMinutes(2)));
        assertThat(throttle.deboNotificar(10L, 2L)).isFalse();

        // t=6min: han pasado 6 minutos desde la última push real (t=0).
        // La ventana de 5 minutos ya expiró, así que debe emitir.
        ahora.set(ahora.get().plus(Duration.ofMinutes(2)));
        assertThat(throttle.deboNotificar(10L, 2L)).isTrue();
    }
}
