package com.aliados.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.StaticHeadersWriter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final FirebaseAuthFilter firebaseAuthFilter;
    private final MdcLoggingFilter mdcLoggingFilter;

    public SecurityConfig(FirebaseAuthFilter firebaseAuthFilter, MdcLoggingFilter mdcLoggingFilter) {
        this.firebaseAuthFilter = firebaseAuthFilter;
        this.mdcLoggingFilter = mdcLoggingFilter;
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
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(
                                "/api/health",
                                "/actuator/**",
                                "/api/oficios",
                                "/ws/**",           // WebSocket endpoint
                                "/app/**",          // Mensajes de aplicación WebSocket
                                "/topic/**",        // Suscripciones a topics
                                "/queue/**",        // Suscripciones a queues
                                "/user/**",          // Mensajes a usuarios específicos
                                "/api/mudanzas/tiers",
                                "/api/users/resend-verification",
                                "/api/users/forgot-password"
                        ).permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated()
                )
                // HSTS explícito. Detrás del proxy TLS de Railway la request puede no verse
                // "secure", así que deshabilitamos el HSTS condicional de Spring y escribimos
                // el header siempre (el acceso real al backend es siempre HTTPS).
                .headers(headers -> headers
                        .httpStrictTransportSecurity(hsts -> hsts.disable())
                        .addHeaderWriter(new StaticHeadersWriter(
                                "Strict-Transport-Security", "max-age=31536000; includeSubDomains")))
                .addFilterBefore(firebaseAuthFilter,
                        UsernamePasswordAuthenticationFilter.class)
                // El MDC necesita el SecurityContext ya poblado (uid) → después del auth.
                .addFilterAfter(mdcLoggingFilter, FirebaseAuthFilter.class);

        return http.build();
    }
}