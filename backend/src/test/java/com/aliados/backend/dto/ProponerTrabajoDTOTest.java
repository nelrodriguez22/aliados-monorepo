package com.aliados.backend.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SEC-8: el endpoint PATCH /api/trabajos/{id}/proponer debe validar el body con un DTO
 * tipado (@Valid) en vez de castear un Map crudo. Así los tipos inválidos o el tiempo
 * ausente dan 400 (validación) en vez de 500 (ClassCastException/NPE).
 */
class ProponerTrabajoDTOTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private boolean violaCampo(Set<ConstraintViolation<ProponerTrabajoDTO>> v, String campo) {
        return v.stream().anyMatch(c -> c.getPropertyPath().toString().equals(campo));
    }

    @Test
    void sinTiempoEstimado_esInvalido() {
        ProponerTrabajoDTO dto = new ProponerTrabajoDTO();

        Set<ConstraintViolation<ProponerTrabajoDTO>> v = validator.validate(dto);

        assertThat(violaCampo(v, "tiempoEstimadoMinutos")).isTrue();
    }

    @Test
    void tiempoEstimadoNoPositivo_esInvalido() {
        ProponerTrabajoDTO dto = new ProponerTrabajoDTO();
        dto.setTiempoEstimadoMinutos(0);

        Set<ConstraintViolation<ProponerTrabajoDTO>> v = validator.validate(dto);

        assertThat(violaCampo(v, "tiempoEstimadoMinutos")).isTrue();
    }

    @Test
    void tarifaNegativa_esInvalida() {
        ProponerTrabajoDTO dto = new ProponerTrabajoDTO();
        dto.setTiempoEstimadoMinutos(60);
        dto.setTarifaVisita(new BigDecimal("-100"));

        Set<ConstraintViolation<ProponerTrabajoDTO>> v = validator.validate(dto);

        assertThat(violaCampo(v, "tarifaVisita")).isTrue();
    }

    @Test
    void dtoValido_sinViolaciones() {
        ProponerTrabajoDTO dto = new ProponerTrabajoDTO();
        dto.setTiempoEstimadoMinutos(60);
        dto.setLatitud(-32.95);
        dto.setLongitud(-60.64);
        dto.setTarifaVisita(new BigDecimal("1500.00"));

        Set<ConstraintViolation<ProponerTrabajoDTO>> v = validator.validate(dto);

        assertThat(v).isEmpty();
    }
}
