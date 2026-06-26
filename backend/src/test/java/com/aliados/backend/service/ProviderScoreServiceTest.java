package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.repository.TrabajoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProviderScoreServiceTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock FeatureFlagService featureFlagService;
    @InjectMocks ProviderScoreService service;

    // ---------------------------------------------------------------------
    // combinarScore: función pura, no usa los campos inyectados → sin stubs.
    // ---------------------------------------------------------------------

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

    // ---------------------------------------------------------------------
    // Escenario de ponderación: 3 proveedores que SOLO difieren en calificación.
    //
    // Sin historial de propuestas/respuestas, aceptación y velocidad quedan en
    // 50 neutral (stubeamos 0 propuestas y null en tiempos de respuesta), así
    // que el orden lo decide la calificación:
    //   5★ → cal 100 → 100*0.4 + 50*0.35 + 50*0.25 = 70
    //   3★ → cal  50 →  50*0.4 + 50*0.35 + 50*0.25 = 50
    //   1★ → cal   0 →   0*0.4 + 50*0.35 + 50*0.25 = 30
    // ---------------------------------------------------------------------

    /**
     * Proveedores sin historial: 0 propuestas (→ aceptación neutral 50) y sin
     * tiempo de respuesta registrado (→ velocidad neutral 50). Los pesos vienen
     * de feature flags; devolvemos el default → pesos reales 0.40/0.35/0.25.
     */
    private void usarPesosPorDefectoSinHistorial() {
        when(featureFlagService.getNumber(anyString(), anyDouble()))
                .thenAnswer(inv -> (double) inv.getArgument(1));
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(anyLong())).thenReturn(0L);
        when(trabajoRepository.getPromedioTiempoRespuestaMinutosByProveedorId(anyLong())).thenReturn(null);
    }

    private User proveedor(long id, String nombre, double promedio, long cantidad) {
        User u = new User();
        u.setId(id);
        u.setNombre(nombre);
        u.setPromedioCalificacion(promedio);
        u.setCantidadCalificaciones(cantidad);
        return u;
    }

    @Test
    void calcularScore_segunCalificacion_excelenteMedioMalo() {
        usarPesosPorDefectoSinHistorial();
        assertThat(service.calcularScore(proveedor(1, "Excelente", 5.0, 10))).isCloseTo(70.0, within(1e-9));
        assertThat(service.calcularScore(proveedor(2, "Medio", 3.0, 10))).isCloseTo(50.0, within(1e-9));
        assertThat(service.calcularScore(proveedor(3, "Malo", 1.0, 10))).isCloseTo(30.0, within(1e-9));
    }

    @Test
    void calcularScore_proveedorNuevoSinCalificaciones_esNeutral50() {
        usarPesosPorDefectoSinHistorial();
        // cantidad 0 → calificación neutral 50 → score = 50*(0.4+0.35+0.25) = 50
        assertThat(service.calcularScore(proveedor(9, "Nuevo", 0.0, 0))).isCloseTo(50.0, within(1e-9));
    }

    @Test
    void ordenarPorScore_ordenaPorCalificacionDescendente() {
        usarPesosPorDefectoSinHistorial();
        User excelente = proveedor(1, "Excelente", 5.0, 10);
        User medio = proveedor(2, "Medio", 3.0, 10);
        User malo = proveedor(3, "Malo", 1.0, 10);

        // Entran desordenados a propósito.
        List<User> ordenados = service.ordenarPorScore(new ArrayList<>(List.of(malo, excelente, medio)));

        assertThat(ordenados).containsExactly(excelente, medio, malo);
    }

    // ---------------------------------------------------------------------
    // Cruce: la calificación pesa solo 40%, así que NO siempre gana la mejor
    // calificación. Un 1★ que acepta todo y responde rapidísimo le gana a un
    // 5★ que rechaza casi todo y responde lento. Documenta que el ranking es
    // multifactor (ajustable con los flags score_peso_*).
    // ---------------------------------------------------------------------

    @Test
    void calcularScore_unMaloRapidoSupera_aUnExcelenteLento() {
        when(featureFlagService.getNumber(anyString(), anyDouble()))
                .thenAnswer(inv -> (double) inv.getArgument(1));

        // Malo (1★) pero acepta 10/10 (aceptación 100) y responde en 3 min (velocidad 90).
        User maloRapido = proveedor(1, "Malo rápido", 1.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoRepository.getPromedioTiempoRespuestaMinutosByProveedorId(1L)).thenReturn(3.0);
        // 0*0.4 + 100*0.35 + 90*0.25 = 0 + 35 + 22.5 = 57.5

        // Excelente (5★) pero acepta 1/10 (aceptación 10) y responde en 27 min (velocidad 10).
        User excelenteLento = proveedor(2, "Excelente lento", 5.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(2L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(2L)).thenReturn(1L);
        when(trabajoRepository.getPromedioTiempoRespuestaMinutosByProveedorId(2L)).thenReturn(27.0);
        // 100*0.4 + 10*0.35 + 10*0.25 = 40 + 3.5 + 2.5 = 46

        assertThat(service.calcularScore(maloRapido)).isCloseTo(57.5, within(1e-9));
        assertThat(service.calcularScore(excelenteLento)).isCloseTo(46.0, within(1e-9));

        // Pese a la peor calificación, el malo rápido queda primero.
        List<User> ordenados = service.ordenarPorScore(new ArrayList<>(List.of(excelenteLento, maloRapido)));
        assertThat(ordenados).containsExactly(maloRapido, excelenteLento);
    }

    @Test
    void calcularScore_ambos5Estrellas_ganaElMasRapidoYAceptador() {
        when(featureFlagService.getNumber(anyString(), anyDouble()))
                .thenAnswer(inv -> (double) inv.getArgument(1));

        // 5★ que acepta 10/10 (aceptación 100) y responde en 3 min (velocidad 90).
        User rapido = proveedor(1, "5★ rápido", 5.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoRepository.getPromedioTiempoRespuestaMinutosByProveedorId(1L)).thenReturn(3.0);
        // 100*0.4 + 100*0.35 + 90*0.25 = 40 + 35 + 22.5 = 97.5

        // 5★ que acepta 1/10 (aceptación 10) y responde en 27 min (velocidad 10).
        User lento = proveedor(2, "5★ lento", 5.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(2L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(2L)).thenReturn(1L);
        when(trabajoRepository.getPromedioTiempoRespuestaMinutosByProveedorId(2L)).thenReturn(27.0);
        // 100*0.4 + 10*0.35 + 10*0.25 = 40 + 3.5 + 2.5 = 46

        // A igual calificación (5★), la calificación empata y desempatan aceptación + velocidad.
        assertThat(service.calcularScore(rapido)).isCloseTo(97.5, within(1e-9));
        assertThat(service.calcularScore(lento)).isCloseTo(46.0, within(1e-9));

        List<User> ordenados = service.ordenarPorScore(new ArrayList<>(List.of(lento, rapido)));
        assertThat(ordenados).containsExactly(rapido, lento);
    }
}
