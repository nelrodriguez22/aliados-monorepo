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

/**
 * Version-gate (Capa 3 del SW): lee/escribe `min_app_version` en Remote Config.
 * El cliente compara su `__APP_VERSION__` (run_number del build) contra este valor;
 * si es menor, queda bloqueado con la pantalla de actualización forzada. Mismo
 * patrón de escritura del template que MaintenanceService.
 */
@Service
public class AppVersionGateService {

    private static final Logger log = LoggerFactory.getLogger(AppVersionGateService.class);
    private static final String MIN_VERSION = "min_app_version";

    private final FirebaseRemoteConfig remoteConfig;

    public AppVersionGateService(FirebaseRemoteConfig remoteConfig) {
        this.remoteConfig = remoteConfig;
    }

    public int getMinVersion() throws FirebaseRemoteConfigException {
        Map<String, Parameter> params = remoteConfig.getTemplate().getParameters();
        return parseInt(read(params, MIN_VERSION));
    }

    public int setMinVersion(int version, String adminUid) throws FirebaseRemoteConfigException {
        if (version < 0) {
            throw new IllegalArgumentException("La versión no puede ser negativa");
        }
        Template t = remoteConfig.getTemplate(); // versión actual → evita conflicto de ETag
        Map<String, Parameter> params = new HashMap<>(t.getParameters());
        params.put(MIN_VERSION, new Parameter().setDefaultValue(ParameterValue.of(String.valueOf(version))));
        t.setParameters(params);
        remoteConfig.publishTemplate(t);
        log.info("min_app_version actualizado a {} por admin={}", version, adminUid);
        return version;
    }

    private static int parseInt(String s) {
        try {
            return (s == null || s.isBlank()) ? 0 : Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String read(Map<String, Parameter> params, String key) {
        Parameter p = params.get(key);
        if (p != null && p.getDefaultValue() instanceof ParameterValue.Explicit explicit) {
            return explicit.getValue();
        }
        return null;
    }
}
