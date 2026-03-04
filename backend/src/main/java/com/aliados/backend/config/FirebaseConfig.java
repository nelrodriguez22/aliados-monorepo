package com.aliados.backend.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Configuration
public class FirebaseConfig {

    @Bean
    public FirebaseApp initializeFirebase() throws IOException {
        // Leer credenciales desde variable de entorno
        String firebaseCredentials = System.getenv("FIREBASE_CREDENTIALS");

        if (firebaseCredentials == null || firebaseCredentials.isEmpty()) {
            throw new IllegalStateException("FIREBASE_CREDENTIALS no está configurada");
        }

        FirebaseOptions options = FirebaseOptions.builder()
                .setCredentials(GoogleCredentials.fromStream(
                        new ByteArrayInputStream(firebaseCredentials.getBytes(StandardCharsets.UTF_8))
                ))
                .build();

        return FirebaseApp.initializeApp(options);
    }
}