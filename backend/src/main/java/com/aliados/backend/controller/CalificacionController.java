package com.aliados.backend.controller;

import com.aliados.backend.dto.CalificacionResponseDTO;
import com.aliados.backend.dto.CrearCalificacionDTO;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.service.CalificacionService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/calificaciones")
public class CalificacionController {

    @Autowired
    private CalificacionService calificacionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CalificacionRepository calificacionRepository;

    @PostMapping("/trabajo/{trabajoId}")
    public ResponseEntity<CalificacionResponseDTO> calificar(
            @PathVariable Long trabajoId,
            @Valid @RequestBody CrearCalificacionDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        CalificacionResponseDTO calificacion = calificacionService.crearCalificacion(trabajoId, uid, dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(calificacion);
    }

    @GetMapping("/proveedor/{proveedorId}")
    public ResponseEntity<?> getCalificacionesProveedor(@PathVariable Long proveedorId) {
        List<CalificacionResponseDTO> calificaciones = calificacionService.getCalificacionesByProveedor(proveedorId);
        Double promedio = calificacionService.getPromedioByProveedor(proveedorId);
        Long cantidad = calificacionService.getCantidadByProveedor(proveedorId);

        return ResponseEntity.ok(Map.of(
                "calificaciones", calificaciones,
                "promedio", promedio != null ? promedio : 0,
                "cantidad", cantidad
        ));
    }

    @GetMapping("/trabajo/{trabajoId}/existe")
    public ResponseEntity<?> existeCalificacion(@PathVariable Long trabajoId) {
        return ResponseEntity.ok(Map.of("calificado", calificacionService.existeCalificacion(trabajoId)));
    }

    @GetMapping("/trabajo/{trabajoId}")
    public ResponseEntity<CalificacionResponseDTO> getCalificacionByTrabajo(@PathVariable Long trabajoId) {
        CalificacionResponseDTO calificacion = calificacionService.getCalificacionByTrabajo(trabajoId);
        return ResponseEntity.ok(calificacion);
    }

    @GetMapping("/proveedor/promedio")
    public ResponseEntity<?> getPromedioProveedor(Authentication authentication) {
        String uid = authentication.getName();
        User proveedor = userRepository.findByFirebaseUid(uid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        Double promedio = calificacionRepository.getPromedioByProveedorId(proveedor.getId());
        Long total = calificacionRepository.countByProveedorId(proveedor.getId());

        return ResponseEntity.ok(Map.of(
                "promedio", promedio != null ? promedio : 0,
                "total", total
        ));
    }

    @GetMapping("/proveedor/todas")
    public ResponseEntity<?> getCalificacionesProveedor(Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(calificacionService.getCalificacionesByProveedor(uid));
    }
}
