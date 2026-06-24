package com.aliados.backend.service;

import com.google.firebase.remoteconfig.FirebaseRemoteConfig;
import com.google.firebase.remoteconfig.Parameter;
import com.google.firebase.remoteconfig.ParameterValue;
import com.google.firebase.remoteconfig.Template;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MaintenanceServiceTest {

    private FirebaseRemoteConfig rc;
    private MaintenanceService service;

    @BeforeEach
    void setUp() {
        rc = mock(FirebaseRemoteConfig.class);
        service = new MaintenanceService(rc);
    }

    private Template templateWith(Map<String, String> values) {
        Template t = new Template("etag");
        Map<String, Parameter> params = new HashMap<>();
        values.forEach((k, v) -> params.put(k, new Parameter().setDefaultValue(ParameterValue.of(v))));
        t.setParameters(params);
        return t;
    }

    @Test
    void get_leeLosParametros() throws Exception {
        when(rc.getTemplate()).thenReturn(templateWith(Map.of(
                "maintenance_level", "warning",
                "maintenance_title", "Hola",
                "maintenance_message", "Mensaje",
                "maintenance_schedule", "22:00 hs",
                "maintenance_duration", "10 min")));
        MaintenanceService.MaintenanceState s = service.get();
        assertThat(s.level()).isEqualTo("warning");
        assertThat(s.title()).isEqualTo("Hola");
        assertThat(s.message()).isEqualTo("Mensaje");
        assertThat(s.schedule()).isEqualTo("22:00 hs");
        assertThat(s.duration()).isEqualTo("10 min");
    }

    @Test
    void get_parametrosAusentes_usaDefaults() throws Exception {
        when(rc.getTemplate()).thenReturn(templateWith(Map.of()));
        MaintenanceService.MaintenanceState s = service.get();
        assertThat(s.level()).isEqualTo("off");
        assertThat(s.title()).isEqualTo("Estamos en mantenimiento");
        assertThat(s.schedule()).isEqualTo("");
        assertThat(s.duration()).isEqualTo("");
    }

    @Test
    void update_nivelInvalido_lanzaIllegalArgument() {
        assertThatThrownBy(() -> service.update("apagado", "t", "m", "", "", "admin"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_publicaTemplateActualizado() throws Exception {
        when(rc.getTemplate()).thenReturn(templateWith(Map.of("maintenance_level", "off")));
        when(rc.publishTemplate(any(Template.class))).thenAnswer(inv -> inv.getArgument(0));

        MaintenanceService.MaintenanceState s =
                service.update("blocked", "Caído", "Volvemos", "22:00 hs", "30 min", "admin-uid");

        assertThat(s.level()).isEqualTo("blocked");

        InOrder order = inOrder(rc);
        order.verify(rc).getTemplate();
        order.verify(rc).publishTemplate(any(Template.class));

        ArgumentCaptor<Template> captor = ArgumentCaptor.forClass(Template.class);
        verify(rc).publishTemplate(captor.capture());
        Parameter p = captor.getValue().getParameters().get("maintenance_level");
        assertThat(((ParameterValue.Explicit) p.getDefaultValue()).getValue()).isEqualTo("blocked");
    }
}
