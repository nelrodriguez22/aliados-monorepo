package com.aliados.backend.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LecturaConversacionId implements Serializable {
    private Long conversacionId;
    private Long usuarioId;
}
