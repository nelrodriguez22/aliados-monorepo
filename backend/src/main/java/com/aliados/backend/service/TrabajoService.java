package com.aliados.backend.service;

import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.dto.OficioResponseDTO;
import com.aliados.backend.dto.PagedTrabajosResponse;
import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.CalificacionRepository;
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

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor))
                .collect(Collectors.toList());
    }

    public TrabajoResponseDTO getTrabajoById(Long id) {
        Trabajo trabajo = trabajoRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));
        return mapToDTO(trabajo);
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

        trabajo.setNotificadoAt(null);
        trabajo.setProveedorNotificadoId(null);
        trabajoRepository.save(trabajo);

        // Excluir a quien rechaza para no re-ofrecérselo de inmediato (loop con un solo proveedor).
        notificarProveedorDisponible(trabajo, proveedor.getId());
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

        trabajo.setEstado(TrabajoEstado.COMPLETADO);
        trabajo.setCompletedAt(LocalDateTime.now());
        trabajo = trabajoRepository.save(trabajo);

        // Promover siguiente trabajo en cola
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
            // No hay más trabajos → ONLINE
            userService.updateUserStatus(proveedor.getFirebaseUid(), UserStatus.ONLINE);
            asignarTrabajosAProveedorQueSeConecta(proveedor);
        }

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

    // Solo los trabajos ACTIVOS del cliente (lista chica). El historial completado va
    // por getHistorialCliente (paginado) para no traer todo el historial sin límite (#20-B).
    private static final List<TrabajoEstado> ESTADOS_ACTIVOS_CLIENTE = List.of(
            TrabajoEstado.PENDIENTE, TrabajoEstado.EN_CURSO, TrabajoEstado.PROPUESTO, TrabajoEstado.EN_COLA);

    public List<TrabajoResponseDTO> getTrabajosByCliente(String firebaseUid) {
        User cliente = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findByClienteFirebaseUidAndEstadoInOrderByCreatedAtDesc(
                firebaseUid, ESTADOS_ACTIVOS_CLIENTE);

        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor))
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

        List<TrabajoResponseDTO> content = trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor))
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

    private void notificarProveedorDisponible(Trabajo trabajo) {
        notificarProveedorDisponible(trabajo, null);
    }

    /**
     * Re-ofrece el trabajo al mejor proveedor disponible.
     * @param excluirProveedorId si no es null, ese proveedor queda fuera del re-ofrecimiento
     *        (ej. el que acaba de rechazar). Si tras excluirlo no queda nadie, el trabajo
     *        queda PENDIENTE sin notificar (no reaparece en el dashboard de quien rechazó).
     */
    private void notificarProveedorDisponible(Trabajo trabajo, Long excluirProveedorId) {
        String localidad = trabajo.getCliente().getLocalidad() != null ? trabajo.getCliente().getLocalidad() : "Rosario";
        int limite = getLimiteTrabajos(trabajo.getOficio());
        List<User> proveedores = new ArrayList<>(
                userRepository.findProveedoresDisponibles(localidad, trabajo.getOficio().getId(), limite));

        if (excluirProveedorId != null) {
            proveedores.removeIf(p -> p.getId().equals(excluirProveedorId));
        }

        if (proveedores.isEmpty()) {
            logger.info("No hay (otro) proveedor disponible para el oficio {}; el trabajo {} queda sin asignar",
                    trabajo.getOficio().getNombre(), trabajo.getId());
            return;
        }

        // Ordenar por score descendente
        providerScoreService.ordenarPorScore(proveedores);

        User mejorProveedor = proveedores.get(0);
        trabajo.setProveedorNotificadoId(mejorProveedor.getId());
        trabajo.setNotificadoAt(LocalDateTime.now());
        trabajoRepository.save(trabajo);

        logger.info("Trabajo {} asignado a proveedor {} (score: {})",
                trabajo.getId(), mejorProveedor.getNombre(),
                String.format("%.1f", providerScoreService.calcularScore(mejorProveedor)));

        notificacionService.enviarNotificacion(
                mejorProveedor.getFirebaseUid(),
                TipoNotificacion.NUEVO_TRABAJO,
                "Nueva Solicitud de Trabajo",
                "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                trabajo.getId(),
                "/proveedor/trabajo/" + trabajo.getId()
        );
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

        List<Trabajo> trabajosSinAsignar = trabajoRepository.findTrabajosPendientesSinAsignar(proveedor.getOficio().getId());

        for (Trabajo trabajo : trabajosSinAsignar) {
            if (trabajoRepository.countTrabajosActivosYCola(proveedor.getId()) >= limiteProveedor) {
                break;
            }

            trabajo.setProveedorNotificadoId(proveedor.getId());
            trabajo.setNotificadoAt(LocalDateTime.now());
            trabajoRepository.save(trabajo);
            notificacionService.enviarNotificacion(
                    proveedor.getFirebaseUid(),
                    TipoNotificacion.NUEVO_TRABAJO,
                    "Nueva Solicitud de Trabajo",
                    "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                    trabajo.getId(),
                    "/proveedor/trabajo/" + trabajo.getId()
            );
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

        List<TrabajoResponseDTO> content = trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor))
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

    private TrabajoResponseDTO mapToDTOOptimized(Trabajo trabajo, Map<Long, Calificacion> calificacionPorTrabajo, Map<Long, Double> promediosPorProveedor) {
        TrabajoResponseDTO dto = new TrabajoResponseDTO();
        dto.setId(trabajo.getId());
        dto.setClienteId(trabajo.getCliente().getId());
        dto.setClienteNombre(trabajo.getCliente().getNombre());
        if (trabajo.getProveedor() != null) {
            dto.setProveedorId(trabajo.getProveedor().getId());
            dto.setProveedorNombre(trabajo.getProveedor().getNombre());
            Double promedio = promediosPorProveedor.get(trabajo.getProveedor().getId());
            dto.setProveedorPromedioCalificacion(promedio != null ? promedio : 0.0);
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
        return dto;
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
        trabajo.setProveedorNotificadoId(null);
        trabajo.setNotificadoAt(null);
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

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("El trabajo ya no está disponible");
        }

        if (trabajo.getProveedorNotificadoId() == null || !trabajo.getProveedorNotificadoId().equals(proveedor.getId())) {
            throw new ForbiddenException("No estás asignado a este trabajo");
        }

        trabajo.setEstado(TrabajoEstado.PROPUESTO);
        trabajo.setProveedor(proveedor);
        trabajo.setTiempoEstimadoMinutos(tiempoEstimadoMinutos);
        BigDecimal tarifaEfectiva = tarifaVisita != null ? tarifaVisita : new BigDecimal("15000");
        trabajo.setTarifaVisita(tarifaEfectiva);
        trabajo.setPropuestoAt(LocalDateTime.now());
        if (latitud != null && longitud != null) {
            trabajo.setLatitudProveedor(latitud);
            trabajo.setLongitudProveedor(longitud);
        }

        trabajo = trabajoRepository.save(trabajo);

        // Formato AR: 15000 → "15.000". Usa la tarifa real, no un texto fijo.
        String tarifaFmt = NumberFormat.getIntegerInstance(Locale.of("es", "AR")).format(tarifaEfectiva);
        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                TipoNotificacion.PROPUESTA_RECIBIDA,
                "Propuesta de Profesional",
                proveedor.getNombre() + " puede llegar en " + tiempoEstimadoMinutos + " minutos. Tarifa de visita: $" + tarifaFmt,
                trabajo.getId(),
                "/cliente/propuesta/" + trabajo.getId()
        );

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
        trabajo.setNotificadoAt(null);
        trabajo.setProveedorNotificadoId(null);
        trabajo = trabajoRepository.save(trabajo);

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

        trabajo.setEstado(TrabajoEstado.PENDIENTE);
        trabajo.setProveedor(null);
        trabajo.setTiempoEstimadoMinutos(null);
        trabajo.setTarifaVisita(null);
        trabajo.setLatitudProveedor(null);
        trabajo.setLongitudProveedor(null);
        trabajo.setNotificadoAt(null);
        trabajo.setProveedorNotificadoId(null);
        trabajoRepository.save(trabajo);

        notificarProveedorDisponible(trabajo);
    }

    public List<TrabajoResponseDTO> getTrabajosEnCola(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findTrabajosEnCola(proveedor.getId());

        Map<Long, Calificacion> calificacionPorTrabajo = calificacionesPorTrabajo(trabajos);
        Map<Long, Double> promediosPorProveedor = promediosPorProveedor(trabajos);

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promediosPorProveedor))
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
     * Escala UN trabajo PENDIENTE sin respuesta del proveedor, en su propia transacción
     * (REQUIRES_NEW): si algo falla, rollbackea solo este trabajo y el scheduler sigue con
     * el resto. timeout1Min: minutos para re-ofrecer al siguiente (1 reintento).
     * timeout2Min: minutos del reintento antes de cancelar.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void escalarUnTrabajo(Long trabajoId, int timeout1Min, int timeout2Min) {
        Trabajo t = trabajoRepository.findById(trabajoId).orElse(null);
        if (t == null || t.getEstado() != TrabajoEstado.PENDIENTE) {
            return; // ya no aplica (tomado/cancelado entre la query y el procesamiento)
        }
        LocalDateTime ref = t.getNotificadoAt() != null ? t.getNotificadoAt() : t.getCreatedAt();
        long mins = ChronoUnit.MINUTES.between(ref, LocalDateTime.now());
        int reintentos = t.getReintentos() != null ? t.getReintentos() : 0;

        if (reintentos == 0 && mins >= timeout1Min) {
            Long excluir = t.getProveedorNotificadoId();
            t.setReintentos(1);
            trabajoRepository.save(t); // persiste el contador aunque no haya proveedor
            notificarProveedorDisponible(t, excluir);
            notificarCliente(t, TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR,
                    "Seguimos buscando",
                    "Seguimos buscando un profesional para tu pedido de "
                            + t.getOficio().getNombre() + ".");
        } else if (reintentos >= 1 && mins >= timeout2Min) {
            aplicarCancelacion(t, "No encontramos un profesional disponible");
            notificarCliente(t, TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR,
                    "Pedido cancelado",
                    "No encontramos un profesional disponible. Cancelamos tu pedido de "
                            + t.getOficio().getNombre() + "; podés volver a intentarlo.");
        }
    }

    private void notificarCliente(Trabajo t, TipoNotificacion tipo, String titulo, String mensaje) {
        notificacionService.enviarNotificacion(
                t.getCliente().getFirebaseUid(), tipo, titulo, mensaje, t.getId(), null);
    }
}
