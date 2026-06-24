package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "feature_flags")
@Data
public class FeatureFlag {

    @Id
    @Column(name = "key", length = 100)
    private String key;

    @Column(nullable = false)
    private Boolean enabled = false;

    @Column(columnDefinition = "TEXT")
    private String value;

    @Column(name = "value_type", nullable = false, length = 20)
    private String valueType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;
}
