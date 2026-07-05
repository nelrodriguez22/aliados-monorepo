package com.aliados.backend.config;

import com.aliados.backend.websockets.WebSocketAuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Prefijos para mensajes del servidor → cliente
        config.enableSimpleBroker("/topic", "/queue");

        // Prefijo para mensajes del cliente → servidor
        config.setApplicationDestinationPrefixes("/app");

        // Prefijo para mensajes a usuarios específicos
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // SEC-6: sin HandshakeInterceptor de token por query param. La autenticación se
        // hace 100% por el header Authorization del frame STOMP CONNECT (WebSocketAuthInterceptor);
        // el front nunca manda el token en la URL (quedaría en logs/proxies/historial).
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(
                        "https://aliados-app-22.web.app",
                        "https://aliados-app.convivirtech.com.ar",
                        "http://localhost:*"
                )
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new WebSocketAuthInterceptor());
    }
}
