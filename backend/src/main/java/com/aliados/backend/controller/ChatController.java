package com.aliados.backend.controller;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.dto.MarcarLeidoDTO;
import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.service.ChatService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// Log inmutable: a propósito NO hay PUT/PATCH/DELETE sobre mensajes. La autorización (IDOR) y
// el estado de escritura/lectura los resuelve ChatService; acá solo se traduce a HTTP.
@RestController
@RequestMapping("/api/conversaciones")
public class ChatController {

    // Tope duro de paginación: nadie puede pedir 10.000 mensajes de una.
    private static final int TAMANIO_MAXIMO_PAGINA = 100;

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    // Página 0 = mensajes MÁS RECIENTES (el chat se lee de abajo hacia arriba).
    @GetMapping("/{id}/mensajes")
    public ResponseEntity<Page<MensajeResponseDTO>> listar(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            Authentication authentication) {

        int tamanioSeguro = Math.min(Math.max(size, 1), TAMANIO_MAXIMO_PAGINA);
        return ResponseEntity.ok(chatService.listarMensajes(
                id, authentication.getName(), PageRequest.of(Math.max(page, 0), tamanioSeguro)));
    }

    @PostMapping("/{id}/mensajes")
    public ResponseEntity<MensajeResponseDTO> enviar(
            @PathVariable Long id,
            @Valid @RequestBody EnviarMensajeDTO dto,
            Authentication authentication) {

        return ResponseEntity.ok(chatService.enviarMensaje(id, authentication.getName(), dto));
    }

    @PostMapping("/{id}/mensajes/leidos")
    public ResponseEntity<Void> marcarLeido(
            @PathVariable Long id,
            @RequestBody MarcarLeidoDTO dto,
            Authentication authentication) {

        chatService.marcarLeido(id, authentication.getName(), dto.getHastaMensajeId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/no-leidos")
    public ResponseEntity<Map<String, Long>> noLeidos(
            @PathVariable Long id, Authentication authentication) {

        return ResponseEntity.ok(Map.of(
                "count", chatService.contarNoLeidos(id, authentication.getName())));
    }
}
