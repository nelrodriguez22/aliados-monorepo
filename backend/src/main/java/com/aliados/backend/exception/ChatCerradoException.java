package com.aliados.backend.exception;

// El chat quedó en modo LECTURA (servicio cerrado: log congelado) y alguien intentó escribir.
// Existe como excepción propia -y no como IllegalStateException reutilizada- porque
// IllegalStateException ya cae hoy en el handler genérico de RuntimeException (400) para otros
// casos del módulo de chat (ver ConversacionService: conversación corrupta, sin padre, etc.).
// Mapear IllegalStateException entero a 409 hubiese cambiado ese comportamiento existente.
public class ChatCerradoException extends RuntimeException {
    public ChatCerradoException(String message) {
        super(message);
    }
}
