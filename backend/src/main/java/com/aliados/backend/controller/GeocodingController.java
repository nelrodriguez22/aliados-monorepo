package com.aliados.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/geocoding")
public class GeocodingController {

    private static final String GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
    private static final String AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

    @Value("${google.maps.api.key}")
    private String apiKey;

    private final RestTemplate restTemplate;

    public GeocodingController(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @GetMapping("/reverse")
    public ResponseEntity<?> reverseGeocode(
            @RequestParam Double lat,
            @RequestParam Double lng
    ) {
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
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/forward")
    public ResponseEntity<?> forwardGeocode(@RequestParam String address) {
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
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/autocomplete")
    public ResponseEntity<?> autocomplete(@RequestParam String input) {
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
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getMap(URI uri) {
        return restTemplate.getForObject(uri, Map.class);
    }
}
