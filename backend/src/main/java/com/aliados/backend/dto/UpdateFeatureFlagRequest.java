package com.aliados.backend.dto;

public record UpdateFeatureFlagRequest(
        boolean enabled,
        String value
) {}
