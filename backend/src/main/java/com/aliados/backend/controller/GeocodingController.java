package com.aliados.backend.controller;

import com.aliados.backend.config.RateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/geocoding")
public class GeocodingController {

    private static final Logger logger = LoggerFactory.getLogger(GeocodingController.class);

    private static final String GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
    private static final String AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

    // Tope por usuario: protege la quota/costo de la API key de Google.
    private static final int MAX_PER_MIN = 60;

    @Value("${google.maps.api.key}")
    private String apiKey;

    private final RestTemplate restTemplate;
    private final RateLimiter rateLimiter;

    public GeocodingController(RestTemplate restTemplate, RateLimiter rateLimiter) {
        this.restTemplate = restTemplate;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/reverse")
    public ResponseEntity<?> reverseGeocode(
            @RequestParam Double lat,
            @RequestParam Double lng,
            Authentication auth
    ) {
        if (overLimit(auth)) return tooMany();
        try {
            URI uri = UriComponentsBuilder.fromUriString(GEOCODE_URL)
                    .queryParam("latlng", lat + "," + lng)
                    .queryParam("key", apiKey)
                    .queryParam("language", "es")
                    .build()
                    .encode()
                    .toUri();

            Map<String, Object> response = getMap(uri);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            // SEC-4: no exponer el detalle interno al cliente; se loguea server-side.
            logger.warn("Error en reverse geocode: {}", e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", "No se pudo procesar la solicitud de geocoding"));
        }
    }

    @GetMapping("/forward")
    public ResponseEntity<?> forwardGeocode(@RequestParam String address, Authentication auth) {
        if (overLimit(auth)) return tooMany();
        try {
            // queryParam + encode() encodea el valor: un '&' o '=' en `address`
            // queda dentro del parámetro y no puede inyectar params nuevos.
            URI uri = UriComponentsBuilder.fromUriString(GEOCODE_URL)
                    .queryParam("address", address)
                    .queryParam("key", apiKey)
                    .queryParam("language", "es")
                    .build()
                    .encode()
                    .toUri();

            Map<String, Object> response = getMap(uri);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            // SEC-4: no exponer el detalle interno al cliente; se loguea server-side.
            logger.warn("Error en forward geocode: {}", e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", "No se pudo procesar la solicitud de geocoding"));
        }
    }

    @GetMapping("/autocomplete")
    public ResponseEntity<?> autocomplete(@RequestParam String input, Authentication auth) {
        if (overLimit(auth)) return tooMany();
        try {
            URI uri = UriComponentsBuilder.fromUriString(AUTOCOMPLETE_URL)
                    .queryParam("input", input)
                    .queryParam("components", "country:ar")
                    .queryParam("location", "-32.9468,-60.6393")
                    .queryParam("radius", "15000")
                    .queryParam("strictbounds", "true")
                    .queryParam("language", "es")
                    .queryParam("key", apiKey)
                    .build()
                    .encode()
                    .toUri();

            Map<String, Object> response = getMap(uri);

            // Filtrar solo resultados de Rosario
            if (response != null && response.get("predictions") instanceof List<?> rawList) {
                List<Map<String, Object>> filtered = rawList.stream()
                        .map(p -> (Map<String, Object>) p)
                        .filter(p -> {
                            String desc = (String) p.get("description");
                            return desc != null && desc.toLowerCase().contains("rosario");
                        })
                        .collect(Collectors.toList());
                response.put("predictions", filtered);
            }

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            // SEC-4: no exponer el detalle interno al cliente; se loguea server-side.
            logger.warn("Error en autocomplete: {}", e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", "No se pudo procesar la solicitud de geocoding"));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getMap(URI uri) {
        return restTemplate.getForObject(uri, Map.class);
    }

    // El UID viene del Authentication (lo setea FirebaseAuthFilter); el endpoint
    // ya requiere auth, así que `auth` no debería ser null, pero lo cubrimos.
    private boolean overLimit(Authentication auth) {
        String key = (auth != null) ? auth.getName() : "anonymous";
        return !rateLimiter.allow(key, MAX_PER_MIN, Duration.ofMinutes(1));
    }

    private ResponseEntity<?> tooMany() {
        return ResponseEntity.status(429)
                .body(Map.of("error", "Demasiadas solicitudes. Esperá un momento e intentá de nuevo."));
    }
}
