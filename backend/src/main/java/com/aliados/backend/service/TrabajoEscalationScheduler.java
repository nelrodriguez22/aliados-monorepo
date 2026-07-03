package com.aliados.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Cada 60s: re-ofrece ofertas vencidas y expira trabajos sin proveedor.
// Los umbrales (en minutos) viven en feature flags y se tunean sin redeploy.
// Cada trabajo se escala en su propia transacción (REQUIRES_NEW): si uno falla,
// rollbackea solo ese y el batch sigue con el resto.
@Component
public class TrabajoEscalationScheduler {

    private static final Logger logger = LoggerFactory.getLogger(TrabajoEscalationScheduler.class);

    private final TrabajoService trabajoService;
    private final FeatureFlagService featureFlagService;

    public TrabajoEscalationScheduler(TrabajoService trabajoService, FeatureFlagService featureFlagService) {
        this.trabajoService = trabajoService;
        this.featureFlagService = featureFlagService;
    }

    @Scheduled(fixedDelay = 60_000)
    public void escalar() {
        int intervalo = (int) featureFlagService.getNumber("trabajo_oferta_grupo_intervalo_min", 5);
        for (Long id : trabajoService.idsTrabajosPendientes()) {
            try {
                trabajoService.escalarUnTrabajo(id, intervalo);
            } catch (Exception e) {
                logger.error("Error escalando trabajo {}: {}", id, e.getMessage(), e);
            }
        }
    }
}
