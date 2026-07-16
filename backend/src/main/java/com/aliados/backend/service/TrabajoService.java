package com.aliados.backend.service;

import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.dto.OficioResponseDTO;
import com.aliados.backend.dto.PagedTrabajosResponse;
import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.util.RegionRosario;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.hibernate.Hibernate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true) // sesión abierta durante el mapeo a DTO (asociaciones LAZY); los writers la sobreescriben con @Transactional
public class TrabajoService {

    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private OficioRepository oficioRepository;

    @Autowired
    private UserService userService;

    @Autowired
    private CalificacionRepository calificacionRepository;

    @Autowired
    private NotificacionService notificacionService;

    @Autowired
    private ProviderScoreService providerScoreService;

    @Autowired
    private CloudinaryService cloudinaryService;

    @Autowired
    private FeatureFlagService featureFlagService;

    @Autowired
    private TrabajoOfertaRepository trabajoOfertaRepository;

    @Autowired
    private ConversacionService conversacionService;

    @Autowired
    private ConversacionRepository conversacionRepository;

    @Autowired
    private EventoService eventoService;

    private static final Logger logger = LoggerFactory.getLogger(TrabajoService.class);

    // package-private para test; lee los límites de feature flags.
    int getLimiteTrabajos(Oficio oficio) {
        if (oficio != null && oficio.getNombre().equalsIgnoreCase("Flete")) {
            return (int) featureFlagService.getNumber("limite_trabajos_flete", 8.0);
        }
        return (int) featureFlagService.getNumber("limite_trabajos_default", 3.0);
    }

    @Transactional
    public TrabajoResponseDTO crearTrabajo(String clienteFirebaseUid, CrearTrabajoDTO dto) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Oficio oficio = oficioRepository.findById(dto.getOficioId())
                .orElseThrow(() -> new NotFoundException("Oficio no encontrado"));

        Trabajo trabajo = new Trabajo();
        trabajo.setCliente(cliente);
        trabajo.setOficio(oficio);
        trabajo.setDescripcion(dto.getDescripcion());
        trabajo.setDireccion(dto.getDireccion());
        trabajo.setLatitudCliente(dto.getLatitudCliente());
        trabajo.setLongitudCliente(dto.getLongitudCliente());
        // jsonb solo acepta JSON válido o NULL: normalizamos vacíos a null
        trabajo.setFotos(dto.getFotos() == null || dto.getFotos().isBlank() ? null : dto.getFotos());
        trabajo.setEstado(TrabajoEstado.PENDIENTE);

        // Destino (opcional, para Flete)
        if (dto.getDireccionDestino() != null) {
            trabajo.setDireccionDestino(dto.getDireccionDestino());
            trabajo.setLatitudDestino(dto.getLatitudDestino());
            trabajo.setLongitudDestino(dto.getLongitudDestino());
        }

        if (!RegionRosario.contiene(dto.getLatitudCliente(), dto.getLongitudCliente())) {
            throw new RuntimeException("Por el momento, Aliados solo está disponible en Rosario, Santa Fe.");
        }

        trabajo = trabajoRepository.save(trabajo);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO, null,
                TrabajoEstado.PENDIENTE.name(), ActorTipo.CLIENTE, cliente, null);

        ofrecerSiguienteGrupo(trabajo);

        return mapToDTO(trabajo);
    }

    public List<TrabajoResponseDTO> getTrabajosPendientes(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        if (proveedor.getOficio() == null) {
            throw new RuntimeException("El proveedor no tiene un oficio asignado");
        }

        // Filtra por trabajos donde el proveedor tiene una oferta OFRECIDA (nuevo modelo de grupos).
        List<Trabajo> trabajos = trabajoRepository.findPendientesOfrecidosA(
                proveedor.getId(), proveedor.getOficio().getId());

        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);
        Map<Long, Conversacion> conversacionPorTrabajo = conversacionesPorTrabajo(trabajos);

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor, conversacionPorTrabajo))
                .collect(Collectors.toList());
    }

    public TrabajoResponseDTO getTrabajoById(Long id, String firebaseUid) {
        Trabajo trabajo = trabajoRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        // SEC-2 (IDOR): solo pueden ver el trabajo su cliente, el proveedor asignado,
        // un proveedor con oferta para ese trabajo (aún sin aceptar), o un ADMIN.
        User solicitante = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new ForbiddenException("No autorizado"));
        if (!puedeVerTrabajo(trabajo, solicitante)) {
            throw new ForbiddenException("No autorizado");
        }

        return mapToDTO(trabajo);
    }

    private boolean puedeVerTrabajo(Trabajo trabajo, User solicitante) {
        if (solicitante.getRole() == UserRole.ADMIN) {
            return true;
        }
        Long solicitanteId = solicitante.getId();
        if (trabajo.getCliente() != null && trabajo.getCliente().getId().equals(solicitanteId)) {
            return true;
        }
        if (trabajo.getProveedor() != null && trabajo.getProveedor().getId().equals(solicitanteId)) {
            return true;
        }
        // SEC-10: proveedor con una oferta ACTIVA (OFRECIDA o PROPUSO) para este trabajo
        // — ServiceDetail lo lee antes de proponer/aceptar. Una oferta ya cerrada (DURMIO)
        // NO habilita seguir viendo el trabajo (el acceso expira con la oferta).
        return trabajoOfertaRepository
                .findByTrabajoIdAndProveedorId(trabajo.getId(), solicitanteId)
                .map(o -> o.getResultado() == ResultadoOferta.OFRECIDA
                        || o.getResultado() == ResultadoOferta.PROPUSO)
                .orElse(false);
    }

    @Transactional
    public void rechazarTrabajo(Long trabajoId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("El trabajo ya no está disponible");
        }

        trabajoOfertaRepository.findByTrabajoIdAndProveedorId(trabajoId, proveedor.getId())
                .ifPresent(o -> { o.setResultado(ResultadoOferta.DURMIO); trabajoOfertaRepository.save(o); });
        // El trabajo sigue PENDIENTE con el resto del grupo; el scheduler avanza si nadie responde.
    }

    @Transactional
    public TrabajoResponseDTO completarTrabajo(Long trabajoId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.EN_CURSO)) {
            throw new RuntimeException("El trabajo no está en curso");
        }

        if (!trabajo.getProveedor().getId().equals(proveedor.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        cerrarTrabajoCompletado(trabajo, proveedor);

        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                TipoNotificacion.TRABAJO_COMPLETADO,
                "Trabajo Completado",
                "El servicio de " + trabajo.getOficio().getNombre() + " fue completado. ¡Calificá a tu profesional!",
                trabajo.getId(),
                "/cliente/completado/" + trabajo.getId()
        );

        notificacionService.enviarNotificacion(
                proveedor.getFirebaseUid(),
                TipoNotificacion.TRABAJO_COMPLETADO_PROVEEDOR,
                "Trabajo Completado",
                "Completaste el servicio de " + trabajo.getOficio().getNombre() + " exitosamente",
                trabajo.getId(),
                "/proveedor/completado/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }

    @Transactional
    public TrabajoResponseDTO presupuestarTrabajo(Long trabajoId, String proveedorFirebaseUid,
                                                  BigDecimal montoPresupuesto, String notaResumen) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.EN_CURSO)) {
            throw new RuntimeException("El trabajo no está en curso");
        }
        if (!trabajo.getProveedor().getId().equals(proveedor.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        trabajo.setMontoPresupuesto(montoPresupuesto);
        trabajo.setNotaResumen(notaResumen);
        trabajo.setEstado(TrabajoEstado.PRESUPUESTADO);
        trabajo.setEstadoPago(EstadoPago.PENDIENTE_PAGO);
        trabajo = trabajoRepository.save(trabajo);

        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                TipoNotificacion.PRESUPUESTO_RECIBIDO,
                "Presupuesto recibido",
                "Tu profesional de " + trabajo.getOficio().getNombre() + " te envió un presupuesto. Revisalo para continuar.",
                trabajo.getId(),
                "/cliente/seguimiento/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }

    @Transactional
    public TrabajoResponseDTO responderPresupuesto(Long trabajoId, String clienteFirebaseUid, boolean aceptar) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PRESUPUESTADO)) {
            throw new RuntimeException("El trabajo no tiene un presupuesto pendiente");
        }
        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        User proveedor = trabajo.getProveedor();

        trabajo.setPresupuestoAceptado(aceptar);
        trabajo.setMontoPagado(aceptar ? trabajo.getMontoPresupuesto() : trabajo.getTarifaVisita());
        trabajo.setEstadoPago(EstadoPago.PAGADO);
        trabajo.setPagadoAt(LocalDateTime.now());

        cerrarTrabajoCompletado(trabajo, proveedor);

        notificacionService.enviarNotificacion(
                proveedor.getFirebaseUid(),
                aceptar ? TipoNotificacion.PRESUPUESTO_ACEPTADO : TipoNotificacion.PRESUPUESTO_RECHAZADO,
                aceptar ? "Presupuesto aceptado" : "Presupuesto rechazado",
                aceptar
                        ? trabajo.getCliente().getNombre() + " aceptó tu presupuesto de " + trabajo.getOficio().getNombre() + "."
                        : trabajo.getCliente().getNombre() + " rechazó el presupuesto; se cobra solo la visita.",
                trabajo.getId(),
                "/proveedor/completado/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }

    /** Cierre compartido de un trabajo: pasa a COMPLETADO, promueve la cola o libera al
     *  proveedor. NO emite las notificaciones "completado" del trabajo actual (las pone
     *  el caller, porque el texto difiere entre completar y responder-presupuesto). */
    private void cerrarTrabajoCompletado(Trabajo trabajo, User proveedor) {
        trabajo.setEstado(TrabajoEstado.COMPLETADO);
        trabajo.setCompletedAt(LocalDateTime.now());
        trabajoRepository.save(trabajo);

        List<Trabajo> trabajosEnCola = trabajoRepository.findTrabajosEnCola(proveedor.getId());

        if (!trabajosEnCola.isEmpty()) {
            Trabajo siguiente = trabajosEnCola.get(0);
            siguiente.setEstado(TrabajoEstado.EN_CURSO);
            trabajoRepository.save(siguiente);

            notificacionService.enviarNotificacion(
                    proveedor.getFirebaseUid(),
                    TipoNotificacion.TRABAJO_COLA_ACTIVADO,
                    "Nuevo Trabajo Activo",
                    "El servicio de " + siguiente.getOficio().getNombre() + " para " + siguiente.getCliente().getNombre() + " pasó a estar en curso.",
                    siguiente.getId(),
                    "/proveedor/trabajo-activo/" + siguiente.getId()
            );

            notificacionService.enviarNotificacion(
                    siguiente.getCliente().getFirebaseUid(),
                    TipoNotificacion.TRABAJO_EN_CURSO,
                    "Profesional en Camino",
                    "Tu profesional de " + siguiente.getOficio().getNombre() + " está listo para atenderte.",
                    siguiente.getId(),
                    "/cliente/seguimiento/" + siguiente.getId()
            );
        } else {
            userService.updateUserStatus(proveedor.getFirebaseUid(), UserStatus.ONLINE);
            asignarTrabajosAProveedorQueSeConecta(proveedor);
        }
    }

    // Solo los trabajos ACTIVOS del cliente (lista chica). El historial completado va
    // por getHistorialCliente (paginado) para no traer todo el historial sin límite (#20-B).
    private static final List<TrabajoEstado> ESTADOS_ACTIVOS_CLIENTE = List.of(
            TrabajoEstado.PENDIENTE, TrabajoEstado.EN_CURSO, TrabajoEstado.PROPUESTO, TrabajoEstado.EN_COLA,
            TrabajoEstado.PRESUPUESTADO);

    public List<TrabajoResponseDTO> getTrabajosByCliente(String firebaseUid) {
        User cliente = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findByClienteFirebaseUidAndEstadoInOrderByCreatedAtDesc(
                firebaseUid, ESTADOS_ACTIVOS_CLIENTE);

        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);
        Map<Long, Conversacion> conversacionPorTrabajo = conversacionesPorTrabajo(trabajos);

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor, conversacionPorTrabajo))
                .collect(Collectors.toList());
    }

    // Historial paginado de trabajos COMPLETADOS del cliente + total sin calificar (badge).
    public PagedTrabajosResponse getHistorialCliente(String firebaseUid, Pageable pageable) {
        userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        Page<Trabajo> page = trabajoRepository.findByClienteFirebaseUidAndEstado(
                firebaseUid, TrabajoEstado.COMPLETADO, pageable);

        List<Trabajo> trabajos = page.getContent();
        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);
        Map<Long, Conversacion> conversacionPorTrabajo = conversacionesPorTrabajo(trabajos);

        List<TrabajoResponseDTO> content = trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor, conversacionPorTrabajo))
                .collect(Collectors.toList());

        long sinCalificar = trabajoRepository.countSinCalificarByCliente(firebaseUid);
        return new PagedTrabajosResponse(content, page.hasNext(), page.getTotalElements(), sinCalificar);
    }

    /**
     * Ofrece el trabajo al siguiente grupo de proveedores por score, excluyendo a los ya
     * ofertados. Inserta una fila OFRECIDA por proveedor y notifica. Si no queda nadie nuevo,
     * no hace nada (el caller decide cancelar).
     * @implNote Package-private: hace N writes sin @Transactional propio. Debe invocarse
     *           siempre desde un contexto @Transactional write (crearTrabajo, escalarUnTrabajo,
     *           rechazarPropuesta ya lo garantizan).
     * @return true si ofreció a alguien; false si ya no hay proveedores nuevos.
     */
    boolean ofrecerSiguienteGrupo(Trabajo trabajo) {
        String localidad = trabajo.getCliente().getLocalidad() != null ? trabajo.getCliente().getLocalidad() : "Rosario";
        int limite = getLimiteTrabajos(trabajo.getOficio());
        int tamano = (int) featureFlagService.getNumber("trabajo_oferta_grupo_tamano", 10);

        List<TrabajoOferta> previas = trabajoOfertaRepository.findByTrabajoId(trabajo.getId());
        Set<Long> yaOfertados = previas.stream().map(o -> o.getProveedor().getId()).collect(Collectors.toSet());
        int grupo = previas.stream().map(TrabajoOferta::getGrupo).max(Integer::compareTo).orElse(0) + 1;

        List<User> candidatos = new ArrayList<>(
                userRepository.findProveedoresDisponibles(localidad, trabajo.getOficio().getId(), limite));
        candidatos.removeIf(p -> yaOfertados.contains(p.getId()));
        if (candidatos.isEmpty()) {
            return false;
        }
        providerScoreService.ordenarPorScore(candidatos);
        List<User> grupoProveedores = candidatos.stream().limit(tamano).toList();

        for (User p : grupoProveedores) {
            TrabajoOferta of = new TrabajoOferta();
            of.setTrabajo(trabajo);
            of.setProveedor(p);
            of.setGrupo(grupo);
            of.setResultado(ResultadoOferta.OFRECIDA);
            trabajoOfertaRepository.save(of);

            notificacionService.enviarNotificacion(
                    p.getFirebaseUid(),
                    TipoNotificacion.NUEVO_TRABAJO,
                    "Nueva Solicitud de Trabajo",
                    "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                    trabajo.getId(),
                    "/proveedor/trabajo/" + trabajo.getId());
        }
        return true;
    }

    private double calcularDistancia(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private TrabajoResponseDTO mapToDTO(Trabajo trabajo) {
        TrabajoResponseDTO dto = new TrabajoResponseDTO();
        dto.setId(trabajo.getId());
        dto.setClienteId(trabajo.getCliente().getId());
        dto.setClienteNombre(trabajo.getCliente().getNombre());
        if (trabajo.getProveedor() != null) {
            dto.setProveedorId(trabajo.getProveedor().getId());
            dto.setProveedorNombre(trabajo.getProveedor().getNombre());
            // #8: promedio denormalizado en la entidad proveedor (sin query).
            Double promedio = trabajo.getProveedor().getPromedioCalificacion();
            dto.setProveedorPromedioCalificacion(promedio != null ? promedio : 0.0);
            dto.setCodigoProveedor(
                com.aliados.backend.util.CodigoProveedor.format(
                    trabajo.getOficio() != null ? trabajo.getOficio().getNombre() : null,
                    trabajo.getProveedor().getId()));
        }

        calificacionRepository.findByTrabajoId(trabajo.getId()).ifPresent(cal -> {
            dto.setCalificado(true);
            dto.setCalificacionEstrellas(cal.getEstrellas());
        });
        if (dto.getCalificado() == null) {
            dto.setCalificado(false);
        }

        // unproxy: aunque se inicialice, el proxy LAZY sigue siendo una subclase
        // ByteBuddy que Jackson no puede serializar. unproxy devuelve la entidad
        // Oficio real (o null). Null-safe.
        dto.setOficio(OficioResponseDTO.from((Oficio) Hibernate.unproxy(trabajo.getOficio())));
        dto.setEstado(trabajo.getEstado());
        dto.setDescripcion(trabajo.getDescripcion());
        dto.setDireccion(trabajo.getDireccion());
        dto.setLatitudCliente(trabajo.getLatitudCliente());
        dto.setLongitudCliente(trabajo.getLongitudCliente());
        dto.setDireccionDestino(trabajo.getDireccionDestino());
        dto.setLatitudDestino(trabajo.getLatitudDestino());
        dto.setLongitudDestino(trabajo.getLongitudDestino());
        dto.setTiempoEstimadoMinutos(trabajo.getTiempoEstimadoMinutos());
        dto.setPrecioEstimado(trabajo.getPrecioEstimado());
        dto.setFotos(trabajo.getFotos());
        dto.setCreatedAt(trabajo.getCreatedAt());
        dto.setAcceptedAt(trabajo.getAcceptedAt());
        dto.setCompletedAt(trabajo.getCompletedAt());
        dto.setTarifaVisita(trabajo.getTarifaVisita());
        dto.setMontoPresupuesto(trabajo.getMontoPresupuesto());
        dto.setNotaResumen(trabajo.getNotaResumen());
        dto.setPresupuestoAceptado(trabajo.getPresupuestoAceptado());
        dto.setMontoPagado(trabajo.getMontoPagado());
        dto.setEstadoPago(trabajo.getEstadoPago());
        dto.setPagadoAt(trabajo.getPagadoAt());

        // Un solo trabajo: una query directa no degrada nada (el N+1 se evita en
        // mapToDTOOptimized, usado para listados).
        conversacionRepository.findByTrabajoId(trabajo.getId()).ifPresent(conv -> aplicarChat(dto, conv));

        return dto;
    }

    @Transactional
    public void asignarTrabajosAProveedorQueSeConecta(User proveedorRef) {
        // El proveedor puede llegar detached (lo cargó el controller en otra sesión).
        // Lo recargamos en ESTA transacción para que su oficio LAZY se inicialice.
        User proveedor = userRepository.findById(proveedorRef.getId()).orElse(null);
        if (proveedor == null) {
            return;
        }
        if (proveedor.getLocalidad() == null || !proveedor.getLocalidad().equalsIgnoreCase("Rosario")) {
            return;
        }
        if (proveedor.getOficio() == null) {
            return;
        }

        // Solo asignar si tiene espacio
        int limiteProveedor = getLimiteTrabajos(proveedor.getOficio());
        int trabajosActuales = trabajoRepository.countTrabajosActivosYCola(proveedor.getId());
        if (trabajosActuales >= limiteProveedor) {
            return;
        }

        List<Trabajo> candidatos = trabajoRepository.findPendientesSinOfertaPara(proveedor.getOficio().getId(), proveedor.getId());

        for (Trabajo trabajo : candidatos) {
            if (trabajoRepository.countTrabajosActivosYCola(proveedor.getId()) >= limiteProveedor) {
                break;
            }
            int grupo = trabajoOfertaRepository.findByTrabajoId(trabajo.getId()).stream()
                    .map(TrabajoOferta::getGrupo).max(Integer::compareTo).orElse(0);
            TrabajoOferta of = new TrabajoOferta();
            of.setTrabajo(trabajo); of.setProveedor(proveedor);
            of.setGrupo(grupo == 0 ? 1 : grupo); of.setResultado(ResultadoOferta.OFRECIDA);
            trabajoOfertaRepository.save(of);
            notificacionService.enviarNotificacion(
                    proveedor.getFirebaseUid(), TipoNotificacion.NUEVO_TRABAJO,
                    "Nueva Solicitud de Trabajo",
                    "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                    trabajo.getId(), "/proveedor/trabajo/" + trabajo.getId());
        }
    }

    public TrabajoResponseDTO getTrabajoActivo(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findTrabajoEnCursoByProveedorId(proveedor.getId());

        if (trabajo == null) {
            return null;
        }

        return mapToDTO(trabajo);
    }

    // Historial paginado de completados del proveedor (#20-B). sinCalificar no aplica → 0.
    public PagedTrabajosResponse getTrabajosCompletados(String proveedorFirebaseUid, Pageable pageable) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        Page<Trabajo> page = trabajoRepository.findByProveedorIdAndEstado(
                proveedor.getId(), TrabajoEstado.COMPLETADO, pageable);

        List<Trabajo> trabajos = page.getContent();
        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);
        Map<Long, Conversacion> conversacionPorTrabajo = conversacionesPorTrabajo(trabajos);

        List<TrabajoResponseDTO> content = trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor, conversacionPorTrabajo))
                .collect(Collectors.toList());

        return new PagedTrabajosResponse(content, page.hasNext(), page.getTotalElements(), 0);
    }

    // Batch helpers: arman en pocas queries los datos que el mapeo necesita por
    // trabajo, para no disparar N+1 al recorrer la lista.
    private Map<Long, Calificacion> calificacionesPorTrabajo(List<Trabajo> trabajos) {
        List<Long> trabajoIds = trabajos.stream().map(Trabajo::getId).collect(Collectors.toList());
        if (trabajoIds.isEmpty()) return Map.of();
        return calificacionRepository.findByTrabajoIdIn(trabajoIds).stream()
                .collect(Collectors.toMap(c -> c.getTrabajo().getId(), c -> c, (a, b) -> a));
    }

    // #8: el promedio está denormalizado en la entidad proveedor (ya cargada vía EntityGraph),
    // así que se arma desde memoria sin la query batch que se usaba antes.
    private Map<Long, Double> promediosPorProveedor(List<Trabajo> trabajos) {
        Map<Long, Double> promedios = new HashMap<>();
        for (Trabajo t : trabajos) {
            User p = t.getProveedor();
            if (p != null && p.getId() != null) {
                promedios.put(p.getId(), p.getPromedioCalificacion() != null ? p.getPromedioCalificacion() : 0.0);
            }
        }
        return promedios;
    }

    // Batch: una sola query para TODAS las conversaciones de la lista, en vez de un
    // findByTrabajoId por fila (N+1 que degradaría el dashboard).
    private Map<Long, Conversacion> conversacionesPorTrabajo(List<Trabajo> trabajos) {
        List<Long> trabajoIds = trabajos.stream().map(Trabajo::getId).collect(Collectors.toList());
        if (trabajoIds.isEmpty()) return Map.of();
        return conversacionRepository.findByTrabajoIdIn(trabajoIds).stream()
                .collect(Collectors.toMap(c -> c.getTrabajo().getId(), c -> c, (a, b) -> a));
    }

    private TrabajoResponseDTO mapToDTOOptimized(Trabajo trabajo, Map<Long, Calificacion> calificacionPorTrabajo,
                                                  Map<Long, Double> promediosPorProveedor,
                                                  Map<Long, Conversacion> conversacionPorTrabajo) {
        TrabajoResponseDTO dto = new TrabajoResponseDTO();
        dto.setId(trabajo.getId());
        dto.setClienteId(trabajo.getCliente().getId());
        dto.setClienteNombre(trabajo.getCliente().getNombre());
        if (trabajo.getProveedor() != null) {
            dto.setProveedorId(trabajo.getProveedor().getId());
            dto.setProveedorNombre(trabajo.getProveedor().getNombre());
            Double promedio = promediosPorProveedor.get(trabajo.getProveedor().getId());
            dto.setProveedorPromedioCalificacion(promedio != null ? promedio : 0.0);
            dto.setCodigoProveedor(
                com.aliados.backend.util.CodigoProveedor.format(
                    trabajo.getOficio() != null ? trabajo.getOficio().getNombre() : null,
                    trabajo.getProveedor().getId()));
        }

        Calificacion cal = calificacionPorTrabajo.get(trabajo.getId());
        dto.setCalificado(cal != null);
        if (cal != null) {
            dto.setCalificacionEstrellas(cal.getEstrellas());
        }

        // unproxy: aunque se inicialice, el proxy LAZY sigue siendo una subclase
        // ByteBuddy que Jackson no puede serializar. unproxy devuelve la entidad
        // Oficio real (o null). Null-safe.
        dto.setOficio(OficioResponseDTO.from((Oficio) Hibernate.unproxy(trabajo.getOficio())));
        dto.setEstado(trabajo.getEstado());
        dto.setDescripcion(trabajo.getDescripcion());
        dto.setDireccion(trabajo.getDireccion());
        dto.setLatitudCliente(trabajo.getLatitudCliente());
        dto.setLongitudCliente(trabajo.getLongitudCliente());
        dto.setDireccionDestino(trabajo.getDireccionDestino());
        dto.setLatitudDestino(trabajo.getLatitudDestino());
        dto.setLongitudDestino(trabajo.getLongitudDestino());
        dto.setTiempoEstimadoMinutos(trabajo.getTiempoEstimadoMinutos());
        dto.setPrecioEstimado(trabajo.getPrecioEstimado());
        // fotos NO se incluye en listados: las vistas de lista no las muestran (solo el detalle,
        // vía mapToDTO). Ya son URLs de Cloudinary (no base64 — la migración #20 está hecha), así
        // que el ahorro hoy es menor, pero se mantiene fuera de las listas por payload/prolijidad.
        dto.setCreatedAt(trabajo.getCreatedAt());
        dto.setAcceptedAt(trabajo.getAcceptedAt());
        dto.setCompletedAt(trabajo.getCompletedAt());
        dto.setTarifaVisita(trabajo.getTarifaVisita());
        dto.setMontoPresupuesto(trabajo.getMontoPresupuesto());
        dto.setNotaResumen(trabajo.getNotaResumen());
        dto.setPresupuestoAceptado(trabajo.getPresupuestoAceptado());
        dto.setMontoPagado(trabajo.getMontoPagado());
        dto.setEstadoPago(trabajo.getEstadoPago());
        dto.setPagadoAt(trabajo.getPagadoAt());

        Conversacion conv = conversacionPorTrabajo.get(trabajo.getId());
        if (conv != null) {
            aplicarChat(dto, conv);
        }

        return dto;
    }

    /**
     * Setea conversacionId + chatModo en el DTO, resolviendo el modo vía ConversacionService.
     * MINOR 1: resolverModo() lanza IllegalStateException si el estado del padre (trabajo o
     * mudanza) no está contemplado en los sets ESCRITURA/LECTURA de ConversacionService (p.ej.
     * alguien agrega un TrabajoEstado nuevo y se olvida de sumarlo ahí). El chat es una feature
     * secundaria: eso NUNCA puede tirar abajo el armado del dashboard completo (que es lo que
     * pasaba antes: la excepción se propagaba y getTrabajosByCliente devolvía 400 entero).
     * Por eso degradamos acá, logueando el id de la conversación para poder investigarlo.
     * Degradamos conversacionId Y chatModo juntos (no solo el modo): si dejáramos conversacionId
     * seteado con chatModo null, el frontend (que solo muestra el chat cuando hay
     * conversacionId) quedaría en un estado raro. Dejando los dos en null, el frontend
     * simplemente no muestra el chat para este trabajo/mudanza.
     */
    private void aplicarChat(TrabajoResponseDTO dto, Conversacion conv) {
        try {
            ModoChat modo = conversacionService.resolverModo(conv);
            dto.setConversacionId(conv.getId());
            dto.setChatModo(modo);
        } catch (IllegalStateException e) {
            logger.warn("No se pudo resolver el modo de chat de la conversación {}: {}", conv.getId(), e.getMessage());
        }
    }

    @Transactional
    public TrabajoResponseDTO cancelarTrabajo(Long trabajoId, String clienteFirebaseUid, String motivo) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("Solo se pueden cancelar trabajos pendientes");
        }

        aplicarCancelacion(trabajo, motivo);
        return mapToDTO(trabajo);
    }

    // Core de cancelación reusable (cliente y escalado automático).
    private void aplicarCancelacion(Trabajo trabajo, String motivo) {
        trabajo.setEstado(TrabajoEstado.CANCELADO);
        trabajo.setMotivoCancelacion(motivo);
        trabajoRepository.save(trabajo);
        cloudinaryService.borrarFotos(trabajo.getFotos());
    }

    @Transactional
    public TrabajoResponseDTO proponerTrabajo(Long trabajoId, String proveedorFirebaseUid,
                                              Integer tiempoEstimadoMinutos, Double latitud, Double longitud, BigDecimal tarifaVisita) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));
        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        TrabajoOferta oferta = trabajoOfertaRepository.findByTrabajoIdAndProveedorId(trabajoId, proveedor.getId())
                .filter(o -> o.getResultado() == ResultadoOferta.OFRECIDA)
                .orElseThrow(() -> new ForbiddenException("No estás asignado a este trabajo"));

        // Lock atómico: solo uno de los N ofertados flipea PENDIENTE→PROPUESTO.
        if (trabajoRepository.tomarTrabajoSiPendiente(trabajoId) == 0) {
            throw new RuntimeException("El trabajo ya no está disponible");
        }
        trabajo = trabajoRepository.findById(trabajoId).orElseThrow();

        trabajo.setProveedor(proveedor);
        trabajo.setTiempoEstimadoMinutos(tiempoEstimadoMinutos);
        BigDecimal tarifaEfectiva = tarifaVisita != null ? tarifaVisita : new BigDecimal("15000");
        trabajo.setTarifaVisita(tarifaEfectiva);
        trabajo.setPropuestoAt(LocalDateTime.now());
        if (latitud != null && longitud != null) {
            trabajo.setLatitudProveedor(latitud);
            trabajo.setLongitudProveedor(longitud);
        }
        trabajoRepository.save(trabajo);

        // Después del flip atómico ganado: si dos proveedores compiten, solo el
        // ganador de tomarTrabajoSiPendiente llega acá y registra el evento.
        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.PENDIENTE.name(), TrabajoEstado.PROPUESTO.name(),
                ActorTipo.PROVEEDOR, proveedor, null);

        oferta.setResultado(ResultadoOferta.PROPUSO);
        oferta.setRespondioAt(LocalDateTime.now());
        trabajoOfertaRepository.save(oferta);

        String tarifaFmt = NumberFormat.getIntegerInstance(Locale.of("es", "AR")).format(tarifaEfectiva);
        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                TipoNotificacion.PROPUESTA_RECIBIDA,
                "Propuesta de Profesional",
                proveedor.getNombre() + " puede llegar en " + tiempoEstimadoMinutos + " minutos. Tarifa de visita: $" + tarifaFmt,
                trabajo.getId(),
                "/cliente/propuesta/" + trabajo.getId());

        return mapToDTO(trabajo);
    }

    @Transactional
    public TrabajoResponseDTO aceptarPropuesta(Long trabajoId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PROPUESTO)) {
            throw new RuntimeException("El trabajo no tiene una propuesta activa");
        }

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        User proveedor = trabajo.getProveedor();

        int trabajosActivos = trabajoRepository.countTrabajosActivosYCola(proveedor.getId());
        int limite = getLimiteTrabajos(trabajo.getOficio());

        if (trabajosActivos >= limite) {
            throw new RuntimeException("El profesional ya tiene la agenda completa");
        }

        Trabajo trabajoEnCurso = trabajoRepository.findTrabajoEnCursoByProveedorId(proveedor.getId());

        if (trabajoEnCurso != null) {
            trabajo.setEstado(TrabajoEstado.EN_COLA);
        } else {
            trabajo.setEstado(TrabajoEstado.EN_CURSO);
        }

        trabajo.setAcceptedAt(LocalDateTime.now());
        trabajo = trabajoRepository.save(trabajo);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.PROPUESTO.name(), trabajo.getEstado().name(),
                ActorTipo.CLIENTE, cliente, null);

        // El chat nace acá: es el momento en que el vínculo cliente-proveedor queda confirmado
        // (tanto EN_CURSO como EN_COLA tienen chat). Idempotente, así que un reintento no duplica.
        conversacionService.crearParaTrabajo(trabajo);

        // El trabajo se tomó: las ofertas OFRECIDA restantes cuentan DURMIO (estricto).
        for (TrabajoOferta o : trabajoOfertaRepository.findByTrabajoIdAndResultado(trabajo.getId(), ResultadoOferta.OFRECIDA)) {
            o.setResultado(ResultadoOferta.DURMIO);
            trabajoOfertaRepository.save(o);
        }

        if (proveedor.getStatus() != UserStatus.BUSY) {
            userService.updateUserStatus(proveedor.getFirebaseUid(), UserStatus.BUSY);
        }

        String mensaje = trabajoEnCurso != null
                ? trabajo.getCliente().getNombre() + " aceptó tu propuesta. Se agregó a tu cola de trabajos."
                : trabajo.getCliente().getNombre() + " aceptó tu propuesta de " + trabajo.getOficio().getNombre();

        String actionUrl = trabajoEnCurso != null
                ? "/proveedor/dashboard"
                : "/proveedor/trabajo-activo/" + trabajo.getId();

        notificacionService.enviarNotificacion(
                proveedor.getFirebaseUid(),
                TipoNotificacion.PROPUESTA_ACEPTADA,
                "Propuesta Aceptada",
                mensaje,
                trabajo.getId(),
                actionUrl
        );

        return mapToDTO(trabajo);
    }

    @Transactional
    public void rechazarPropuesta(Long trabajoId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PROPUESTO)) {
            throw new RuntimeException("El trabajo no tiene una propuesta activa");
        }

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("No autorizado");
        }

        User proveedorRechazado = trabajo.getProveedor();
        notificacionService.enviarNotificacion(
                proveedorRechazado.getFirebaseUid(),
                TipoNotificacion.PROPUESTA_RECHAZADA,
                "Propuesta Rechazada",
                "El cliente rechazó tu propuesta de " + trabajo.getOficio().getNombre(),
                trabajo.getId(),
                "/proveedor/dashboard"
        );

        // La oferta del rechazado cuenta DURMIO y queda fuera de este trabajo.
        trabajoOfertaRepository.findByTrabajoIdAndProveedorId(trabajo.getId(), proveedorRechazado.getId())
                .ifPresent(o -> { o.setResultado(ResultadoOferta.DURMIO); trabajoOfertaRepository.save(o); });

        trabajo.setEstado(TrabajoEstado.PENDIENTE);
        trabajo.setProveedor(null);
        trabajo.setTiempoEstimadoMinutos(null);
        trabajo.setTarifaVisita(null);
        trabajo.setLatitudProveedor(null);
        trabajo.setLongitudProveedor(null);
        trabajoRepository.save(trabajo);

        eventoService.registrarTrabajo(trabajo, TipoEvento.CAMBIO_ESTADO,
                TrabajoEstado.PROPUESTO.name(), TrabajoEstado.PENDIENTE.name(),
                ActorTipo.CLIENTE, cliente, null);

        // Reabrir al resto del grupo actual (OFRECIDA); si no queda nadie, avanzar de grupo.
        List<TrabajoOferta> resto = trabajoOfertaRepository.findByTrabajoIdAndResultado(trabajo.getId(), ResultadoOferta.OFRECIDA);
        if (resto.isEmpty()) {
            ofrecerSiguienteGrupo(trabajo);
        } else {
            for (TrabajoOferta o : resto) {
                notificacionService.enviarNotificacion(
                        o.getProveedor().getFirebaseUid(),
                        TipoNotificacion.NUEVO_TRABAJO,
                        "Trabajo disponible de nuevo",
                        "Volvió a estar disponible un trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                        trabajo.getId(),
                        "/proveedor/trabajo/" + trabajo.getId());
            }
        }
    }

    public List<TrabajoResponseDTO> getTrabajosEnCola(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findTrabajosEnCola(proveedor.getId());

        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);
        Map<Long, Conversacion> conversacionPorTrabajo = conversacionesPorTrabajo(trabajos);

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor, conversacionPorTrabajo))
                .collect(Collectors.toList());
    }

    /** IDs de trabajos PENDIENTE. El scheduler los procesa de a uno, cada uno en su tx. */
    @Transactional(readOnly = true)
    public List<Long> idsTrabajosPendientes() {
        return trabajoRepository.findByEstado(TrabajoEstado.PENDIENTE).stream()
                .map(Trabajo::getId)
                .toList();
    }

    /**
     * Escala UN trabajo PENDIENTE cuyo grupo activo (ofertas OFRECIDA) no respondió en el
     * intervalo configurado. Marca el grupo como DURMIO y avanza al siguiente via
     * {@link #ofrecerSiguienteGrupo}. Si no quedan proveedores, cancela el trabajo y avisa
     * al cliente. Opera en su propia transacción (REQUIRES_NEW): si algo falla, rollbackea
     * solo este trabajo y el scheduler sigue con el resto.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void escalarUnTrabajo(Long trabajoId, int intervaloMin) {
        Trabajo t = trabajoRepository.findById(trabajoId).orElse(null);
        if (t == null || t.getEstado() != TrabajoEstado.PENDIENTE) {
            return;
        }
        List<TrabajoOferta> grupoActual = trabajoOfertaRepository
                .findByTrabajoIdAndResultado(trabajoId, ResultadoOferta.OFRECIDA);
        // ofrecidoAt del grupo vivo (todas comparten ventana; tomamos la más reciente)
        LocalDateTime ref = grupoActual.stream()
                .map(TrabajoOferta::getOfrecidoAt)
                .max(LocalDateTime::compareTo)
                .orElse(t.getCreatedAt());
        if (ChronoUnit.MINUTES.between(ref, LocalDateTime.now()) < intervaloMin) {
            return; // la ventana del grupo actual sigue abierta
        }
        // El grupo durmió: UPDATE atómico condicional — nunca pisa un PROPUSO.
        // clearAutomatically=true deja la entidad t detached; re-leer estado fresco.
        trabajoOfertaRepository.marcarGrupoDurmioSiPendiente(trabajoId);
        Trabajo fresco = trabajoRepository.findById(trabajoId).orElse(null);
        if (fresco == null || fresco.getEstado() != TrabajoEstado.PENDIENTE) {
            return; // un propose ganó la carrera; ese flujo ya gestiona las ofertas
        }
        boolean ofrecio = ofrecerSiguienteGrupo(fresco);
        if (ofrecio) {
            notificarCliente(fresco, TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR,
                    "Seguimos buscando",
                    "Seguimos buscando un profesional para tu pedido de " + fresco.getOficio().getNombre() + ".");
        } else {
            aplicarCancelacion(fresco, "No encontramos un profesional disponible");
            notificarCliente(fresco, TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR,
                    "Pedido cancelado",
                    "No encontramos un profesional disponible. Cancelamos tu pedido de "
                            + fresco.getOficio().getNombre() + "; podés volver a intentarlo.");
        }
    }

    private void notificarCliente(Trabajo t, TipoNotificacion tipo, String titulo, String mensaje) {
        notificacionService.enviarNotificacion(
                t.getCliente().getFirebaseUid(), tipo, titulo, mensaje, t.getId(), null);
    }
}
