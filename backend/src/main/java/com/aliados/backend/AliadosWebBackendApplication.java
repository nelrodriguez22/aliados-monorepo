package com.aliados.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import jakarta.annotation.PostConstruct;
import java.util.TimeZone;

// A5 (auditoría 2026-07-16): sin bean UserDetailsService, Spring Security genera un usuario
// "user" con contraseña random y LA IMPRIME EN EL LOG de cada arranque. Ese usuario es
// inutilizable acá (la auth real es FirebaseAuthFilter; no hay httpBasic ni formLogin), así
// que la exclusión solo saca un secreto-que-no-es-secreto de los logs de Railway.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableAsync
@EnableScheduling
public class AliadosWebBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(AliadosWebBackendApplication.class, args);
	}

	@PostConstruct
	public void init() {
		TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
	}
}