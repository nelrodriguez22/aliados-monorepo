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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

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

    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private MudanzaRepository mudanzaRepository;

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

    // readOnly: mantiene la sesión abierta para resolver actor LAZY durante el mapeo.
    @Transactional(readOnly = true)
    public List<EventoResponseDTO> eventosDeTrabajo(Long trabajoId) {
        if (!trabajoRepository.existsById(trabajoId)) {
            throw new NotFoundException("Trabajo no encontrado");
        }
        return trabajoEventoRepository.findByTrabajoIdOrderByIdAsc(trabajoId).stream()
                .map(e -> mapToDTO(e.getId(), e.getTipo(), e.getValorAnterior(), e.getValorNuevo(),
                        e.getActorTipo(), e.getActor(), e.getDetalle(), e.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<EventoResponseDTO> eventosDeMudanza(Long mudanzaId) {
        if (!mudanzaRepository.existsById(mudanzaId)) {
            throw new NotFoundException("Mudanza no encontrada");
        }
        return mudanzaEventoRepository.findByMudanzaIdOrderByIdAsc(mudanzaId).stream()
                .map(e -> mapToDTO(e.getId(), e.getTipo(), e.getValorAnterior(), e.getValorNuevo(),
                        e.getActorTipo(), e.getActor(), e.getDetalle(), e.getCreatedAt()))
                .toList();
    }

    private EventoResponseDTO mapToDTO(Long id, TipoEvento tipo, String valorAnterior, String valorNuevo,
                                       ActorTipo actorTipo, User actor, String detalle, LocalDateTime createdAt) {
        EventoResponseDTO dto = new EventoResponseDTO();
        dto.setId(id);
        dto.setTipo(tipo);
        dto.setValorAnterior(valorAnterior);
        dto.setValorNuevo(valorNuevo);
        dto.setActorTipo(actorTipo);
        dto.setActorNombre(actor != null ? actor.getNombre() : null);
        dto.setDetalle(detalle);
        dto.setCreatedAt(createdAt);
        return dto;
    }
}
