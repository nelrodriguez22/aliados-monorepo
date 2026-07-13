package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(MockitoExtension.class)
class ConversacionServiceTest {

    @Mock ConversacionRepository conversacionRepository;

    @InjectMocks ConversacionService conversacionService;

    private Conversacion conversacionDeTrabajo(TrabajoEstado estado) {
        Trabajo t = new Trabajo();
        t.setEstado(estado);
        Conversacion c = new Conversacion();
        c.setTrabajo(t);
        return c;
    }

    private Conversacion conversacionDeMudanza(MudanzaEstado estado) {
        Mudanza m = new Mudanza();
        m.setEstado(estado);
        Conversacion c = new Conversacion();
        c.setMudanza(m);
        return c;
    }

    // --- TRABAJO ---

    @Test
    void trabajoEnCurso_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.EN_CURSO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    // EL CASO QUE EL PLACEHOLDER ACTUAL SE PERDÍA. El cliente ya aceptó y espera turno porque el
    // proveedor está ocupado: es el momento de MAYOR ansiedad, justo cuando quiere preguntar
    // "¿cuándo venís?". Si este test no existe, la implementación lo va a omitir.
    @Test
    void trabajoEnCola_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.EN_COLA)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void trabajoPresupuestado_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.PRESUPUESTADO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void trabajoCompletado_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.COMPLETADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    @Test
    void trabajoCancelado_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeTrabajo(TrabajoEstado.CANCELADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    // --- MUDANZA ---

    @Test
    void mudanzaAceptada_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.ACEPTADO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void mudanzaEnCurso_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.EN_CURSO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    // La mudanza YA TERMINÓ físicamente, pero si hay un pago extra en discusión, cerrar el chat
    // acá sería cerrarlo justo cuando más se necesita.
    @Test
    void mudanzaFinalizada_permiteEscritura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.FINALIZADO)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void mudanzaPendientePagoExtra_permiteEscritura() {
        assertThat(conversacionService.resolverModo(
                conversacionDeMudanza(MudanzaEstado.PENDIENTE_PAGO_EXTRA)))
                .isEqualTo(ModoChat.ESCRITURA);
    }

    @Test
    void mudanzaCompletada_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.COMPLETADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    @Test
    void mudanzaCancelada_soloLectura() {
        assertThat(conversacionService.resolverModo(conversacionDeMudanza(MudanzaEstado.CANCELADO)))
                .isEqualTo(ModoChat.LECTURA);
    }

    // Estados sin conversación: si por un bug se creara una conversación en un estado previo a la
    // aceptación, resolverModo debe explotar en vez de devolver un modo silenciosamente.
    @Test
    void mudanzaContrapropuesta_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeMudanza(MudanzaEstado.CONTRAPROPUESTO)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void trabajoPropuesto_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeTrabajo(TrabajoEstado.PROPUESTO)))
                .isInstanceOf(IllegalStateException.class);
    }
}
