// src/main/java/com/aliados/backend/config/FirebaseAuthFilter.java
package com.aliados.backend.config;

import com.aliados.backend.repository.UserRepository;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.List;

@Component
public class FirebaseAuthFilter extends OncePerRequestFilter {

    private static final Logger logger = LoggerFactory.getLogger(FirebaseAuthFilter.class);

    private final UserRepository userRepository;

    // Cache uid→authority para no pegarle a la BD en cada request. TTL corto: un
    // cambio de rol se refleja en a lo sumo 5 min. Solo cacheamos usuarios ya
    // existentes (no el fallback) para no congelar un ROLE_USER de un alta en curso.
    private final Cache<String, String> roleCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(5))
            .maximumSize(10_000)
            .build();

    public FirebaseAuthFilter(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    private String resolveAuthority(String uid) {
        String cached = roleCache.getIfPresent(uid);
        if (cached != null) return cached;

        // Solo cacheamos cuando el usuario existe. Si no existe (alta en curso),
        // devolvemos ROLE_USER sin cachear para que el próximo request re-chequee.
        return userRepository.findByFirebaseUid(uid)
                .map(u -> {
                    String authority = "ROLE_" + u.getRole().name();
                    roleCache.put(uid, authority);
                    return authority;
                })
                .orElse("ROLE_USER");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        try {
            FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(token);
            String uid = decodedToken.getUid();

            // El rol de seguridad se deriva del rol persistido en la base de datos,
            // no de lo que diga el cliente (cacheado por uid, ver resolveAuthority).
            String authority = resolveAuthority(uid);

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            uid,
                            null,
                            List.of(new SimpleGrantedAuthority(authority))
                    );

            SecurityContextHolder.getContext().setAuthentication(authentication);

        } catch (Exception e) {
            logger.warn("Firebase auth failed for {}: {}", request.getRequestURI(), e.getMessage());
            SecurityContextHolder.clearContext();
        }
        filterChain.doFilter(request, response);
    }
}