package com.aliados.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ProviderScoreServiceTest {

    // combinarScore es pura (no usa los campos inyectados) → se testea sin mocks.
    private final ProviderScoreService service = new ProviderScoreService();

    @Test
    void combinarScore_pesosPorDefecto() {
        // 80*0.40 + 60*0.35 + 40*0.25 = 32 + 21 + 10 = 63
        assertThat(service.combinarScore(80, 60, 40, 0.40, 0.35, 0.25)).isCloseTo(63.0, within(1e-9));
    }

    @Test
    void combinarScore_pesosQueNoSuman1_seNormalizan() {
        // 1/1/1 → cada uno cuenta 1/3 → (80 + 60 + 40) / 3 = 60
        assertThat(service.combinarScore(80, 60, 40, 1, 1, 1)).isCloseTo(60.0, within(1e-9));
    }

    @Test
    void combinarScore_pesosEnCero_usaDefaults() {
        // suma <= 0 → guard usa 0.40/0.35/0.25 → 63
        assertThat(service.combinarScore(80, 60, 40, 0, 0, 0)).isCloseTo(63.0, within(1e-9));
    }
}
