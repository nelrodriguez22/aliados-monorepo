package com.aliados.backend.dto;

public record SignatureResponse(
        String signature,
        long timestamp,
        String apiKey,
        String cloudName,
        String folder
) {}
