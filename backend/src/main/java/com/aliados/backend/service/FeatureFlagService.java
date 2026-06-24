package com.aliados.backend.service;

import com.aliados.backend.entity.FeatureFlag;
import com.aliados.backend.repository.FeatureFlagRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FeatureFlagService {

    private static final Logger log = LoggerFactory.getLogger(FeatureFlagService.class);

    private final FeatureFlagRepository repository;
    private final ObjectMapper objectMapper;
    private final Map<String, FeatureFlag> cache = new ConcurrentHashMap<>();

    public FeatureFlagService(FeatureFlagRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    // Carga inicial: falla ruidosamente si la DB no está disponible al arrancar (intencional).
    @PostConstruct
    public void reload() {
        Map<String, FeatureFlag> fresh = new HashMap<>();
        repository.findAll().forEach(f -> fresh.put(f.getKey(), f));
        cache.clear();
        cache.putAll(fresh);
    }

    // Recarga periódica: preserva el cache anterior ante fallo transitorio de DB.
    @Scheduled(fixedDelay = 60_000)
    public void reloadScheduled() {
        try {
            reload();
        } catch (Exception e) {
            log.warn("Error recargando feature flags; se mantiene el cache previo", e);
        }
    }

    public boolean isEnabled(String key) {
        FeatureFlag f = cache.get(key);
        return f != null && Boolean.TRUE.equals(f.getEnabled());
    }

    public double getNumber(String key, double fallback) {
        FeatureFlag f = cache.get(key);
        if (f == null || !Boolean.TRUE.equals(f.getEnabled()) || f.getValue() == null) {
            return fallback;
        }
        try {
            return Double.parseDouble(f.getValue());
        } catch (NumberFormatException e) {
            log.warn("Flag {} con valor '{}' no es NUMBER; usando fallback {}", key, f.getValue(), fallback);
            return fallback;
        }
    }

    public String getString(String key, String fallback) {
        FeatureFlag f = cache.get(key);
        if (f == null || !Boolean.TRUE.equals(f.getEnabled()) || f.getValue() == null) {
            return fallback;
        }
        return f.getValue();
    }

    // Admin view: lee directo de la DB (ground truth), no del cache.
    public List<FeatureFlag> getAll() {
        return repository.findAll();
    }

    @Transactional
    public FeatureFlag update(String key, boolean enabled, String value, String updatedBy) {
        FeatureFlag f = repository.findById(key)
            .orElseThrow(() -> new NoSuchElementException("Feature flag no encontrado: " + key));
        validateValue(f.getValueType(), value, enabled);
        f.setEnabled(enabled);
        f.setValue(value);
        f.setUpdatedBy(updatedBy);
        f.setUpdatedAt(Instant.now());
        FeatureFlag saved = repository.save(f);
        cache.put(key, saved); // write-through
        return saved;
    }

    private void validateValue(String valueType, String value, boolean enabled) {
        if (value == null && enabled && !"BOOLEAN".equals(valueType)) {
            throw new IllegalArgumentException("El valor es requerido para flags de tipo " + valueType);
        }
        if (value == null) return; // BOOLEAN o flag deshabilitado: valor opcional
        switch (valueType) {
            case "NUMBER" -> {
                try {
                    Double.parseDouble(value);
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("El valor debe ser un número");
                }
            }
            case "BOOLEAN" -> {
                if (!value.equals("true") && !value.equals("false")) {
                    throw new IllegalArgumentException("El valor debe ser 'true' o 'false'");
                }
            }
            case "JSON" -> {
                try {
                    objectMapper.readTree(value);
                } catch (Exception e) {
                    throw new IllegalArgumentException("El valor debe ser JSON válido");
                }
            }
            case "STRING" -> { /* cualquier string es válido */ }
            default -> { /* tipo desconocido: no validar */ }
        }
    }
}
