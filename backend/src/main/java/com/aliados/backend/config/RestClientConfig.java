package com.aliados.backend.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestClientConfig {

    /**
     * RestTemplate compartido para llamadas a APIs externas (Google Maps, etc.).
     * Con timeouts: sin ellos una respuesta lenta del upstream cuelga el hilo
     * indefinidamente y puede agotar el pool de Tomcat.
     */
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(5))
                .readTimeout(Duration.ofSeconds(10))
                .build();
    }
}
