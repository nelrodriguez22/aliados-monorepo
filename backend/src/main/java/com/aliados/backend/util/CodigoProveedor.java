package com.aliados.backend.util;

import java.text.Normalizer;

/**
 * Código identificatorio legible del proveedor: PREFIJO-NNNN.
 * PREFIJO = primeras 3 letras del oficio (mayúsculas, sin acentos).
 * NNNN = User.id con ceros a la izquierda a 4 dígitos (no trunca si supera 9999).
 * Única fuente de verdad del formato: el frontend solo muestra el string.
 */
public final class CodigoProveedor {

    private CodigoProveedor() {}

    public static String format(String oficioNombre, Long id) {
        if (oficioNombre == null || id == null) {
            return null;
        }
        String sinAcentos = Normalizer.normalize(oficioNombre, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String soloLetras = sinAcentos.replaceAll("[^A-Za-z]", "");
        if (soloLetras.isEmpty()) {
            return null;
        }
        String prefijo = soloLetras
                .substring(0, Math.min(3, soloLetras.length()))
                .toUpperCase();
        return prefijo + "-" + String.format("%04d", id);
    }
}
