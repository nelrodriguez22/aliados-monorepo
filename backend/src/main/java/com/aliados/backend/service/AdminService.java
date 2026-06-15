package com.aliados.backend.service;

import com.aliados.backend.entity.*;
import com.aliados.backend.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminService {

    @Autowired private UserRepository userRepository;
    @Autowired private TrabajoRepository trabajoRepository;
    @Autowired private CalificacionRepository calificacionRepository;
    @Autowired private MudanzaRepository mudanzaRepository;

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();

        long totalClientes = userRepository.countByRole(UserRole.CLIENT);
        long totalProveedores = userRepository.countByRole(UserRole.PROVIDER);
        long proveedoresOnline = userRepository.countByRoleAndStatus(UserRole.PROVIDER, UserStatus.ONLINE);
        long proveedoresBusy = userRepository.countByRoleAndStatus(UserRole.PROVIDER, UserStatus.BUSY);

        stats.put("totalClientes", totalClientes);
        stats.put("totalProveedores", totalProveedores);
        stats.put("proveedoresOnline", proveedoresOnline);
        stats.put("proveedoresBusy", proveedoresBusy);
        stats.put("totalUsuarios", totalClientes + totalProveedores);

        long trabajosPendientes = trabajoRepository.countByEstado(TrabajoEstado.PENDIENTE);
        long trabajosPropuestos = trabajoRepository.countByEstado(TrabajoEstado.PROPUESTO);
        long trabajosEnCurso   = trabajoRepository.countByEstado(TrabajoEstado.EN_CURSO);
        long trabajosEnCola    = trabajoRepository.countByEstado(TrabajoEstado.EN_COLA);
        long trabajosCompletados = trabajoRepository.countByEstado(TrabajoEstado.COMPLETADO);
        long trabajosCancelados  = trabajoRepository.countByEstado(TrabajoEstado.CANCELADO);
        long totalTrabajos = trabajosPendientes + trabajosPropuestos + trabajosEnCurso + trabajosEnCola + trabajosCompletados + trabajosCancelados;

        stats.put("trabajosPendientes", trabajosPendientes);
        stats.put("trabajosPropuestos", trabajosPropuestos);
        stats.put("trabajosEnCurso", trabajosEnCurso);
        stats.put("trabajosEnCola", trabajosEnCola);
        stats.put("trabajosCompletados", trabajosCompletados);
        stats.put("trabajosCancelados", trabajosCancelados);
        stats.put("totalTrabajos", totalTrabajos);

        List<Object[]> trabajosPorOficio = trabajoRepository.countTrabajosGroupByOficio();
        stats.put("trabajosPorOficio", trabajosPorOficio.stream().map(row -> {
            Map<String, Object> m = new HashMap<>();
            m.put("oficio", row[0]);
            m.put("icono", row[1]);
            m.put("cantidad", row[2]);
            return m;
        }).toList());

        Double promedioGlobal = calificacionRepository.getPromedioGlobal();
        long totalCalificaciones = calificacionRepository.count();
        stats.put("promedioCalificacionGlobal", promedioGlobal != null ? promedioGlobal : 0.0);
        stats.put("totalCalificaciones", totalCalificaciones);

        // Mudanzas por estado
        Map<String, Long> mudanzas = new HashMap<>();
        for (MudanzaEstado estado : MudanzaEstado.values()) {
            mudanzas.put(estado.name(), mudanzaRepository.countByEstado(estado));
        }
        stats.put("mudanzas", mudanzas);

        // Funnel de conversión
        long funnelPendiente = trabajosPendientes + trabajosPropuestos + trabajosEnCurso + trabajosEnCola + trabajosCompletados + trabajosCancelados;
        long funnelPropuesto = trabajosPropuestos + trabajosEnCurso + trabajosEnCola + trabajosCompletados + trabajosCancelados;
        long funnelCompletado = trabajosCompletados;
        long funnelTerminados = trabajosCompletados + trabajosCancelados;

        Map<String, Object> funnel = new HashMap<>();
        funnel.put("pendiente", funnelPendiente);
        funnel.put("propuesto", funnelPropuesto);
        funnel.put("completado", funnelCompletado);
        funnel.put("tasaPropuesto", funnelPendiente > 0 ? Math.round((funnelPropuesto * 100.0) / funnelPendiente) : 0);
        funnel.put("tasaCompletado", funnelPropuesto > 0 ? Math.round((funnelCompletado * 100.0) / funnelPropuesto) : 0);
        funnel.put("tasaExito", funnelTerminados > 0 ? Math.round((funnelCompletado * 100.0) / funnelTerminados) : 0);
        stats.put("funnel", funnel);

        return stats;
    }

    public List<Map<String, Object>> getProveedoresActivos() {
        List<User> proveedores = userRepository.findByRoleAndStatusIn(
                UserRole.PROVIDER, List.of(UserStatus.ONLINE, UserStatus.BUSY));

        return proveedores.stream().map(p -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", p.getId());
            m.put("nombre", p.getNombre());
            m.put("fotoPerfil", p.getFotoPerfil());
            m.put("oficio", p.getOficio() != null ? p.getOficio().getNombre() : null);
            m.put("status", p.getStatus().name());
            m.put("lastSeenAt", p.getLastSeenAt());

            if (p.getStatus() == UserStatus.BUSY) {
                Trabajo t = trabajoRepository.findTrabajoEnCursoByProveedorId(p.getId());
                if (t != null) {
                    Map<String, Object> job = new HashMap<>();
                    job.put("id", t.getId());
                    job.put("descripcion", t.getDescripcion());
                    job.put("direccion", t.getDireccion());
                    job.put("aceptadoAt", t.getAcceptedAt());
                    job.put("clienteNombre", t.getCliente().getNombre());
                    m.put("trabajoActual", job);
                }
            }
            return m;
        }).toList();
    }

    public void forceProviderOffline(Long id) {
        User proveedor = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));
        proveedor.setStatus(UserStatus.OFFLINE);
        userRepository.save(proveedor);
    }

    public Map<String, Object> getCalificacionesRecientes() {
        List<Calificacion> recientes = calificacionRepository.findTop10ByOrderByCreatedAtDesc();
        List<Object[]> bajas = calificacionRepository.findProveedoresConCalificacionBaja(3.5, 3);

        Map<String, Object> result = new HashMap<>();
        result.put("recientes", recientes.stream().map(c -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", c.getId());
            m.put("estrellas", c.getEstrellas());
            m.put("comentario", c.getComentario());
            m.put("proveedorNombre", c.getProveedor().getNombre());
            m.put("clienteNombre", c.getCliente().getNombre());
            m.put("createdAt", c.getCreatedAt());
            return m;
        }).toList());

        result.put("proveedoresBajaCalificacion", bajas.stream().map(row -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", row[0]);
            m.put("nombre", row[1]);
            m.put("fotoPerfil", row[2]);
            m.put("promedio", row[3]);
            m.put("total", row[4]);
            return m;
        }).toList());

        return result;
    }

    public Map<String, Object> getAlertas() {
        LocalDateTime umbral = LocalDateTime.now().minusMinutes(30);
        List<Trabajo> varados = trabajoRepository.findTrabajosVarados(umbral);

        Map<String, Object> result = new HashMap<>();
        result.put("trabajosVarados", varados.stream().map(t -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", t.getId());
            m.put("descripcion", t.getDescripcion());
            m.put("oficio", t.getOficio().getNombre());
            m.put("direccion", t.getDireccion());
            m.put("createdAt", t.getCreatedAt());
            m.put("minutosEsperando", ChronoUnit.MINUTES.between(t.getCreatedAt(), LocalDateTime.now()));
            return m;
        }).toList());

        return result;
    }
}
