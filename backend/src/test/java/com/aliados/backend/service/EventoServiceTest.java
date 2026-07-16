package com.aliados.backend.service;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEvento;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEvento;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.MudanzaEventoRepository;
import com.aliados.backend.repository.TrabajoEventoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class EventoServiceTest {

    @Mock TrabajoEventoRepository trabajoEventoRepository;
    @Mock MudanzaEventoRepository mudanzaEventoRepository;

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
}
