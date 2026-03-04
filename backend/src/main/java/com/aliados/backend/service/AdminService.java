package com.aliados.backend.service;

import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private CalificacionRepository calificacionRepository;

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();

        // Usuarios
        long totalClientes = userRepository.countByRole(UserRole.CLIENT);
        long totalProveedores = userRepository.countByRole(UserRole.PROVIDER);
        long proveedoresOnline = userRepository.countByRoleAndStatus(UserRole.PROVIDER, UserStatus.ONLINE);
        long proveedoresBusy = userRepository.countByRoleAndStatus(UserRole.PROVIDER, UserStatus.BUSY);

        stats.put("totalClientes", totalClientes);
        stats.put("totalProveedores", totalProveedores);
        stats.put("proveedoresOnline", proveedoresOnline);
        stats.put("proveedoresBusy", proveedoresBusy);
        stats.put("totalUsuarios", totalClientes + totalProveedores);

        // Trabajos por estado
        long trabajosPendientes = trabajoRepository.countByEstado(TrabajoEstado.PENDIENTE);
        long trabajosPropuestos = trabajoRepository.countByEstado(TrabajoEstado.PROPUESTO);
        long trabajosEnCurso = trabajoRepository.countByEstado(TrabajoEstado.EN_CURSO);
        long trabajosEnCola = trabajoRepository.countByEstado(TrabajoEstado.EN_COLA);
        long trabajosCompletados = trabajoRepository.countByEstado(TrabajoEstado.COMPLETADO);
        long trabajosCancelados = trabajoRepository.countByEstado(TrabajoEstado.CANCELADO);
        long totalTrabajos = trabajosPendientes + trabajosPropuestos + trabajosEnCurso + trabajosEnCola + trabajosCompletados + trabajosCancelados;

        stats.put("trabajosPendientes", trabajosPendientes);
        stats.put("trabajosPropuestos", trabajosPropuestos);
        stats.put("trabajosEnCurso", trabajosEnCurso);
        stats.put("trabajosEnCola", trabajosEnCola);
        stats.put("trabajosCompletados", trabajosCompletados);
        stats.put("trabajosCancelados", trabajosCancelados);
        stats.put("totalTrabajos", totalTrabajos);

        // Trabajos por oficio
        List<Object[]> trabajosPorOficio = trabajoRepository.countTrabajosGroupByOficio();
        stats.put("trabajosPorOficio", trabajosPorOficio.stream().map(row -> {
            Map<String, Object> m = new HashMap<>();
            m.put("oficio", row[0]);
            m.put("icono", row[1]);
            m.put("cantidad", row[2]);
            return m;
        }).toList());

        // Calificación promedio global
        Double promedioGlobal = calificacionRepository.getPromedioGlobal();
        long totalCalificaciones = calificacionRepository.count();
        stats.put("promedioCalificacionGlobal", promedioGlobal != null ? promedioGlobal : 0.0);
        stats.put("totalCalificaciones", totalCalificaciones);

        return stats;
    }
}