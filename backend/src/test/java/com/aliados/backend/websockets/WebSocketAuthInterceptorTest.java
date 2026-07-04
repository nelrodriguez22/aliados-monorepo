package com.aliados.backend.websockets;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * SEC-3: un CONNECT STOMP sin token válido no debe autenticarse. La conexión se
 * rechaza (excepción en preSend) en vez de dejar pasar un cliente anónimo.
 */
class WebSocketAuthInterceptorTest {

    private final WebSocketAuthInterceptor interceptor = new WebSocketAuthInterceptor();
    private final MessageChannel channel = mock(MessageChannel.class);

    private Message<byte[]> connect(String authHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        if (authHeader != null) {
            accessor.setNativeHeader("Authorization", authHeader);
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    @Test
    void preSend_connectSinHeader_rechaza() {
        assertThatThrownBy(() -> interceptor.preSend(connect(null), channel))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void preSend_connectHeaderSinBearer_rechaza() {
        assertThatThrownBy(() -> interceptor.preSend(connect("Basic abc"), channel))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void preSend_frameNoConnect_pasaSinTocar() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        Message<byte[]> msg = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        Message<?> result = interceptor.preSend(msg, channel);

        assertThat(result).isSameAs(msg);
    }
}
