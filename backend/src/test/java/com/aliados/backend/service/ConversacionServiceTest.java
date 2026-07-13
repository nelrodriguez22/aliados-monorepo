package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    // Todavía no hay vínculo cliente-proveedor confirmado: no debería existir conversación.
    @Test
    void trabajoPendiente_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeTrabajo(TrabajoEstado.PENDIENTE)))
                .isInstanceOf(IllegalStateException.class);
    }

    // Todavía no hay vínculo cliente-proveedor confirmado: no debería existir conversación.
    @Test
    void mudanzaPendiente_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeMudanza(MudanzaEstado.PENDIENTE)))
                .isInstanceOf(IllegalStateException.class);
    }

    // El cliente "pagó" pero el proveedor todavía no aceptó: aún puede haber contrapropuesta.
    @Test
    void mudanzaReservada_lanza() {
        assertThatThrownBy(() -> conversacionService.resolverModo(
                conversacionDeMudanza(MudanzaEstado.RESERVADO)))
                .isInstanceOf(IllegalStateException.class);
    }

    // --- IDEMPOTENCIA DE LA CREACIÓN ---

    private Trabajo trabajoConPartes() {
        Trabajo t = new Trabajo();
        t.setId(1L);
        t.setCliente(new User());
        t.setProveedor(new User());
        return t;
    }

    private Mudanza mudanzaConPartes() {
        Mudanza m = new Mudanza();
        m.setId(1L);
        m.setCliente(new User());
        m.setProveedor(new User());
        return m;
    }

    @Test
    void crearParaTrabajo_conConversacionExistente_devuelveLaExistenteSinCrear() {
        Trabajo trabajo = trabajoConPartes();
        Conversacion existente = new Conversacion();
        existente.setId(99L);
        when(conversacionRepository.findByTrabajoId(trabajo.getId()))
                .thenReturn(Optional.of(existente));

        Conversacion resultado = conversacionService.crearParaTrabajo(trabajo);

        assertThat(resultado).isSameAs(existente);
        verify(conversacionRepository, never()).save(any());
    }

    // Si alguien "simplifica" el orElseGet a orElse en un refactor, save() se ejecutaría
    // SIEMPRE (por ser evaluación eager), no solo cuando falta la conversación. Este test
    // lo atrapa: fuerza el camino de creación y verifica que save se llame una única vez.
    @Test
    void crearParaTrabajo_sinConversacionPrevia_creaUnaSolaVezConDatosDelTrabajo() {
        Trabajo trabajo = trabajoConPartes();
        when(conversacionRepository.findByTrabajoId(trabajo.getId()))
                .thenReturn(Optional.empty());
        when(conversacionRepository.save(any(Conversacion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Conversacion resultado = conversacionService.crearParaTrabajo(trabajo);

        ArgumentCaptor<Conversacion> captor = ArgumentCaptor.forClass(Conversacion.class);
        verify(conversacionRepository, times(1)).save(captor.capture());
        Conversacion guardada = captor.getValue();
        assertThat(guardada.getTrabajo()).isSameAs(trabajo);
        assertThat(guardada.getCliente()).isSameAs(trabajo.getCliente());
        assertThat(guardada.getProveedor()).isSameAs(trabajo.getProveedor());
        assertThat(resultado).isSameAs(guardada);
    }

    @Test
    void crearParaMudanza_conConversacionExistente_devuelveLaExistenteSinCrear() {
        Mudanza mudanza = mudanzaConPartes();
        Conversacion existente = new Conversacion();
        existente.setId(99L);
        when(conversacionRepository.findByMudanzaId(mudanza.getId()))
                .thenReturn(Optional.of(existente));

        Conversacion resultado = conversacionService.crearParaMudanza(mudanza);

        assertThat(resultado).isSameAs(existente);
        verify(conversacionRepository, never()).save(any());
    }

    @Test
    void crearParaMudanza_sinConversacionPrevia_creaUnaSolaVezConDatosDeLaMudanza() {
        Mudanza mudanza = mudanzaConPartes();
        when(conversacionRepository.findByMudanzaId(mudanza.getId()))
                .thenReturn(Optional.empty());
        when(conversacionRepository.save(any(Conversacion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Conversacion resultado = conversacionService.crearParaMudanza(mudanza);

        ArgumentCaptor<Conversacion> captor = ArgumentCaptor.forClass(Conversacion.class);
        verify(conversacionRepository, times(1)).save(captor.capture());
        Conversacion guardada = captor.getValue();
        assertThat(guardada.getMudanza()).isSameAs(mudanza);
        assertThat(guardada.getCliente()).isSameAs(mudanza.getCliente());
        assertThat(guardada.getProveedor()).isSameAs(mudanza.getProveedor());
        assertThat(resultado).isSameAs(guardada);
    }
}
