package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.Set;

/**
 * El ÚNICO punto del módulo de chat que sabe que existen trabajos y mudanzas.
 * Todo lo demás (ChatService, ChatController, el frontend) opera sobre conversacion_id.
 */
@Service
public class ConversacionService {

    // El chat se abre cuando el CLIENTE ACEPTÓ (vínculo cliente-proveedor confirmado) y se
    // congela cuando el servicio cierra. Ver la tabla de la ventana de escritura en el spec.
    private static final Set<TrabajoEstado> TRABAJO_ESCRITURA = EnumSet.of(
            TrabajoEstado.EN_CURSO,
            TrabajoEstado.EN_COLA,        // aceptado, esperando turno — SÍ tiene chat
            TrabajoEstado.PRESUPUESTADO
    );

    private static final Set<TrabajoEstado> TRABAJO_LECTURA = EnumSet.of(
            TrabajoEstado.COMPLETADO,
            TrabajoEstado.CANCELADO
    );

    private static final Set<MudanzaEstado> MUDANZA_ESCRITURA = EnumSet.of(
            MudanzaEstado.ACEPTADO,
            MudanzaEstado.EN_CURSO,
            MudanzaEstado.FINALIZADO,           // puede haber pago extra en discusión
            MudanzaEstado.PENDIENTE_PAGO_EXTRA
    );

    private static final Set<MudanzaEstado> MUDANZA_LECTURA = EnumSet.of(
            MudanzaEstado.COMPLETADO,
            MudanzaEstado.CANCELADO
    );

    private final ConversacionRepository conversacionRepository;

    public ConversacionService(ConversacionRepository conversacionRepository) {
        this.conversacionRepository = conversacionRepository;
    }

    public ModoChat resolverModo(Conversacion conversacion) {
        if (conversacion.getTrabajo() != null) {
            TrabajoEstado estado = conversacion.getTrabajo().getEstado();
            if (TRABAJO_ESCRITURA.contains(estado)) return ModoChat.ESCRITURA;
            if (TRABAJO_LECTURA.contains(estado)) return ModoChat.LECTURA;
            throw new IllegalStateException(
                    "Conversación en un trabajo en estado " + estado + ": no debería existir");
        }

        if (conversacion.getMudanza() != null) {
            MudanzaEstado estado = conversacion.getMudanza().getEstado();
            if (MUDANZA_ESCRITURA.contains(estado)) return ModoChat.ESCRITURA;
            if (MUDANZA_LECTURA.contains(estado)) return ModoChat.LECTURA;
            throw new IllegalStateException(
                    "Conversación en una mudanza en estado " + estado + ": no debería existir");
        }

        // El CHECK de la base lo impide, pero si llegamos acá con datos corruptos, fallar fuerte.
        throw new IllegalStateException("Conversación " + conversacion.getId() + " sin padre");
    }

    /**
     * Idempotente: si ya existe la conversación del trabajo, la devuelve.
     * <p>
     * Si dos aceptaciones concurrentes del mismo trabajo llegan a la vez, ambas pueden pasar
     * el {@code findByTrabajoId} inicial en "no existe" y ambas intentan {@code save}. La
     * constraint {@code uq_conversacion_trabajo} rechaza al perdedor con
     * {@link DataIntegrityViolationException}; en vez de dejarla propagar, volvemos a buscar
     * y devolvemos la conversación que ganó la carrera.
     */
    @Transactional
    public Conversacion crearParaTrabajo(Trabajo trabajo) {
        if (trabajo.getProveedor() == null) {
            throw new IllegalStateException(
                    "No se puede crear la conversación: el trabajo " + trabajo.getId()
                            + " no tiene proveedor asignado");
        }
        return conversacionRepository.findByTrabajoId(trabajo.getId())
                .orElseGet(() -> {
                    Conversacion c = new Conversacion();
                    c.setTrabajo(trabajo);
                    c.setCliente(trabajo.getCliente());
                    c.setProveedor(trabajo.getProveedor());
                    try {
                        return conversacionRepository.save(c);
                    } catch (DataIntegrityViolationException e) {
                        return conversacionRepository.findByTrabajoId(trabajo.getId())
                                .orElseThrow(() -> e);
                    }
                });
    }

    /**
     * Idempotente: si ya existe la conversación de la mudanza, la devuelve.
     * <p>
     * Misma protección anti-carrera que {@link #crearParaTrabajo(Trabajo)}: si el
     * {@code save} choca contra {@code uq_conversacion_mudanza}, recuperamos y devolvemos la
     * conversación ganadora en vez de propagar la excepción al perdedor.
     */
    @Transactional
    public Conversacion crearParaMudanza(Mudanza mudanza) {
        if (mudanza.getProveedor() == null) {
            throw new IllegalStateException(
                    "No se puede crear la conversación: la mudanza " + mudanza.getId()
                            + " no tiene proveedor asignado");
        }
        return conversacionRepository.findByMudanzaId(mudanza.getId())
                .orElseGet(() -> {
                    Conversacion c = new Conversacion();
                    c.setMudanza(mudanza);
                    c.setCliente(mudanza.getCliente());
                    c.setProveedor(mudanza.getProveedor());
                    try {
                        return conversacionRepository.save(c);
                    } catch (DataIntegrityViolationException e) {
                        return conversacionRepository.findByMudanzaId(mudanza.getId())
                                .orElseThrow(() -> e);
                    }
                });
    }
}
