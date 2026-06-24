package com.aliados.backend.service;

import com.aliados.backend.entity.FeatureFlag;
import com.aliados.backend.repository.FeatureFlagRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeatureFlagServiceTest {

    private FeatureFlagRepository repo;
    private FeatureFlagService service;

    private FeatureFlag flag(String key, boolean enabled, String value, String type) {
        FeatureFlag f = new FeatureFlag();
        f.setKey(key);
        f.setEnabled(enabled);
        f.setValue(value);
        f.setValueType(type);
        return f;
    }

    @BeforeEach
    void setUp() {
        repo = mock(FeatureFlagRepository.class);
        when(repo.findAll()).thenReturn(List.of(
            flag("mudanza_ratio_tiempo", true, "180", "NUMBER"),
            flag("apagado", false, "5", "NUMBER"),
            flag("nombre", true, "hola", "STRING")
        ));
        service = new FeatureFlagService(repo, new ObjectMapper());
        service.reload();
    }

    @Test
    void getNumber_devuelveValorDelFlagHabilitado() {
        assertThat(service.getNumber("mudanza_ratio_tiempo", 1.0)).isEqualTo(180.0);
    }

    @Test
    void getNumber_flagDeshabilitado_devuelveFallback() {
        assertThat(service.getNumber("apagado", 1.0)).isEqualTo(1.0);
    }

    @Test
    void getNumber_flagAusente_devuelveFallback() {
        assertThat(service.getNumber("no_existe", 1.0)).isEqualTo(1.0);
    }

    @Test
    void isEnabled_reflejaElEstado() {
        assertThat(service.isEnabled("mudanza_ratio_tiempo")).isTrue();
        assertThat(service.isEnabled("apagado")).isFalse();
        assertThat(service.isEnabled("no_existe")).isFalse();
    }

    @Test
    void update_keyInexistente_lanzaNoSuchElement() {
        when(repo.findById("no_existe")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update("no_existe", true, "1", "admin-uid"))
            .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void update_valorNoNumerico_paraTipoNumber_lanzaIllegalArgument() {
        when(repo.findById("mudanza_ratio_tiempo"))
            .thenReturn(Optional.of(flag("mudanza_ratio_tiempo", true, "1.0", "NUMBER")));
        assertThatThrownBy(() -> service.update("mudanza_ratio_tiempo", true, "abc", "admin-uid"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_valido_persisteYActualizaCache() {
        FeatureFlag existing = flag("mudanza_ratio_tiempo", true, "1.0", "NUMBER");
        when(repo.findById("mudanza_ratio_tiempo")).thenReturn(Optional.of(existing));
        when(repo.save(existing)).thenReturn(existing);

        service.update("mudanza_ratio_tiempo", true, "180", "admin-uid");

        assertThat(service.getNumber("mudanza_ratio_tiempo", 1.0)).isEqualTo(180.0);
        assertThat(existing.getUpdatedBy()).isEqualTo("admin-uid");
        verify(repo).save(existing);
    }

    // --- I3: nuevos tests ---

    @Test
    void getString_habilitado_devuelveValor() {
        assertThat(service.getString("nombre", "fallback")).isEqualTo("hola");
    }

    @Test
    void getString_deshabilitado_devuelveFallback() {
        assertThat(service.getString("apagado", "fallback")).isEqualTo("fallback");
    }

    @Test
    void getString_ausente_devuelveFallback() {
        assertThat(service.getString("no_existe", "fallback")).isEqualTo("fallback");
    }

    @Test
    void getNumber_flagHabilitadoConValorNull_devuelveFallback() {
        FeatureFlagRepository repo2 = mock(FeatureFlagRepository.class);
        when(repo2.findAll()).thenReturn(List.of(
            flag("ratio_null", true, null, "NUMBER")
        ));
        FeatureFlagService svc2 = new FeatureFlagService(repo2, new ObjectMapper());
        svc2.reload();
        assertThat(svc2.getNumber("ratio_null", 1.0)).isEqualTo(1.0);
    }

    @Test
    void reloadScheduled_preservaCacheAnteErrorDeDB() {
        // El setUp ya cargó el cache con mudanza_ratio_tiempo=180 (primera llamada a findAll).
        // Ahora hacemos que la siguiente llamada a findAll lance excepción.
        when(repo.findAll()).thenThrow(new RuntimeException("db down"));
        // reloadScheduled no debe propagar la excepción y el cache anterior debe preservarse.
        assertThatCode(() -> service.reloadScheduled()).doesNotThrowAnyException();
        assertThat(service.getNumber("mudanza_ratio_tiempo", 1.0)).isEqualTo(180.0);
    }

    @Test
    void update_booleanValido_noLanzaExcepcion() {
        FeatureFlag existing = flag("mi_bool", true, null, "BOOLEAN");
        when(repo.findById("mi_bool")).thenReturn(Optional.of(existing));
        when(repo.save(existing)).thenReturn(existing);
        assertThatCode(() -> service.update("mi_bool", true, "true", "admin-uid"))
            .doesNotThrowAnyException();
    }

    @Test
    void update_booleanInvalido_lanzaIllegalArgument() {
        when(repo.findById("mi_bool"))
            .thenReturn(Optional.of(flag("mi_bool", true, null, "BOOLEAN")));
        assertThatThrownBy(() -> service.update("mi_bool", true, "si", "admin-uid"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_numberHabilitadoConValorNull_lanzaIllegalArgument() {
        when(repo.findById("mudanza_ratio_tiempo"))
            .thenReturn(Optional.of(flag("mudanza_ratio_tiempo", true, "1.0", "NUMBER")));
        assertThatThrownBy(() -> service.update("mudanza_ratio_tiempo", true, null, "admin-uid"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_numberDeshabilitadoConValorNull_noLanzaExcepcion() {
        FeatureFlag existing = flag("mudanza_ratio_tiempo", false, "1.0", "NUMBER");
        when(repo.findById("mudanza_ratio_tiempo")).thenReturn(Optional.of(existing));
        when(repo.save(existing)).thenReturn(existing);
        assertThatCode(() -> service.update("mudanza_ratio_tiempo", false, null, "admin-uid"))
            .doesNotThrowAnyException();
    }
}
