package com.aliados.backend.service;

import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.repository.OficioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
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

    private static final Logger logger = LoggerFactory.getLogger(TrabajoService.class);

    @Transactional
    public TrabajoResponseDTO crearTrabajo(String clienteFirebaseUid, CrearTrabajoDTO dto) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Oficio oficio = oficioRepository.findById(dto.getOficioId())
                .orElseThrow(() -> new RuntimeException("Oficio no encontrado"));

        Trabajo trabajo = new Trabajo();
        trabajo.setCliente(cliente);
        trabajo.setOficio(oficio);
        trabajo.setDescripcion(dto.getDescripcion());
        trabajo.setDireccion(dto.getDireccion());
        trabajo.setLatitudCliente(dto.getLatitudCliente());
        trabajo.setLongitudCliente(dto.getLongitudCliente());
        trabajo.setFotos(dto.getFotos());
        trabajo.setEstado(TrabajoEstado.PENDIENTE);

        double lat = dto.getLatitudCliente();
        double lng = dto.getLongitudCliente();
        if (lat < -33.05 || lat > -32.85 || lng < -60.80 || lng > -60.55) {
            throw new RuntimeException("Por el momento, Aliados solo está disponible en Rosario, Santa Fe.");
        }

        trabajo = trabajoRepository.save(trabajo);

        notificarProveedorDisponible(trabajo);

        return mapToDTO(trabajo);
    }

    public List<TrabajoResponseDTO> getTrabajosPendientes(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        if (proveedor.getOficio() == null) {
            throw new RuntimeException("El proveedor no tiene un oficio asignado");
        }

        List<Trabajo> trabajos = trabajoRepository.findByEstadoAndOficioId(
                TrabajoEstado.PENDIENTE,
                proveedor.getOficio().getId()
        );

        return trabajos.stream()
                .filter(t -> t.getProveedorNotificadoId() != null &&
                        t.getProveedorNotificadoId().equals(proveedor.getId()))
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public TrabajoResponseDTO getTrabajoById(Long id) {
        Trabajo trabajo = trabajoRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));
        return mapToDTO(trabajo);
    }

    @Transactional
    public void rechazarTrabajo(Long trabajoId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("El trabajo ya no está disponible");
        }

        trabajo.setNotificadoAt(null);
        trabajo.setProveedorNotificadoId(null);
        trabajoRepository.save(trabajo);

        notificarProveedorDisponible(trabajo);
    }

    @Transactional
    public TrabajoResponseDTO completarTrabajo(Long trabajoId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.EN_CURSO)) {
            throw new RuntimeException("El trabajo no está en curso");
        }

        if (!trabajo.getProveedor().getId().equals(proveedor.getId())) {
            throw new RuntimeException("No autorizado");
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
                    "TRABAJO_COLA_ACTIVADO",
                    "Nuevo Trabajo Activo",
                    "El servicio de " + siguiente.getOficio().getNombre() + " para " + siguiente.getCliente().getNombre() + " pasó a estar en curso.",
                    siguiente.getId(),
                    "/proveedor/trabajo-activo/" + siguiente.getId()
            );

            notificacionService.enviarNotificacion(
                    siguiente.getCliente().getFirebaseUid(),
                    "TRABAJO_EN_CURSO",
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
                "TRABAJO_COMPLETADO",
                "Trabajo Completado",
                "El servicio de " + trabajo.getOficio().getNombre() + " fue completado. ¡Calificá a tu profesional!",
                trabajo.getId(),
                "/cliente/completado/" + trabajo.getId()
        );

        notificacionService.enviarNotificacion(
                proveedor.getFirebaseUid(),
                "TRABAJO_COMPLETADO_PROVEEDOR",
                "Trabajo Completado",
                "Completaste el servicio de " + trabajo.getOficio().getNombre() + " exitosamente",
                trabajo.getId(),
                "/proveedor/completado/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }

    public List<TrabajoResponseDTO> getTrabajosByCliente(String firebaseUid) {
        User cliente = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findByClienteFirebaseUidOrderByCreatedAtDesc(firebaseUid);

        List<Long> trabajoIds = trabajos.stream().map(Trabajo::getId).collect(Collectors.toList());
        List<Calificacion> calificaciones = calificacionRepository.findByTrabajoIdIn(trabajoIds);
        Map<Long, Calificacion> calificacionPorTrabajo = calificaciones.stream()
                .collect(Collectors.toMap(c -> c.getTrabajo().getId(), c -> c, (a, b) -> a));

        Map<Long, Double> promediosPorProveedor = new java.util.HashMap<>();
        trabajos.stream()
                .filter(t -> t.getProveedor() != null)
                .map(t -> t.getProveedor().getId())
                .distinct()
                .forEach(provId -> promediosPorProveedor.put(provId, calificacionRepository.getPromedioByProveedorId(provId)));

        return trabajos.stream()
                .map(trabajo -> {
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

                    dto.setOficio(trabajo.getOficio());
                    dto.setEstado(trabajo.getEstado());
                    dto.setDescripcion(trabajo.getDescripcion());
                    dto.setDireccion(trabajo.getDireccion());
                    dto.setLatitudCliente(trabajo.getLatitudCliente());
                    dto.setLongitudCliente(trabajo.getLongitudCliente());
                    dto.setTiempoEstimadoMinutos(trabajo.getTiempoEstimadoMinutos());
                    dto.setPrecioEstimado(trabajo.getPrecioEstimado());
                    dto.setFotos(trabajo.getFotos());
                    dto.setCreatedAt(trabajo.getCreatedAt());
                    dto.setAcceptedAt(trabajo.getAcceptedAt());
                    dto.setCompletedAt(trabajo.getCompletedAt());
                    dto.setTarifaVisita(trabajo.getTarifaVisita());
                    return dto;
                })
                .collect(Collectors.toList());
    }

    private void notificarProveedorDisponible(Trabajo trabajo) {
        String localidad = trabajo.getCliente().getLocalidad() != null ? trabajo.getCliente().getLocalidad() : "Rosario";
        List<User> proveedores = userRepository.findProveedoresDisponibles(localidad, trabajo.getOficio().getId());

        if (proveedores.isEmpty()) {
            logger.warn("No hay proveedores disponibles para el oficio {}", trabajo.getOficio().getNombre());
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
                "NUEVO_TRABAJO",
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
            Double promedio = calificacionRepository.getPromedioByProveedorId(trabajo.getProveedor().getId());
            dto.setProveedorPromedioCalificacion(promedio != null ? promedio : 0.0);
        }

        calificacionRepository.findByTrabajoId(trabajo.getId()).ifPresent(cal -> {
            dto.setCalificado(true);
            dto.setCalificacionEstrellas(cal.getEstrellas());
        });
        if (dto.getCalificado() == null) {
            dto.setCalificado(false);
        }

        dto.setOficio(trabajo.getOficio());
        dto.setEstado(trabajo.getEstado());
        dto.setDescripcion(trabajo.getDescripcion());
        dto.setDireccion(trabajo.getDireccion());
        dto.setLatitudCliente(trabajo.getLatitudCliente());
        dto.setLongitudCliente(trabajo.getLongitudCliente());
        dto.setTiempoEstimadoMinutos(trabajo.getTiempoEstimadoMinutos());
        dto.setPrecioEstimado(trabajo.getPrecioEstimado());
        dto.setFotos(trabajo.getFotos());
        dto.setCreatedAt(trabajo.getCreatedAt());
        dto.setAcceptedAt(trabajo.getAcceptedAt());
        dto.setCompletedAt(trabajo.getCompletedAt());
        dto.setTarifaVisita(trabajo.getTarifaVisita());
        return dto;
    }

    public void asignarTrabajosAProveedorQueSeConecta(User proveedor) {
        if (proveedor.getLocalidad() == null || !proveedor.getLocalidad().equalsIgnoreCase("Rosario")) {
            return;
        }
        if (proveedor.getOficio() == null) {
            return;
        }

        // Solo asignar si tiene espacio (menos de 3 trabajos)
        int trabajosActuales = trabajoRepository.countTrabajosActivosYCola(proveedor.getId());
        if (trabajosActuales >= 3) {
            return;
        }

        List<Trabajo> trabajosSinAsignar = trabajoRepository.findTrabajosPendientesSinAsignar(proveedor.getOficio().getId());

        for (Trabajo trabajo : trabajosSinAsignar) {
            if (trabajoRepository.countTrabajosActivosYCola(proveedor.getId()) >= 3) {
                break;
            }

            trabajo.setProveedorNotificadoId(proveedor.getId());
            trabajo.setNotificadoAt(LocalDateTime.now());
            trabajoRepository.save(trabajo);
            notificacionService.enviarNotificacion(
                    proveedor.getFirebaseUid(),
                    "NUEVO_TRABAJO",
                    "Nueva Solicitud de Trabajo",
                    "Nuevo trabajo de " + trabajo.getOficio().getNombre() + " en " + trabajo.getDireccion(),
                    trabajo.getId(),
                    "/proveedor/trabajo/" + trabajo.getId()
            );
        }
    }

    public TrabajoResponseDTO getTrabajoActivo(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findTrabajoEnCursoByProveedorId(proveedor.getId());

        if (trabajo == null) {
            return null;
        }

        return mapToDTO(trabajo);
    }

    public List<TrabajoResponseDTO> getTrabajosCompletados(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findByProveedorIdAndEstadoOrderByCompletedAtDesc(
                proveedor.getId(),
                TrabajoEstado.COMPLETADO
        );

        List<Calificacion> todasCalificaciones = calificacionRepository.findByProveedorIdOrderByCreatedAtDesc(proveedor.getId());
        Map<Long, Calificacion> calificacionPorTrabajo = todasCalificaciones.stream()
                .collect(Collectors.toMap(c -> c.getTrabajo().getId(), c -> c, (a, b) -> a));

        Double promedio = calificacionRepository.getPromedioByProveedorId(proveedor.getId());

        return trabajos.stream()
                .map(trabajo -> mapToDTOOptimized(trabajo, calificacionPorTrabajo, promedio))
                .collect(Collectors.toList());
    }

    private TrabajoResponseDTO mapToDTOOptimized(Trabajo trabajo, Map<Long, Calificacion> calificacionPorTrabajo, Double promedio) {
        TrabajoResponseDTO dto = new TrabajoResponseDTO();
        dto.setId(trabajo.getId());
        dto.setClienteId(trabajo.getCliente().getId());
        dto.setClienteNombre(trabajo.getCliente().getNombre());
        if (trabajo.getProveedor() != null) {
            dto.setProveedorId(trabajo.getProveedor().getId());
            dto.setProveedorNombre(trabajo.getProveedor().getNombre());
            dto.setProveedorPromedioCalificacion(promedio != null ? promedio : 0.0);
        }

        Calificacion cal = calificacionPorTrabajo.get(trabajo.getId());
        dto.setCalificado(cal != null);
        if (cal != null) {
            dto.setCalificacionEstrellas(cal.getEstrellas());
        }

        dto.setOficio(trabajo.getOficio());
        dto.setEstado(trabajo.getEstado());
        dto.setDescripcion(trabajo.getDescripcion());
        dto.setDireccion(trabajo.getDireccion());
        dto.setLatitudCliente(trabajo.getLatitudCliente());
        dto.setLongitudCliente(trabajo.getLongitudCliente());
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
    public TrabajoResponseDTO cancelarTrabajo(Long trabajoId, String clienteFirebaseUid, String motivo) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("Solo se pueden cancelar trabajos pendientes");
        }

        trabajo.setEstado(TrabajoEstado.CANCELADO);
        trabajo.setProveedorNotificadoId(null);
        trabajo.setNotificadoAt(null);
        trabajo.setMotivoCancelacion(motivo);

        trabajo = trabajoRepository.save(trabajo);

        return mapToDTO(trabajo);
    }

    @Transactional
    public TrabajoResponseDTO proponerTrabajo(Long trabajoId, String proveedorFirebaseUid,
                                              Integer tiempoEstimadoMinutos, Double latitud, Double longitud) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PENDIENTE)) {
            throw new RuntimeException("El trabajo ya no está disponible");
        }

        if (trabajo.getProveedorNotificadoId() == null || !trabajo.getProveedorNotificadoId().equals(proveedor.getId())) {
            throw new RuntimeException("No estás asignado a este trabajo");
        }

        trabajo.setEstado(TrabajoEstado.PROPUESTO);
        trabajo.setProveedor(proveedor);
        trabajo.setTiempoEstimadoMinutos(tiempoEstimadoMinutos);
        trabajo.setTarifaVisita(15000.0);
        trabajo.setPropuestoAt(LocalDateTime.now());
        if (latitud != null && longitud != null) {
            trabajo.setLatitudProveedor(latitud);
            trabajo.setLongitudProveedor(longitud);
        }

        trabajo = trabajoRepository.save(trabajo);

        notificacionService.enviarNotificacion(
                trabajo.getCliente().getFirebaseUid(),
                "PROPUESTA_RECIBIDA",
                "Propuesta de Profesional",
                proveedor.getNombre() + " puede llegar en " + tiempoEstimadoMinutos + " minutos. Tarifa de visita: $15.000",
                trabajo.getId(),
                "/cliente/propuesta/" + trabajo.getId()
        );

        return mapToDTO(trabajo);
    }

    @Transactional
    public TrabajoResponseDTO aceptarPropuesta(Long trabajoId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PROPUESTO)) {
            throw new RuntimeException("El trabajo no tiene una propuesta activa");
        }

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        User proveedor = trabajo.getProveedor();

        int trabajosActivos = trabajoRepository.countTrabajosActivosYCola(proveedor.getId());

        if (trabajosActivos >= 3) {
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
                "PROPUESTA_ACEPTADA",
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
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new RuntimeException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.PROPUESTO)) {
            throw new RuntimeException("El trabajo no tiene una propuesta activa");
        }

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        User proveedorRechazado = trabajo.getProveedor();
        notificacionService.enviarNotificacion(
                proveedorRechazado.getFirebaseUid(),
                "PROPUESTA_RECHAZADA",
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
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        List<Trabajo> trabajos = trabajoRepository.findTrabajosEnCola(proveedor.getId());

        return trabajos.stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }
}