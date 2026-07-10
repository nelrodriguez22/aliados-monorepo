package com.aliados.backend.dto;

import java.util.List;

public record ServiciosAdminResponse(List<ServicioAdminItemDTO> items, long total) {}
