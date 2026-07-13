package com.aliados.backend.config;

import com.aliados.backend.exception.ChatCerradoException;
import com.aliados.backend.exception.ConflictException;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.exception.NotFoundException;
import io.sentry.Sentry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "Forbidden",
                "message", "No tenés permisos para realizar esta acción",
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "error", "Not Found",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<Map<String, Object>> handleForbidden(ForbiddenException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "Forbidden",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(ConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                "error", "Conflict",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    // Chat cerrado (log congelado): NO se reutiliza IllegalStateException para esto porque esa
    // clase ya cae en handleRuntimeException (400) para otros casos del módulo de chat
    // (ConversacionService: conversación corrupta / sin padre). Mapearla entera a 409 hubiese
    // cambiado ese comportamiento existente.
    @ExceptionHandler(ChatCerradoException.class)
    public ResponseEntity<Map<String, Object>> handleChatCerrado(ChatCerradoException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                "error", "Conflict",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    // Defensa IDOR del módulo de chat: ChatService.autorizar() lanza SecurityException cuando
    // el usuario autenticado no participa de la conversación.
    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, Object>> handleSecurityException(SecurityException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "Forbidden",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntimeException(RuntimeException e) {
        logger.error("RuntimeException: {}", e.getMessage());
        // Heurística: los errores de negocio se lanzan como `new RuntimeException("msg")`
        // (clase exacta RuntimeException) → no son bugs, no van a Sentry. Las SUBCLASES
        // (NPE, IllegalState, etc.) sí son bugs reales → capturarlas.
        if (e.getClass() != RuntimeException.class) {
            Sentry.captureException(e);
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "error", "Bad Request",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "error", "Validation Error",
                "message", e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    // Falla de @Valid en un @RequestBody. Gap preexistente: no es RuntimeException (extiende
    // Exception directamente), así que sin este handler cae en el genérico de abajo -> 500 en
    // vez de 400. Afecta a TODOS los controllers que usan @Valid (Trabajo, Mudanza, User,
    // Calificacion, BugReport), no solo al chat: se corrige acá porque esta tarea agrega el
    // primer test que efectivamente ejercita ese camino.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        String mensaje = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(err -> err.getDefaultMessage())
                .orElse("Datos inválidos");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "error", "Validation Error",
                "message", mensaje,
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    // Gemelo de MethodArgumentNotValidException: JSON malformado o un enum inválido en el body
    // (ej. {"tipo":"AUDIO"} en POST /api/conversaciones/{id}/mensajes) lanza esta excepción.
    // OJO: HttpMessageNotReadableException extends HttpMessageConversionException extends
    // NestedRuntimeException extends RuntimeException, así que SIN este handler específico ya
    // caía en handleRuntimeException (no en el genérico de abajo) y devolvía 400 -- pero con
    // e.getMessage() crudo, que expone nombres de clases y detalles internos de deserialización
    // Jackson (verificado: "JSON parse error: Cannot deserialize value of type
    // `com.aliados.backend.entity.TipoMensaje`..."). Acá cortamos ese leak con un mensaje
    // genérico y evitamos el ruido en Sentry que agregaba handleRuntimeException para esta
    // clase (no es un bug: es un body inválido que mandó el cliente).
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleMessageNotReadable(HttpMessageNotReadableException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "error", "Bad Request",
                "message", "El cuerpo de la petición no es válido",
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGenericException(Exception e) {
        logger.error("Unexpected error: {}", e.getMessage(), e);
        Sentry.captureException(e); // 500 inesperado → siempre a Sentry

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "error", "Internal Server Error",
                "message", "Ocurrió un error inesperado",
                "timestamp", LocalDateTime.now().toString()
        ));
    }
}
