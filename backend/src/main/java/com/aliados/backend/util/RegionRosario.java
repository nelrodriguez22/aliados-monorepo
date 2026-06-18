package com.aliados.backend.util;

/**
 * Validación de cobertura geográfica. Hoy solo Rosario (Santa Fe), vía bounding box.
 * Centraliza la lógica que antes estaba duplicada en TrabajoService y MudanzaService.
 */
public final class RegionRosario {

    private RegionRosario() {}

    // Bounding box aproximado de Rosario.
    private static final double LAT_MIN = -33.05, LAT_MAX = -32.85;
    private static final double LNG_MIN = -60.80, LNG_MAX = -60.55;

    public static boolean contiene(double lat, double lng) {
        return lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
    }
}
