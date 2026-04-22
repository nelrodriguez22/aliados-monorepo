package com.aliados.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final FirebaseAuthFilter firebaseAuthFilter;

    public SecurityConfig(FirebaseAuthFilter firebaseAuthFilter) {
        this.firebaseAuthFilter = firebaseAuthFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configure(http))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/health",
                                "/actuator/**",
                                "/api/oficios",
                                "/ws/**",           // WebSocket endpoint
                                "/app/**",          // Mensajes de aplicación WebSocket
                                "/topic/**",        // Suscripciones a topics
                                "/queue/**",        // Suscripciones a queues
                                "/user/**",          // Mensajes a usuarios específicos
                                "/api/geocoding/**",
                                "/api/mudanzas/tiers"
                        ).permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(firebaseAuthFilter,
                        UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}