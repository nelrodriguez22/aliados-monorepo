package com.aliados.backend.config;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Rate limiter simple de ventana fija, en memoria (suficiente para una sola
 * instancia). Si se escala a varias instancias hay que mover esto a Redis,
 * porque cada instancia tendría su propio contador.
 */
@Component
public class RateLimiter {

    private record Window(long startMs, AtomicInteger count) {}

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    /**
     * @return true si la request entra dentro del límite; false si lo excede.
     */
    public boolean allow(String key, int maxRequests, Duration window) {
        long now = System.currentTimeMillis();
        long windowMs = window.toMillis();

        Window w = windows.compute(key, (k, existing) -> {
            if (existing == null || now - existing.startMs() >= windowMs) {
                return new Window(now, new AtomicInteger(0));
            }
            return existing;
        });

        return w.count().incrementAndGet() <= maxRequests;
    }
}
