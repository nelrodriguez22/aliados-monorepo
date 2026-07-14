package com.aliados.backend.service;

import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.stereotype.Service;

/**
 * ¿Tiene el usuario una sesión WebSocket activa AHORA?
 *
 * NO usa UserStatus: ese enum mezcla conectividad (¿hay socket?) con disponibilidad (¿está
 * libre?), y el disconnect handler (WebSocketEventListener:82-85) NO marca OFFLINE a un usuario
 * BUSY. Un proveedor que cierra la app con trabajos activos queda BUSY para siempre: si la
 * presencia saliera de ahí, jamás recibiría un push.
 *
 * SimpUserRegistry es el registro real de sesiones STOMP. Es in-memory por instancia — misma
 * restricción de UNA sola instancia que el SimpleBroker, ya asumida en el spec.
 */
@Service
public class PresenciaService {

    private final SimpUserRegistry simpUserRegistry;

    public PresenciaService(SimpUserRegistry simpUserRegistry) {
        this.simpUserRegistry = simpUserRegistry;
    }

    public boolean estaConectado(String firebaseUid) {
        if (firebaseUid == null) return false;
        return simpUserRegistry.getUser(firebaseUid) != null;
    }
}
