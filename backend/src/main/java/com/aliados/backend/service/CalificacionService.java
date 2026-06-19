package com.aliados.backend.service;

import com.aliados.backend.dto.CalificacionResponseDTO;
import com.aliados.backend.dto.CrearCalificacionDTO;
import com.aliados.backend.entity.Calificacion;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true) // sesión abierta durante el mapeo a DTO (asociaciones LAZY); los writers la sobreescriben con @Transactional
public class CalificacionService {

    @Autowired
    private CalificacionRepository calificacionRepository;

    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificacionService notificacionService;

    @Transactional
    public CalificacionResponseDTO crearCalificacion(Long trabajoId, String clienteFirebaseUid, CrearCalificacionDTO dto) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));

        Trabajo trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new NotFoundException("Trabajo no encontrado"));

        if (!trabajo.getEstado().equals(TrabajoEstado.COMPLETADO)) {
            throw new RuntimeException("Solo se pueden calificar trabajos completados");
        }

        if (!trabajo.getCliente().getId().equals(cliente.getId())) {
            throw new ForbiddenException("Solo el cliente del trabajo puede calificarlo");
        }

        if (calificacionRepository.existsByTrabajoId(trabajoId)) {
            throw new RuntimeException("Este trabajo ya fue calificado");
        }

        Calificacion calificacion = new Calificacion();
        calificacion.setTrabajo(trabajo);
        calificacion.setCliente(cliente);
        calificacion.setProveedor(trabajo.getProveedor());
        calificacion.setEstrellas(dto.getEstrellas());
        calificacion.setComentario(dto.getComentario());

        calificacion = calificacionRepository.save(calificacion);
        notificacionService.enviarNotificacion(
                calificacion.getProveedor().getFirebaseUid(),
                TipoNotificacion.CALIFICACION_RECIBIDA,
                "Nueva Calificación Recibida",
                calificacion.getCliente().getNombre() + " te calificó con " + calificacion.getEstrellas() + " estrella" + (calificacion.getEstrellas() > 1 ? "s" : ""),
                calificacion.getTrabajo().getId(),
                "/proveedor/completado/" + calificacion.getTrabajo().getId()
        );

        // #8: recalcular y persistir el promedio/cantidad denormalizado del proveedor.
        // Recompute-on-write (la query ya incluye esta calificación recién guardada) →
        // las lecturas (DTOs, scoring) leen la columna sin recalcular. Cero drift.
        Long proveedorId = calificacion.getProveedor().getId();
        Double prom = calificacionRepository.getPromedioByProveedorId(proveedorId);
        Long cant = calificacionRepository.getCantidadByProveedorId(proveedorId);
        userRepository.findById(proveedorId).ifPresent(prov -> {
            prov.setPromedioCalificacion(prom != null ? prom : 0.0);
            prov.setCantidadCalificaciones(cant != null ? cant : 0L);
            userRepository.save(prov);
        });

        return mapToDTO(calificacion);
    }

    public List<CalificacionResponseDTO> getCalificacionesByProveedor(Long proveedorId) {
        return calificacionRepository.findByProveedorIdOrderByCreatedAtDesc(proveedorId)
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public Double getPromedioByProveedor(Long proveedorId) {
        return calificacionRepository.getPromedioByProveedorId(proveedorId);
    }

    public Long getCantidadByProveedor(Long proveedorId) {
        return calificacionRepository.getCantidadByProveedorId(proveedorId);
    }

    public boolean existeCalificacion(Long trabajoId) {
        return calificacionRepository.existsByTrabajoId(trabajoId);
    }

    public CalificacionResponseDTO getCalificacionByTrabajo(Long trabajoId) {
        Calificacion calificacion = calificacionRepository.findByTrabajoId(trabajoId)
                .orElseThrow(() -> new NotFoundException("Calificación no encontrada"));
        return mapToDTO(calificacion);
    }

    private CalificacionResponseDTO mapToDTO(Calificacion c) {
        CalificacionResponseDTO dto = new CalificacionResponseDTO();
        dto.setId(c.getId());
        dto.setTrabajoId(c.getTrabajo().getId());
        dto.setClienteNombre(c.getCliente().getNombre());
        dto.setEstrellas(c.getEstrellas());
        dto.setComentario(c.getComentario());
        dto.setOficioNombre(c.getTrabajo().getOficio().getNombre());
        dto.setCreatedAt(c.getCreatedAt());
        return dto;
    }

    public List<Map<String, Object>> getCalificacionesByProveedor(String firebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        List<Calificacion> calificaciones = calificacionRepository.findByProveedorIdOrderByCreatedAtDesc(proveedor.getId());

        return calificaciones.stream().map(c -> Map.<String, Object>of(
                "id", c.getId(),
                "estrellas", c.getEstrellas(),
                "comentario", c.getComentario() != null ? c.getComentario() : "",
                "clienteNombre", c.getCliente().getNombre(),
                "oficioNombre", c.getTrabajo().getOficio().getNombre(),
                "createdAt", c.getCreatedAt()
        )).collect(java.util.stream.Collectors.toList());
    }
}