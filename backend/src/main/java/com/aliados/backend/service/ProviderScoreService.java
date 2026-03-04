package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.TrabajoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class ProviderScoreService {

    private static final Logger logger = LoggerFactory.getLogger(ProviderScoreService.class);

    private static final double PESO_CALIFICACION = 0.40;
    private static final double PESO_TASA_ACEPTACION = 0.35;
    private static final double PESO_VELOCIDAD_RESPUESTA = 0.25;

    // Tiempo máximo de referencia para normalizar velocidad (en minutos)
    // Un proveedor que tarda 30+ min en responder obtiene 0 en velocidad
    private static final double TIEMPO_MAX_RESPUESTA_MIN = 30.0;

    @Autowired
    private CalificacionRepository calificacionRepository;

    @Autowired
    private TrabajoRepository trabajoRepository;

    /**
     * Calcula el score de un proveedor (0-100).
     *
     * score = (calificacionNorm * 0.4) + (tasaAceptacion * 0.35) + (velocidadRespuesta * 0.25)
     *
     * - calificacionNorm: promedio de estrellas (1-5) normalizado a 0-100
     * - tasaAceptacion: propuestas aceptadas / propuestas enviadas (0-100)
     * - velocidadRespuesta: inversamente proporcional al tiempo promedio de respuesta (0-100)
     */
    public double calcularScore(User proveedor) {
        double calificacionNorm = calcularCalificacionNormalizada(proveedor.getId());
        double tasaAceptacion = calcularTasaAceptacion(proveedor.getId());
        double velocidadRespuesta = calcularVelocidadRespuesta(proveedor.getId());

        double score = (calificacionNorm * PESO_CALIFICACION)
                     + (tasaAceptacion * PESO_TASA_ACEPTACION)
                     + (velocidadRespuesta * PESO_VELOCIDAD_RESPUESTA);

        logger.debug("Score proveedor {} ({}): cal={} tasa={} vel={} → total={}",
                proveedor.getId(), proveedor.getNombre(),
                String.format("%.1f", calificacionNorm),
                String.format("%.1f", tasaAceptacion),
                String.format("%.1f", velocidadRespuesta),
                String.format("%.1f", score));

        return score;
    }

    /**
     * Ordena una lista de proveedores por score descendente.
     */
    public List<User> ordenarPorScore(List<User> proveedores) {
        proveedores.sort(Comparator.comparingDouble(this::calcularScore).reversed());
        return proveedores;
    }

    /**
     * Calificación promedio normalizada a 0-100.
     * Sin calificaciones → 50 (neutral, no penalizar proveedores nuevos).
     */
    private double calcularCalificacionNormalizada(Long proveedorId) {
        Double promedio = calificacionRepository.getPromedioByProveedorId(proveedorId);
        if (promedio == null) {
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
     * 0 min → 100, TIEMPO_MAX_RESPUESTA_MIN+ min → 0.
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
        double normalizado = (1.0 - (promedioMinutos / TIEMPO_MAX_RESPUESTA_MIN)) * 100.0;
        return Math.max(0.0, Math.min(100.0, normalizado));
    }
}
