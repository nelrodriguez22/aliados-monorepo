package com.aliados.backend.service;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.aliados.backend.dto.TrabajoResponseDTO;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrabajoOfertaGrupoTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock com.aliados.backend.service.FeatureFlagService featureFlagService;
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;

    @InjectMocks TrabajoService trabajoService;

    private Trabajo pendiente(int reintentos, LocalDateTime notificadoAt) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        User cliente = new User();
        cliente.setFirebaseUid("cliente-uid");
        cliente.setLocalidad("Rosario");
        Trabajo t = new Trabajo();
        t.setId(100L);
        t.setEstado(TrabajoEstado.PENDIENTE);
        t.setReintentos(reintentos);
        t.setNotificadoAt(notificadoAt);
        t.setCreatedAt(notificadoAt != null ? notificadoAt : LocalDateTime.now().minusHours(1));
        t.setProveedorNotificadoId(5L);
        t.setCliente(cliente);
        t.setOficio(oficio);
        return t;
    }

    private User proveedor(Long id) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        User p = new User();
        p.setId(id);
        p.setOficio(oficio);
        p.setFirebaseUid("uid-" + id);
        return p;
    }

    @Test
    void getTrabajosPendientes_devuelveLosOfrecidosAlProveedor() {
        User prov = proveedor(10L);
        when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findPendientesOfrecidosA(10L, prov.getOficio().getId())).thenReturn(List.of(t));

        List<TrabajoResponseDTO> res = trabajoService.getTrabajosPendientes("uid-10");

        assertThat(res).hasSize(1);
    }

    @Test
    void ofrecerSiguienteGrupo_creaFilasOfrecidaYNotifica() {
        Trabajo t = pendiente(0, null); // helper como en TrabajoEscalacionTest
        when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(2.0);
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
        User p1 = proveedor(10L), p2 = proveedor(11L), p3 = proveedor(12L);
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(p1, p2, p3)));
        when(providerScoreService.ordenarPorScore(anyList()))
                .thenAnswer(inv -> inv.getArgument(0)); // ya ordenado
        when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of());

        trabajoService.ofrecerSiguienteGrupo(t);

        // top 2 → 2 ofertas guardadas + 2 push
        verify(trabajoOfertaRepository, times(2)).save(any(TrabajoOferta.class));
        verify(notificacionService, times(2)).enviarNotificacion(anyString(), any(), anyString(), anyString(), anyLong(), anyString());
    }
}
