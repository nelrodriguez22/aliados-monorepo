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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Registro del audit log de ciclo de vida. Deliberadamente tonto: no deduce el
 * estado anterior (leerlo de la entidad ya mutada sería un bug sutil) ni captura
 * excepciones (el evento es parte de la transición, no telemetría best-effort:
 * si el INSERT falla, la transición completa falla y Sentry lo reporta).
 *
 * Sin @Transactional propio: corre en la transacción del caller, así el evento
 * rollbackea junto con la transición que lo originó.
 */
@Service
public class EventoService {

    @Autowired
    private TrabajoEventoRepository trabajoEventoRepository;

    @Autowired
    private MudanzaEventoRepository mudanzaEventoRepository;

    public void registrarTrabajo(Trabajo trabajo, TipoEvento tipo, String valorAnterior,
                                 String valorNuevo, ActorTipo actorTipo, User actor, String detalle) {
        TrabajoEvento e = new TrabajoEvento();
        e.setTrabajo(trabajo);
        e.setTipo(tipo);
        e.setValorAnterior(valorAnterior);
        e.setValorNuevo(valorNuevo);
        e.setActorTipo(actorTipo);
        e.setActor(actor);
        e.setDetalle(detalle);
        trabajoEventoRepository.save(e);
    }

    public void registrarMudanza(Mudanza mudanza, TipoEvento tipo, String valorAnterior,
                                 String valorNuevo, ActorTipo actorTipo, User actor, String detalle) {
        MudanzaEvento e = new MudanzaEvento();
        e.setMudanza(mudanza);
        e.setTipo(tipo);
        e.setValorAnterior(valorAnterior);
        e.setValorNuevo(valorNuevo);
        e.setActorTipo(actorTipo);
        e.setActor(actor);
        e.setDetalle(detalle);
        mudanzaEventoRepository.save(e);
    }
}
