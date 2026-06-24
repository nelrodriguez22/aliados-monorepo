package com.aliados.backend.dto;

import com.aliados.backend.entity.FeatureFlag;

import java.time.Instant;

public record FeatureFlagDto(
        String key,
        boolean enabled,
        String value,
        String valueType,
        String description,
        Instant updatedAt,
        String updatedBy
) {
    public static FeatureFlagDto from(FeatureFlag f) {
        return new FeatureFlagDto(
                f.getKey(),
                Boolean.TRUE.equals(f.getEnabled()),
                f.getValue(),
                f.getValueType(),
                f.getDescription(),
                f.getUpdatedAt(),
                f.getUpdatedBy()
        );
    }
}
