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

    // Teléfono argentino: 9+ dígitos, permitiendo separadores (espacio, guion, punto) y un
    // prefijo internacional opcional. (El grupo {8,} exige 8 repeticiones MÁS el \d final: el
    // piso real es 9, no 8.)
    //
    // ¿Por qué 9 y no 8? El DNI argentino tiene 8 dígitos ("35123456") y el fijo de CABA
    // también tiene 8 ("4321-5678"): son indistinguibles por conteo de dígitos, cualquier
    // umbral que detecte el fijo detecta también el DNI. Se elige el piso de 9 para NO marcar
    // DNIs, aceptando conscientemente NO detectar fijos de 8 dígitos: en este dominio un DNI
    // es mucho más plausible en un chat que un teléfono fijo compartido por chat, y la
    // prioridad declarada es minimizar falsos positivos. Los celulares con código de área son
    // de 10 dígitos ("11 5555 4444"), así que se detectan sin problema.
    //
    // NO bajes este umbral a 8 "para que coincida con el comentario": reintroducirías el falso
    // positivo de DNI. Ver DetectorContactoTest#noDetectaDni y #noDetectaDniConPuntos, que
    // existen específicamente para frenar ese cambio.
    //
    // Nota aparte: el CUIT (11 dígitos, "20-12345678-9") SÍ da falso positivo, y es aceptado a
    // propósito. Ver DetectorContactoTest#detectaCuit_falsoPositivoAceptado.
    private static final Pattern TELEFONO = Pattern.compile(
            "(\\+?\\d{1,3}[\\s.-]?)?(\\d[\\s.-]?){8,}\\d"
    );

    private static final Pattern EMAIL = Pattern.compile(
            "[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}"
    );

    /**
     * Indica si {@code texto} contiene (probablemente) un teléfono o un email.
     *
     * Es una señal PASIVA: no modifica ni bloquea el texto, solo lo marca para medir la fuga
     * de comisión hacia contacto directo (WhatsApp, email). Está calibrada para minimizar
     * falsos positivos a costa de dejar pasar algunos casos reales; ver el comentario de
     * {@link #TELEFONO} para el detalle del trade-off (por qué 9 dígitos y no 8, y por qué el
     * falso positivo del CUIT se acepta a propósito).
     *
     * @param texto mensaje de chat a evaluar; {@code null} o en blanco se considera sin contacto
     * @return {@code true} si el patrón de teléfono o de email matchea en algún punto del texto
     */
    public boolean contieneContacto(String texto) {
        if (texto == null || texto.isBlank()) return false;
        return TELEFONO.matcher(texto).find() || EMAIL.matcher(texto).find();
    }
}
