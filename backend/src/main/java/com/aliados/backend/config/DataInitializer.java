package com.aliados.backend.config;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.repository.OficioRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class DataInitializer {

    @Bean
    public CommandLineRunner initOficios(OficioRepository oficioRepository) {
        return args -> {
            if (oficioRepository.count() == 0) {
                oficioRepository.saveAll(List.of(
                        oficio("Electricista", "⚡"),
                        oficio("Plomero", "🔧"),
                        oficio("Cerrajero", "🔑"),
                        oficio("Gasista", "🔥"),
                        oficio("Pintor", "🎨"),
                        oficio("Aire acondicionado", "❄️"),
                        oficio("Fumigador", "🪲"),
                        oficio("Técnico de electrodomésticos", "🔌")
                ));
            }
        };
    }

    private Oficio oficio(String nombre, String icono) {
        Oficio o = new Oficio();
        o.setNombre(nombre);
        o.setIcono(icono);
        o.setActivo(true);
        return o;
    }
}
