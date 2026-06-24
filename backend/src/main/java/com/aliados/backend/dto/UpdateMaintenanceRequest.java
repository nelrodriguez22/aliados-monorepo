package com.aliados.backend.dto;

public record UpdateMaintenanceRequest(String level, String title, String message, String schedule, String duration) {}
