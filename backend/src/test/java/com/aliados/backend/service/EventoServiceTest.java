package com.aliados.backend.service;

import com.aliados.backend.dto.EventoResponseDTO;
import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEvento;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEvento;
import com.aliados.backend.entity.User;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.MudanzaEventoRepository;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.TrabajoEventoRepository;
import com.aliados.backend.repository.TrabajoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EventoServiceTest {

    @Mock TrabajoEventoRepository trabajoEventoRepository;
    @Mock MudanzaEventoRepository mudanzaEventoRepository;
    @Mock TrabajoRepository trabajoRepository;
    @Mock MudanzaRepository mudanzaRepository;

    @InjectMocks EventoService eventoService;

    @Test
    void registrarTrabajo_persisteTodosLosCampos() {
        Trabajo trabajo = new Trabajo();
        trabajo.setId(10L);
        User cliente = new User();
        cliente.setId(1L);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                "PENDIENTE", "CANCELADO", ActorTipo.CLIENTE, cliente, "me arrepentí");

        ArgumentCaptor<TrabajoEvento> captor = ArgumentCaptor.forClass(TrabajoEvento.class);
        verify(trabajoEventoRepository).save(captor.capture());
        TrabajoEvento e = captor.getValue();
        assertThat(e.getTrabajo()).isSameAs(trabajo);
        assertThat(e.getTipo()).isEqualTo(TipoEvento.CAMBIO_ESTADO);
        assertThat(e.getValorAnterior()).isEqualTo("PENDIENTE");
        assertThat(e.getValorNuevo()).isEqualTo("CANCELADO");
        assertThat(e.getActorTipo()).isEqualTo(ActorTipo.CLIENTE);
        assertThat(e.getActor()).isSameAs(cliente);
        assertThat(e.getDetalle()).isEqualTo("me arrepentí");
    }

    @Test
    void registrarTrabajo_sistemaVaSinActor() {
        Trabajo trabajo = new Trabajo();
        trabajo.setId(10L);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                "EN_COLA", "EN_CURSO", ActorTipo.SISTEMA, null, null);

        ArgumentCaptor<TrabajoEvento> captor = ArgumentCaptor.forClass(TrabajoEvento.class);
        verify(trabajoEventoRepository).save(captor.capture());
        assertThat(captor.getValue().getActor()).isNull();
        assertThat(captor.getValue().getActorTipo()).isEqualTo(ActorTipo.SISTEMA);
    }

    @Test
    void registrarMudanza_persisteTodosLosCampos() {
        Mudanza mudanza = new Mudanza();
        mudanza.setId(20L);
        User prov = new User();
        prov.setId(2L);

        eventoService.registrarMudanza(mudanza, TipoEvento.CAMBIO_ESTADO,
                "RESERVADO", "ACEPTADO", ActorTipo.PROVEEDOR, prov, null);

        ArgumentCaptor<MudanzaEvento> captor = ArgumentCaptor.forClass(MudanzaEvento.class);
        verify(mudanzaEventoRepository).save(captor.capture());
        MudanzaEvento e = captor.getValue();
        assertThat(e.getMudanza()).isSameAs(mudanza);
        assertThat(e.getValorAnterior()).isEqualTo("RESERVADO");
        assertThat(e.getValorNuevo()).isEqualTo("ACEPTADO");
        assertThat(e.getActorTipo()).isEqualTo(ActorTipo.PROVEEDOR);
    }

    // Lectura de timeline: tests de eventosDeTrabajo
    @Test
    void eventosDeTrabajo_mapeaADtoConNombreDeActor() {
        User cliente = new User();
        cliente.setId(1L);
        cliente.setNombre("Ana");
        Trabajo trabajo = new Trabajo();
        trabajo.setId(10L);
        TrabajoEvento e = new TrabajoEvento();
        e.setId(100L);
        e.setTrabajo(trabajo);
        e.setTipo(TipoEvento.CAMBIO_ESTADO);
        e.setValorAnterior("PENDIENTE");
        e.setValorNuevo("CANCELADO");
        e.setActorTipo(ActorTipo.CLIENTE);
        e.setActor(cliente);
        e.setDetalle("me arrepentí");
        when(trabajoRepository.existsById(10L)).thenReturn(true);
        when(trabajoEventoRepository.findByTrabajoIdOrderByIdAsc(10L)).thenReturn(List.of(e));

        var dtos = eventoService.eventosDeTrabajo(10L);

        assertThat(dtos).hasSize(1);
        assertThat(dtos.get(0).getActorNombre()).isEqualTo("Ana");
        assertThat(dtos.get(0).getValorNuevo()).isEqualTo("CANCELADO");
    }

    @Test
    void eventosDeTrabajo_actorSistemaVaSinNombre() {
        Trabajo trabajo = new Trabajo();
        trabajo.setId(10L);
        TrabajoEvento e = new TrabajoEvento();
        e.setId(100L);
        e.setTrabajo(trabajo);
        e.setTipo(TipoEvento.CAMBIO_ESTADO);
        e.setValorAnterior("EN_COLA");
        e.setValorNuevo("EN_CURSO");
        e.setActorTipo(ActorTipo.SISTEMA);
        e.setActor(null);
        when(trabajoRepository.existsById(10L)).thenReturn(true);
        when(trabajoEventoRepository.findByTrabajoIdOrderByIdAsc(10L)).thenReturn(List.of(e));

        var dtos = eventoService.eventosDeTrabajo(10L);

        assertThat(dtos.get(0).getActorNombre()).isNull();
    }

    @Test
    void eventosDeTrabajo_inexistenteLanza404() {
        when(trabajoRepository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> eventoService.eventosDeTrabajo(99L))
                .isInstanceOf(NotFoundException.class);
    }

    // Lectura de timeline: tests de eventosDeMudanza
    @Test
    void eventosDeMudanza_mapeaADtoConNombreDeActor() {
        User prov = new User();
        prov.setId(2L);
        prov.setNombre("Carlos");
        Mudanza mudanza = new Mudanza();
        mudanza.setId(20L);
        MudanzaEvento e = new MudanzaEvento();
        e.setId(200L);
        e.setMudanza(mudanza);
        e.setTipo(TipoEvento.CAMBIO_ESTADO);
        e.setValorAnterior("RESERVADO");
        e.setValorNuevo("ACEPTADO");
        e.setActorTipo(ActorTipo.PROVEEDOR);
        e.setActor(prov);
        e.setDetalle("todo bien");
        when(mudanzaRepository.existsById(20L)).thenReturn(true);
        when(mudanzaEventoRepository.findByMudanzaIdOrderByIdAsc(20L)).thenReturn(List.of(e));

        var dtos = eventoService.eventosDeMudanza(20L);

        assertThat(dtos).hasSize(1);
        assertThat(dtos.get(0).getActorNombre()).isEqualTo("Carlos");
        assertThat(dtos.get(0).getValorNuevo()).isEqualTo("ACEPTADO");
    }

    @Test
    void eventosDeMudanza_actorSistemaVaSinNombre() {
        Mudanza mudanza = new Mudanza();
        mudanza.setId(20L);
        MudanzaEvento e = new MudanzaEvento();
        e.setId(200L);
        e.setMudanza(mudanza);
        e.setTipo(TipoEvento.CAMBIO_ESTADO);
        e.setValorAnterior("RESERVADO");
        e.setValorNuevo("CANCELADO");
        e.setActorTipo(ActorTipo.SISTEMA);
        e.setActor(null);
        when(mudanzaRepository.existsById(20L)).thenReturn(true);
        when(mudanzaEventoRepository.findByMudanzaIdOrderByIdAsc(20L)).thenReturn(List.of(e));

        var dtos = eventoService.eventosDeMudanza(20L);

        assertThat(dtos.get(0).getActorNombre()).isNull();
    }

    @Test
    void eventosDeMudanza_inexistenteLanza404() {
        when(mudanzaRepository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> eventoService.eventosDeMudanza(99L))
                .isInstanceOf(NotFoundException.class);
    }
}
