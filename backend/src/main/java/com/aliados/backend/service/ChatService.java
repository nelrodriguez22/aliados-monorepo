package com.aliados.backend.service;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.event.MensajeCreatedEvent;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * El corazón del módulo de chat. NO sabe que existen trabajos y mudanzas: todo lo que necesita
 * saber sobre el vertical (estado de escritura/lectura, id de la entidad padre, deep link) se lo
 * pide a {@link ConversacionService}, el único punto autorizado a conocer ambos verticales.
 */
@Service
public class ChatService {

    private final ConversacionRepository conversacionRepository;
    private final MensajeRepository mensajeRepository;
    private final LecturaConversacionRepository lecturaRepository;
    private final UserRepository userRepository;
    private final ConversacionService conversacionService;
    private final DetectorContacto detectorContacto;
    private final ApplicationEventPublisher eventPublisher;

    public ChatService(ConversacionRepository conversacionRepository,
                       MensajeRepository mensajeRepository,
                       LecturaConversacionRepository lecturaRepository,
                       UserRepository userRepository,
                       ConversacionService conversacionService,
                       DetectorContacto detectorContacto,
                       ApplicationEventPublisher eventPublisher) {
        this.conversacionRepository = conversacionRepository;
        this.mensajeRepository = mensajeRepository;
        this.lecturaRepository = lecturaRepository;
        this.userRepository = userRepository;
        this.conversacionService = conversacionService;
        this.detectorContacto = detectorContacto;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public MensajeResponseDTO enviarMensaje(Long conversacionId, String firebaseUid,
                                            EnviarMensajeDTO dto) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User emisor = buscarUsuario(firebaseUid);

        // 1. Autorización: una sola fila, sin joins al padre. Sin ramas por vertical → sin IDOR.
        autorizar(conversacion, emisor);

        // 2. Log congelado.
        if (conversacionService.resolverModo(conversacion) != ModoChat.ESCRITURA) {
            throw new IllegalStateException("El servicio está cerrado: el chat es sólo lectura");
        }

        // 3. Coherencia contenido/tipo.
        validarContenido(dto);

        Mensaje mensaje = new Mensaje();
        mensaje.setConversacion(conversacion);
        mensaje.setEmisor(emisor);
        mensaje.setTipo(dto.getTipo());
        mensaje.setContenido(dto.getContenido());
        mensaje.setImagenUrl(dto.getImagenUrl());
        // MARCA, no censura: el contenido se guarda intacto.
        mensaje.setContieneContacto(detectorContacto.contieneContacto(dto.getContenido()));

        // PERSISTIR PRIMERO, y publicar (evento) DESPUÉS. El evento se procesa recién en
        // AFTER_COMMIT (ver MensajeEventListener): la garantía real es que nadie puede ver por
        // el socket un mensaje que la base no terminó de confirmar. Antes de este fix el publish
        // salía acá mismo, dentro de la transacción — y todo lo que corre después (incluido el
        // commit en sí, que Neon puede fallar sin que medie ningún bug de código) podía hacer
        // rollback dejando un mensaje fantasma del lado del destinatario. Con el evento
        // AFTER_COMMIT el único modo de falla posible es "mensaje demorado" (si el listener
        // falla, el mensaje ya está en la base y aparece al recargar), que es estrictamente
        // mejor que un mensaje fantasma.
        Mensaje guardado = mensajeRepository.save(mensaje);
        MensajeResponseDTO response = aDTO(guardado);

        User destinatario = destinatarioDe(conversacion, emisor);
        eventPublisher.publishEvent(
                new MensajeCreatedEvent(conversacion, emisor, destinatario, guardado, response));

        return response;
    }

    @Transactional(readOnly = true)
    public Page<MensajeResponseDTO> listarMensajes(Long conversacionId, String firebaseUid,
                                                   Pageable pageable) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User usuario = buscarUsuario(firebaseUid);
        autorizar(conversacion, usuario);

        return mensajeRepository
                .findByConversacionIdOrderByIdDesc(conversacionId, pageable)
                .map(this::aDTO);
    }

    @Transactional
    public void marcarLeido(Long conversacionId, String firebaseUid, Long hastaMensajeId) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User usuario = buscarUsuario(firebaseUid);
        autorizar(conversacion, usuario);

        LecturaConversacion lectura = lecturaRepository
                .findByConversacionIdAndUsuarioId(conversacionId, usuario.getId())
                .orElseGet(() -> {
                    LecturaConversacion nueva = new LecturaConversacion();
                    nueva.setConversacionId(conversacionId);
                    nueva.setUsuarioId(usuario.getId());
                    return nueva;
                });

        // El puntero sólo avanza. Un request fuera de orden no puede "des-leer" mensajes.
        // hastaMensajeId == null es un no-op (no hay nada hasta dónde marcar), nunca un NPE.
        Long actual = lectura.getUltimoMensajeLeidoId();
        if (hastaMensajeId != null && (actual == null || hastaMensajeId > actual)) {
            // El puntero sólo avanza y NUNCA se recupera solo: si se dejara mover a un id que no
            // es de esta conversación (por bug o por payload manipulado), contarNoLeidos
            // quedaría en 0 para siempre. Validamos antes de mover.
            if (!mensajeRepository.existsByIdAndConversacionId(hastaMensajeId, conversacionId)) {
                throw new IllegalArgumentException(
                        "El mensaje indicado no pertenece a esta conversación");
            }
            lectura.setUltimoMensajeLeidoId(hastaMensajeId);
            lecturaRepository.save(lectura);
        }
    }

    @Transactional(readOnly = true)
    public long contarNoLeidos(Long conversacionId, String firebaseUid) {
        Conversacion conversacion = buscarConversacion(conversacionId);
        User usuario = buscarUsuario(firebaseUid);
        autorizar(conversacion, usuario);

        return lecturaRepository
                .findByConversacionIdAndUsuarioId(conversacionId, usuario.getId())
                .map(l -> l.getUltimoMensajeLeidoId() == null
                        ? mensajeRepository.countByConversacionId(conversacionId)
                        : mensajeRepository.countByConversacionIdAndIdGreaterThan(
                                conversacionId, l.getUltimoMensajeLeidoId()))
                .orElseGet(() -> mensajeRepository.countByConversacionId(conversacionId));
    }

    // --- privados ---

    private Conversacion buscarConversacion(Long id) {
        return conversacionRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Conversación no encontrada"));
    }

    private User buscarUsuario(String firebaseUid) {
        return userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
    }

    private void autorizar(Conversacion c, User u) {
        boolean participa = c.getCliente().getId().equals(u.getId())
                || c.getProveedor().getId().equals(u.getId());
        if (!participa) {
            throw new SecurityException("No participás de esta conversación");
        }
    }

    private User destinatarioDe(Conversacion c, User emisor) {
        return c.getCliente().getId().equals(emisor.getId())
                ? c.getProveedor()
                : c.getCliente();
    }

    private void validarContenido(EnviarMensajeDTO dto) {
        if (dto.getTipo() == TipoMensaje.TEXTO
                && (dto.getContenido() == null || dto.getContenido().isBlank())) {
            throw new IllegalArgumentException("Un mensaje de texto necesita contenido");
        }
        if (dto.getTipo() == TipoMensaje.IMAGEN
                && (dto.getImagenUrl() == null || dto.getImagenUrl().isBlank())) {
            throw new IllegalArgumentException("Un mensaje de imagen necesita imagenUrl");
        }
    }

    private MensajeResponseDTO aDTO(Mensaje m) {
        MensajeResponseDTO dto = new MensajeResponseDTO();
        dto.setId(m.getId());
        dto.setConversacionId(m.getConversacion().getId());
        dto.setEmisorId(m.getEmisor().getId());
        dto.setEmisorNombre(m.getEmisor().getNombre());
        dto.setTipo(m.getTipo());
        dto.setContenido(m.getContenido());
        dto.setImagenUrl(m.getImagenUrl());
        dto.setCreadoAt(m.getCreadoAt());
        return dto;
    }
}
