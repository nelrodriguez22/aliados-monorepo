package com.aliados.backend.service;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

/**
 * Evita que una ráfaga de mensajes se convierta en una ráfaga de vibraciones.
 * Como mucho una push por (conversación, destinatario) cada VENTANA.
 *
 * In-memory: misma restricción de UNA sola instancia que el SimpleBroker y el SimpUserRegistry,
 * ya asumida en el spec. Con dos réplicas el throttle se relajaría (hasta 2 pushes por ventana),
 * lo cual degrada suavemente — no rompe nada.
 */
@Service
public class PushThrottle {

    private static final Duration VENTANA = Duration.ofMinutes(5);

    private final Map<String, Instant> ultimaPush = new ConcurrentHashMap<>();
    private final Supplier<Instant> reloj;

    public PushThrottle() {
        this(Instant::now);
    }

    // Constructor para tests: permite adelantar el reloj sin dormir.
    PushThrottle(Supplier<Instant> reloj) {
        this.reloj = reloj;
    }

    public boolean deboNotificar(Long conversacionId, Long destinatarioId) {
        String clave = conversacionId + ":" + destinatarioId;
        Instant ahora = reloj.get();
        AtomicBoolean emitir = new AtomicBoolean(false);

        // compute() es atómico sobre la clave. Con get()+put() (check-then-act) dos mensajes
        // concurrentes podrían leer ambos "sin push previa" y emitir los dos: justo la doble
        // vibración que esta clase existe para evitar.
        ultimaPush.compute(clave, (k, previa) -> {
            if (previa != null && Duration.between(previa, ahora).compareTo(VENTANA) < 0) {
                return previa; // dentro de la ventana: no notificar y NO mover el reloj
            }
            emitir.set(true);
            return ahora;
        });

        return emitir.get();
    }
}
