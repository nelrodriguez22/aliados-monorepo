package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.ConversacionRepository;
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

    /** El id de la entidad padre (trabajo o mudanza), para asociarlo a la notificación. */
    public Long entidadIdDe(Conversacion conversacion) {
        if (conversacion.getTrabajo() != null) return conversacion.getTrabajo().getId();
        if (conversacion.getMudanza() != null) return conversacion.getMudanza().getId();
        throw new IllegalStateException("Conversación " + conversacion.getId() + " sin padre");
    }

    /**
     * Deep link a la pantalla donde vive el chat, según el vertical (trabajo o mudanza) y el rol
     * del destinatario. No contempla las pantallas de "completado": un chat cerrado no puede
     * recibir mensajes nuevos, así que nunca se genera una push hacia ahí.
     */
    public String deepLinkChat(Conversacion conversacion, boolean destinatarioEsCliente) {
        if (conversacion.getTrabajo() != null) {
            Long id = conversacion.getTrabajo().getId();
            return destinatarioEsCliente ? "/cliente/seguimiento/" + id : "/proveedor/trabajo-activo/" + id;
        }
        if (conversacion.getMudanza() != null) {
            Long id = conversacion.getMudanza().getId();
            return destinatarioEsCliente ? "/cliente/mudanza/" + id : "/proveedor/mudanza/" + id;
        }
        throw new IllegalStateException("Conversación " + conversacion.getId() + " sin padre");
    }

    // ─────────────────────────────────────────────────────────────────────────────────────
    // CREACIÓN DE LA CONVERSACIÓN — LEER ANTES DE "ARREGLAR" LA CARRERA CONCURRENTE
    //
    // Estos métodos se llaman DENTRO de la transacción de la aceptación (TrabajoService
    // .aceptarPropuesta / MudanzaService.aceptarMudanza y .aceptarContrapropuesta), con
    // propagación REQUIRED. Eso es DELIBERADO: la conversación tiene que commitear
    // atómicamente con la aceptación. Si la creáramos en una transacción propia
    // (REQUIRES_NEW) que commitea aparte y después la aceptación hiciera rollback,
    // quedaría una conversación huérfana colgada de un trabajo en PROPUESTO — exactamente
    // el dato corrupto que resolverModo() denuncia con IllegalStateException.
    //
    // Consecuencia: el check-then-act de abajo TIENE una carrera si dos aceptaciones
    // concurrentes del mismo trabajo/mudanza llegan a la vez, y NO se puede resolver acá
    // con un catch(DataIntegrityViolationException) + reintento del findByXId. En Postgres
    // una sentencia fallida aborta la transacción entera: el SELECT del reintento correría
    // sobre una transacción ya abortada y fallaría igual. Un catch-retry se vería verde en
    // tests con el repo mockeado y explotaría en producción.
    //
    // La garantía real de unicidad son las constraints uq_conversacion_trabajo /
    // uq_conversacion_mudanza (V11__chat_conversaciones.sql). Ante un doble-accept
    // concurrente, el perdedor rollbackea su transacción COMPLETA (aceptación incluida):
    // nunca existen dos conversaciones, los datos quedan consistentes, el usuario ve un
    // error, recarga, y el trabajo figura aceptado una sola vez. Es correcto y seguro.
    // ─────────────────────────────────────────────────────────────────────────────────────

    /** Idempotente: si ya existe la conversación del trabajo, la devuelve. */
    @Transactional
    public Conversacion crearParaTrabajo(Trabajo trabajo) {
        // proveedor es nullable en Trabajo, pero conversacion.proveedor_id es NOT NULL: sin
        // esta guarda el error sería una constraint de base opaca en vez de decir qué faltó.
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
                    return conversacionRepository.save(c);
                });
    }

    /** Idempotente: si ya existe la conversación de la mudanza, la devuelve. */
    @Transactional
    public Conversacion crearParaMudanza(Mudanza mudanza) {
        // Misma guarda que en crearParaTrabajo: proveedor nullable vs. proveedor_id NOT NULL.
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
                    return conversacionRepository.save(c);
                });
    }
}
