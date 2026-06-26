package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.repository.TrabajoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional(readOnly = true) // siempre se invoca dentro de una tx; mantiene la sesión por si accede a asociaciones LAZY
public class ProviderScoreService {

    private static final Logger logger = LoggerFactory.getLogger(ProviderScoreService.class);

    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private FeatureFlagService featureFlagService;

    /**
     * Calcula el score de un proveedor (0-100).
     *
     * score = combinarScore(calificacionNorm, tasaAceptacion, velocidadRespuesta, w1, w2, w3)
     * donde w1/w2/w3 provienen de feature flags con fallback 0.40/0.35/0.25.
     *
     * - calificacionNorm: promedio de estrellas (1-5) normalizado a 0-100
     * - tasaAceptacion: propuestas aceptadas / propuestas enviadas (0-100)
     * - velocidadRespuesta: inversamente proporcional al tiempo promedio de respuesta (0-100)
     */
    public double calcularScore(User proveedor) {
        double calificacionNorm = calcularCalificacionNormalizada(proveedor);
        double tasaAceptacion = calcularTasaAceptacion(proveedor.getId());
        double velocidadRespuesta = calcularVelocidadRespuesta(proveedor.getId());

        double w1 = featureFlagService.getNumber("score_peso_calificacion", 0.40);
        double w2 = featureFlagService.getNumber("score_peso_aceptacion", 0.35);
        double w3 = featureFlagService.getNumber("score_peso_velocidad", 0.25);
        double score = combinarScore(calificacionNorm, tasaAceptacion, velocidadRespuesta, w1, w2, w3);

        logger.debug("Score proveedor {} ({}): cal={} tasa={} vel={} → total={}",
                proveedor.getId(), proveedor.getNombre(),
                String.format("%.1f", calificacionNorm),
                String.format("%.1f", tasaAceptacion),
                String.format("%.1f", velocidadRespuesta),
                String.format("%.1f", score));

        return score;
    }

    /**
     * Combina los 3 componentes con sus pesos, normalizando para que sumen 1.0.
     * Si la suma de pesos es <= 0, usa los pesos por defecto (guard).
     */
    double combinarScore(double calif, double aceptacion, double velocidad,
                         double w1, double w2, double w3) {
        double suma = w1 + w2 + w3;
        if (suma <= 0) {
            w1 = 0.40; w2 = 0.35; w3 = 0.25; suma = 1.0;
        }
        return (calif * (w1 / suma)) + (aceptacion * (w2 / suma)) + (velocidad * (w3 / suma));
    }

    /**
     * Ordena una lista de proveedores por score descendente.
     *
     * El score se calcula UNA sola vez por proveedor y se cachea en un Map: cada
     * calcularScore() dispara varias queries, y pasarlo directo a un Comparator lo
     * reevaluaria O(n·log n) veces durante el sort (cientos de queries con pocos proveedores).
     */
    public List<User> ordenarPorScore(List<User> proveedores) {
        Map<Long, Double> scorePorProveedor = new HashMap<>();
        for (User proveedor : proveedores) {
            scorePorProveedor.put(proveedor.getId(), calcularScore(proveedor));
        }
        proveedores.sort(Comparator.comparingDouble(
                (User p) -> scorePorProveedor.get(p.getId())).reversed());
        return proveedores;
    }

    /**
     * Calificación promedio normalizada a 0-100.
     * Sin calificaciones → 50 (neutral, no penalizar proveedores nuevos).
     */
    private double calcularCalificacionNormalizada(User proveedor) {
        // #8: promedio/cantidad denormalizados en la entidad. Sin calificaciones
        // (cantidad 0) → 50 neutral, igual que antes cuando el AVG era null.
        Long cantidad = proveedor.getCantidadCalificaciones();
        Double promedio = proveedor.getPromedioCalificacion();
        if (cantidad == null || cantidad == 0 || promedio == null) {
            return 50.0; // Proveedores nuevos arrancan en el medio
        }
        // 1 estrella = 0, 5 estrellas = 100
        return ((promedio - 1.0) / 4.0) * 100.0;
    }

    /**
     * Tasa de aceptación: propuestas aceptadas / propuestas enviadas * 100.
     * Sin propuestas → 50 (neutral).
     */
    private double calcularTasaAceptacion(Long proveedorId) {
        long enviadas = trabajoRepository.countPropuestasEnviadasByProveedorId(proveedorId);
        if (enviadas == 0) {
            return 50.0;
        }
        long aceptadas = trabajoRepository.countPropuestasAceptadasByProveedorId(proveedorId);
        return ((double) aceptadas / enviadas) * 100.0;
    }

    /**
     * Velocidad de respuesta normalizada a 0-100.
     * 0 min → 100, tiempoMax+ min → 0.
     * Sin datos → 50 (neutral).
     */
    private double calcularVelocidadRespuesta(Long proveedorId) {
        Double promedioMinutos = trabajoRepository.getPromedioTiempoRespuestaMinutosByProveedorId(proveedorId);
        if (promedioMinutos == null) {
            return 50.0;
        }
        if (promedioMinutos <= 0) {
            return 100.0;
        }
        double tiempoMax = featureFlagService.getNumber("score_tiempo_max_respuesta_min", 30.0);
        if (tiempoMax <= 0) tiempoMax = 30.0; // guard: evita división por cero / Infinity
        double normalizado = (1.0 - (promedioMinutos / tiempoMax)) * 100.0;
        return Math.max(0.0, Math.min(100.0, normalizado));
    }
}
