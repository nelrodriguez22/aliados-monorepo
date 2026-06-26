package com.aliados.backend.service;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrabajoEscalacionTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock com.aliados.backend.service.FeatureFlagService featureFlagService;

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

    @Test
    void ventana1_vencida_reofrece_incrementa_y_notifica_cliente() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        // Sin proveedor disponible: la re-oferta corre pero no asigna (camino simple).
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(List.of());

        trabajoService.escalarUnTrabajo(100L, 3, 3);

        assertThat(t.getReintentos()).isEqualTo(1);
        verify(userRepository).findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt());
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void ventana2_vencida_cancela_y_notifica_cliente() {
        Trabajo t = pendiente(1, LocalDateTime.now().minusMinutes(10));
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));

        trabajoService.escalarUnTrabajo(100L, 3, 3);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.CANCELADO);
        assertThat(t.getMotivoCancelacion()).isEqualTo("No encontramos un profesional disponible");
        assertThat(t.getProveedorNotificadoId()).isNull();
        assertThat(t.getNotificadoAt()).isNull();
        verify(cloudinaryService).borrarFotos(any());
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void dentro_de_la_ventana_no_hace_nada() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(1));
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));

        trabajoService.escalarUnTrabajo(100L, 3, 3);

        assertThat(t.getReintentos()).isEqualTo(0);
        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PENDIENTE);
        verifyNoInteractions(notificacionService);
        verify(cloudinaryService, never()).borrarFotos(any());
    }

    @Test
    void notificadoAt_null_usa_createdAt_como_referencia() {
        Trabajo t = pendiente(0, null); // notificadoAt null → ref = createdAt (now-1h, viejo)
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(List.of());

        trabajoService.escalarUnTrabajo(100L, 3, 3);

        assertThat(t.getReintentos()).isEqualTo(1); // createdAt viejo → ventana 1 vence
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void ventana1_excluye_al_proveedor_actual() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10)); // proveedorNotificadoId=5
        User actual = new User();
        actual.setId(5L);
        actual.setFirebaseUid("prov-5");
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        // Único "disponible" es el proveedor actual → debe quedar excluido (lista vacía tras removeIf).
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(List.of(actual));

        trabajoService.escalarUnTrabajo(100L, 3, 3);

        // El proveedor actual (5) fue excluido → NO recibe oferta:
        verify(notificacionService, never()).enviarNotificacion(eq("prov-5"), any(), any(), any(), any(), any());
        // El cliente sí es notificado:
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void trabajo_ya_no_pendiente_no_hace_nada() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        t.setEstado(TrabajoEstado.CANCELADO); // tomado/cancelado entre la query y el procesamiento
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));

        trabajoService.escalarUnTrabajo(100L, 3, 3);

        verifyNoInteractions(notificacionService);
        verify(trabajoRepository, never()).save(any());
    }

    @Test
    void getLimiteTrabajos_flete_usaFlagFlete() {
        Oficio flete = new Oficio();
        flete.setNombre("Flete");
        when(featureFlagService.getNumber("limite_trabajos_flete", 8.0)).thenReturn(8.0);
        assertThat(trabajoService.getLimiteTrabajos(flete)).isEqualTo(8);
    }

    @Test
    void getLimiteTrabajos_otroOficio_usaFlagDefault() {
        Oficio plomeria = new Oficio();
        plomeria.setNombre("Plomería");
        when(featureFlagService.getNumber("limite_trabajos_default", 3.0)).thenReturn(3.0);
        assertThat(trabajoService.getLimiteTrabajos(plomeria)).isEqualTo(3);
    }
}

