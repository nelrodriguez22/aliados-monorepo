package com.aliados.backend.service;

import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException;
import com.google.firebase.remoteconfig.Parameter;
import com.google.firebase.remoteconfig.ParameterValue;
import com.google.firebase.remoteconfig.Template;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Service
public class MaintenanceService {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceService.class);

    private static final String LEVEL = "maintenance_level";
    private static final String TITLE = "maintenance_title";
    private static final String MESSAGE = "maintenance_message";
    private static final String SCHEDULE = "maintenance_schedule";
    private static final String DURATION = "maintenance_duration";

    private static final Set<String> VALID_LEVELS = Set.of("off", "warning", "blocked");

    // Defaults espejan el DEFAULTS del front (remoteConfig.ts).
    private static final String DEFAULT_LEVEL = "off";
    private static final String DEFAULT_TITLE = "Estamos en mantenimiento";
    private static final String DEFAULT_MESSAGE =
            "Estamos realizando tareas de mantenimiento, volveremos a la brevedad.";
    private static final String DEFAULT_SCHEDULE = "";
    private static final String DEFAULT_DURATION = "";

    private final FirebaseRemoteConfig remoteConfig;

    public MaintenanceService(FirebaseRemoteConfig remoteConfig) {
        this.remoteConfig = remoteConfig;
    }

    public MaintenanceState get() throws FirebaseRemoteConfigException {
        Map<String, Parameter> params = remoteConfig.getTemplate().getParameters();
        return new MaintenanceState(
                read(params, LEVEL, DEFAULT_LEVEL),
                read(params, TITLE, DEFAULT_TITLE),
                read(params, MESSAGE, DEFAULT_MESSAGE),
                read(params, SCHEDULE, DEFAULT_SCHEDULE),
                read(params, DURATION, DEFAULT_DURATION));
    }

    public MaintenanceState update(String level, String title, String message, String schedule, String duration, String adminUid)
            throws FirebaseRemoteConfigException {
        if (level == null || !VALID_LEVELS.contains(level)) {
            throw new IllegalArgumentException("Nivel inválido: " + level + " (off|warning|blocked)");
        }

        Template t = remoteConfig.getTemplate(); // versión actual → evita conflicto de ETag
        Map<String, Parameter> params = new HashMap<>(t.getParameters());
        params.put(LEVEL, param(level));
        params.put(TITLE, param(title));
        params.put(MESSAGE, param(message));
        params.put(SCHEDULE, param(schedule));
        params.put(DURATION, param(duration));
        t.setParameters(params);
        remoteConfig.publishTemplate(t);

        log.info("Maintenance actualizado a level={} por admin={}", level, adminUid);
        return new MaintenanceState(level, title, message, schedule, duration);
    }

    private static Parameter param(String value) {
        return new Parameter().setDefaultValue(ParameterValue.of(value == null ? "" : value));
    }

    private static String read(Map<String, Parameter> params, String key, String fallback) {
        Parameter p = params.get(key);
        if (p == null) return fallback;
        if (p.getDefaultValue() instanceof ParameterValue.Explicit explicit) {
            String value = explicit.getValue();
            return value != null ? value : fallback;
        }
        return fallback;
    }

    public record MaintenanceState(String level, String title, String message, String schedule, String duration) {}
}
