package com.aliados.backend.service;

import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.TrabajoOfertaRepository;
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
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;
    @Mock FeatureFlagService featureFlagService;
    @InjectMocks ProviderScoreService service;

    // ---------------------------------------------------------------------
    // combinarScore: función pura, no usa los campos inyectados → sin stubs.
    // ---------------------------------------------------------------------

    @Test
    void combinarScore_pesosPorDefecto() {
        // 80*0.40 + 60*0.35 + 40*0.25 + 0*0 = 32 + 21 + 10 + 0 = 63 (w4=0 no aporta)
        assertThat(service.combinarScore(80, 60, 40, 0, 0.40, 0.35, 0.25, 0)).isCloseTo(63.0, within(1e-9));
    }

    @Test
    void combinarScore_pesosQueNoSuman1_seNormalizan() {
        // 1/1/1/0 → (80 + 60 + 40 + 0) / 3 = 60
        assertThat(service.combinarScore(80, 60, 40, 0, 1, 1, 1, 0)).isCloseTo(60.0, within(1e-9));
    }

    @Test
    void combinarScore_pesosEnCero_usaDefaults() {
        // suma <= 0 → guard usa 0.40/0.35/0.25/0.20, suma=1.20
        // 80*(0.40/1.20) + 60*(0.35/1.20) + 40*(0.25/1.20) + 0*(0.20/1.20) = 52.5
        assertThat(service.combinarScore(80, 60, 40, 0, 0, 0, 0, 0)).isCloseTo(52.5, within(1e-9));
    }

    // ---------------------------------------------------------------------
    // Escenario de ponderación: 3 proveedores que SOLO difieren en calificación.
    //
    // Sin historial, aceptación, velocidad y respuestaOfertas quedan en 50 neutral.
    // Pesos por defecto: 0.40/0.35/0.25/0.20, suma=1.20.
    //   5★ → cal 100 → (100*0.40 + 50*0.35 + 50*0.25 + 50*0.20) / 1.20 = 80/1.20 = 66.67
    //   3★ → cal  50 →  50 * 1.20 / 1.20 = 50
    //   1★ → cal   0 → (0 + 17.5 + 12.5 + 10) / 1.20 = 40/1.20 = 33.33
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
        when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(anyLong())).thenReturn(null);
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
        assertThat(service.calcularScore(proveedor(1, "Excelente", 5.0, 10))).isCloseTo(66.67, within(0.01));
        assertThat(service.calcularScore(proveedor(2, "Medio", 3.0, 10))).isCloseTo(50.0, within(1e-9));
        assertThat(service.calcularScore(proveedor(3, "Malo", 1.0, 10))).isCloseTo(33.33, within(0.01));
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
        // respuestaOfertas = 50 (neutral, sin datos). Pesos 0.40/0.35/0.25/0.20, suma=1.20.
        User maloRapido = proveedor(1, "Malo rápido", 1.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(1L)).thenReturn(3.0);
        // (0*0.40 + 100*0.35 + 90*0.25 + 50*0.20) / 1.20 = 67.5/1.20 = 56.25

        // Excelente (5★) pero acepta 1/10 (aceptación 10) y responde en 27 min (velocidad 10).
        User excelenteLento = proveedor(2, "Excelente lento", 5.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(2L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(2L)).thenReturn(1L);
        when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(2L)).thenReturn(27.0);
        // (100*0.40 + 10*0.35 + 10*0.25 + 50*0.20) / 1.20 = 56/1.20 = 46.67

        assertThat(service.calcularScore(maloRapido)).isCloseTo(56.25, within(1e-9));
        assertThat(service.calcularScore(excelenteLento)).isCloseTo(46.67, within(0.01));

        // Pese a la peor calificación, el malo rápido queda primero.
        List<User> ordenados = service.ordenarPorScore(new ArrayList<>(List.of(excelenteLento, maloRapido)));
        assertThat(ordenados).containsExactly(maloRapido, excelenteLento);
    }

    @Test
    void calcularScore_ambos5Estrellas_ganaElMasRapidoYAceptador() {
        when(featureFlagService.getNumber(anyString(), anyDouble()))
                .thenAnswer(inv -> (double) inv.getArgument(1));

        // 5★ que acepta 10/10 (aceptación 100) y responde en 3 min (velocidad 90).
        // respuestaOfertas = 50 (neutral). Pesos 0.40/0.35/0.25/0.20, suma=1.20.
        User rapido = proveedor(1, "5★ rápido", 5.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(1L)).thenReturn(10L);
        when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(1L)).thenReturn(3.0);
        // (100*0.40 + 100*0.35 + 90*0.25 + 50*0.20) / 1.20 = 107.5/1.20 = 89.58

        // 5★ que acepta 1/10 (aceptación 10) y responde en 27 min (velocidad 10).
        User lento = proveedor(2, "5★ lento", 5.0, 10);
        when(trabajoRepository.countPropuestasEnviadasByProveedorId(2L)).thenReturn(10L);
        when(trabajoRepository.countPropuestasAceptadasByProveedorId(2L)).thenReturn(1L);
        when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(2L)).thenReturn(27.0);
        // (100*0.40 + 10*0.35 + 10*0.25 + 50*0.20) / 1.20 = 56/1.20 = 46.67

        // A igual calificación (5★), la calificación empata y desempatan aceptación + velocidad.
        assertThat(service.calcularScore(rapido)).isCloseTo(89.58, within(0.01));
        assertThat(service.calcularScore(lento)).isCloseTo(46.67, within(0.01));

        List<User> ordenados = service.ordenarPorScore(new ArrayList<>(List.of(lento, rapido)));
        assertThat(ordenados).containsExactly(rapido, lento);
    }

    // ---------------------------------------------------------------------
    // 4º factor: tasa de respuesta a ofertas
    // ---------------------------------------------------------------------

    @Test
    void combinarScore_conCuatroPesos_normaliza() {
        // 4 factores en 100, pesos iguales → 100
        double s = service.combinarScore(100, 100, 100, 100, 0.25, 0.25, 0.25, 0.25);
        assertThat(s).isEqualTo(100.0);
    }

    @Test
    void combinarScore_sumaPesosCero_usaDefaults() {
        double s = service.combinarScore(100, 0, 0, 0, 0, 0, 0, 0);
        // defaults 0.40/0.35/0.25/0.20 → 100*0.40/1.20 = 33.33
        assertThat(s).isCloseTo(33.33, within(0.1));
    }

    @Test
    void tasaRespuestaOfertas_sinDatos_neutral50() {
        when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.PROPUSO)).thenReturn(0L);
        when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.DURMIO)).thenReturn(0L);
        assertThat(service.calcularTasaRespuestaOfertas(7L)).isEqualTo(50.0);
    }

    @Test
    void tasaRespuestaOfertas_calcula() {
        when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.PROPUSO)).thenReturn(3L);
        when(trabajoOfertaRepository.countByProveedorIdAndResultado(7L, ResultadoOferta.DURMIO)).thenReturn(1L);
        assertThat(service.calcularTasaRespuestaOfertas(7L)).isEqualTo(75.0); // 3/(3+1)
    }

    // ---------------------------------------------------------------------
    // Velocidad de respuesta: ahora sobre trabajo_oferta (ofrecidoAt→respondioAt)
    // ---------------------------------------------------------------------

    @Test
    void velocidad_usaTrabajoOferta() {
        when(trabajoOfertaRepository.getPromedioMinutosRespuestaByProveedorId(7L)).thenReturn(10.0);
        when(featureFlagService.getNumber("score_tiempo_max_respuesta_min", 30.0)).thenReturn(30.0);
        // 10 min sobre 30 → (1 - 10/30)*100 = 66.6
        assertThat(service.calcularVelocidadRespuesta(7L)).isCloseTo(66.6, within(0.2));
    }
}
