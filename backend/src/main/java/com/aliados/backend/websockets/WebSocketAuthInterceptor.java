package com.aliados.backend.websockets;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;

import java.security.Principal;

public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        // SEC-3: solo autenticamos en CONNECT. El Principal queda asociado a la sesión
        // STOMP y persiste para los frames siguientes (SUBSCRIBE/SEND), así que el resto
        // pasa sin re-verificar.
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                // SEC-3: sin token válido no se abre la conexión (antes se dejaba pasar
                // como anónimo, lo que permitía suscribirse a /topic/** sin auth).
                throw new MessagingException("WebSocket CONNECT sin token de autenticación");
            }

            String token = authHeader.substring(7);
            try {
                FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(token);
                String uid = decodedToken.getUid();

                accessor.setUser(new Principal() {
                    @Override
                    public String getName() {
                        return uid;
                    }
                });

                logger.debug("WebSocket autenticado para usuario: {}", uid);
            } catch (MessagingException e) {
                throw e;
            } catch (Exception e) {
                // Token presente pero inválido/expirado → rechazamos la conexión.
                logger.warn("WebSocket CONNECT con token inválido: {}", e.getMessage());
                throw new MessagingException("Token de WebSocket inválido");
            }
        }

        return message;
    }}