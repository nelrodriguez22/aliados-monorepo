package com.aliados.backend.service;

import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Detección PASIVA de datos de contacto. MARCA, no censura ni bloquea.
 *
 * Sirve para medir el bypass de comisión (fuga a WhatsApp) sin romper conversaciones legítimas
 * y sin destruir evidencia. Si algún día se decide bloquear, primero habrá datos para saber si
 * el problema existe de verdad.
 *
 * Se calibra para MINIMIZAR FALSOS POSITIVOS: en este dominio hay montos ($150000), alturas de
 * direcciones (Rivadavia 4567) y horarios. Marcar un presupuesto como "teléfono" es peor que
 * dejar pasar un teléfono.
 */
@Component
public class DetectorContacto {

    // Teléfono argentino: 8+ dígitos, permitiendo separadores (espacio, guion, punto) y un
    // prefijo internacional opcional. El piso de 8 dígitos es lo que excluye montos y alturas:
    // un monto de "150000" son 6 dígitos; una altura, 4.
    private static final Pattern TELEFONO = Pattern.compile(
            "(\\+?\\d{1,3}[\\s.-]?)?(\\d[\\s.-]?){8,}\\d"
    );

    private static final Pattern EMAIL = Pattern.compile(
            "[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}"
    );

    public boolean contieneContacto(String texto) {
        if (texto == null || texto.isBlank()) return false;
        return TELEFONO.matcher(texto).find() || EMAIL.matcher(texto).find();
    }
}
