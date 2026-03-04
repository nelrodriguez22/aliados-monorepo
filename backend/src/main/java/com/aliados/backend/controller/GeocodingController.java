package com.aliados.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import java.util.List;
import java.util.stream.Collectors;
import java.util.Map;

@RestController
@RequestMapping("/api/geocoding")
public class GeocodingController {

    @Value("${google.maps.api.key}")
    private String apiKey;

    @GetMapping("/reverse")
    public ResponseEntity<?> reverseGeocode(
            @RequestParam Double lat,
            @RequestParam Double lng
    ) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            String url = String.format(
                    "https://maps.googleapis.com/maps/api/geocode/json?latlng=%s,%s&key=%s&language=es",
                    lat, lng, apiKey
            );

            Map<String, Object> response = restTemplate.getForObject(url, Map.class);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/forward")
    public ResponseEntity<?> forwardGeocode(@RequestParam String address) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            String url = String.format(
                    "https://maps.googleapis.com/maps/api/geocode/json?address=%s&key=%s&language=es",
                    address, apiKey
            );

            Map<String, Object> response = restTemplate.getForObject(url, Map.class);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/autocomplete")
    public ResponseEntity<?> autocomplete(
            @RequestParam String input
    ) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            String url = String.format(
                    "https://maps.googleapis.com/maps/api/place/autocomplete/json?input=%s&components=country:ar&location=-32.9468,-60.6393&radius=15000&strictbounds=true&language=es&key=%s",
                    input, apiKey
            );

            Map<String, Object> response = restTemplate.getForObject(url, Map.class);

            // Filtrar solo resultados de Rosario
            if (response != null && response.containsKey("predictions")) {
                List<Map<String, Object>> predictions = (List<Map<String, Object>>) response.get("predictions");
                List<Map<String, Object>> filtered = predictions.stream()
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
    }}