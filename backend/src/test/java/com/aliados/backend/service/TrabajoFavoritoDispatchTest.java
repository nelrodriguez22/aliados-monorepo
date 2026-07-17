package com.aliados.backend.service;

import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrabajoFavoritoDispatchTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock FeatureFlagService featureFlagService;
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;
    @Mock EventoService eventoService;
    @Mock FavoritoService favoritoService;

    @InjectMocks TrabajoService trabajoService;

    private Oficio oficioPlomeria() {
        Oficio o = new Oficio(); o.setId(1L); o.setNombre("Plomería");
        return o;
    }

    private User proveedor(Long id) {
        User p = new User(); p.setId(id); p.setFirebaseUid("uid-" + id); p.setOficio(oficioPlomeria());
        return p;
    }

    @Test
    void ofrecerAFavoritos_creaOfertaGrupo1YNotificaConTipoFavorito() {
        Trabajo t = new Trabajo();
        t.setId(100L);
        t.setOficio(oficioPlomeria());
        t.setDireccion("Córdoba 1234, Rosario");
        when(userRepository.findById(10L)).thenReturn(Optional.of(proveedor(10L)));

        trabajoService.ofrecerAFavoritos(t, List.of(10L));

        verify(trabajoOfertaRepository).save(argThat(o ->
                o.getProveedor().getId().equals(10L)
                        && o.getResultado() == ResultadoOferta.OFRECIDA
                        && Integer.valueOf(1).equals(o.getGrupo())));
        verify(notificacionService).enviarNotificacion(
                eq("uid-10"), eq(TipoNotificacion.NUEVO_TRABAJO_FAVORITO),
                anyString(), anyString(), eq(100L), anyString());
    }

    @Test
    void crearTrabajo_pedidoDirectoAProveedorNoFavorito_lanzaExcepcion() {
        User cliente = new User(); cliente.setId(1L); cliente.setFirebaseUid("cli-uid"); cliente.setLocalidad("Rosario");
        when(userRepository.findByFirebaseUid("cli-uid")).thenReturn(Optional.of(cliente));
        when(oficioRepository.findById(1L)).thenReturn(Optional.of(oficioPlomeria()));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(inv -> inv.getArgument(0));
        // El proveedor 99 NO está entre los favoritos del oficio → debe fallar.
        when(favoritoService.idsFavoritosPorOficio(1L, 1L)).thenReturn(List.of(10L));

        CrearTrabajoDTO dto = new CrearTrabajoDTO();
        dto.setOficioId(1L);
        dto.setDescripcion("Pérdida de agua");
        dto.setDireccion("Córdoba 1234, Rosario");
        dto.setLatitudCliente(-32.95);
        dto.setLongitudCliente(-60.65);
        dto.setProveedorDirectoId(99L);

        assertThatThrownBy(() -> trabajoService.crearTrabajo("cli-uid", dto))
                .hasMessageContaining("favorito");
        // no se ofreció a nadie (falló en la validación del grupo 0)
        verify(trabajoOfertaRepository, never()).save(any());
    }

    @Test
    void favoritosDisponibles_filtraLosLlenosUOffline() {
        User cliente = new User(); cliente.setId(1L); cliente.setLocalidad("Rosario");
        Trabajo t = new Trabajo(); t.setId(100L); t.setCliente(cliente); t.setOficio(oficioPlomeria());
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
        // Solo el 10 está disponible; el 11 (lleno/offline) no aparece en findProveedoresDisponibles.
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(List.of(proveedor(10L)));

        List<Long> res = trabajoService.favoritosDisponibles(t, List.of(10L, 11L));

        assertThat(res).containsExactly(10L);
    }

    private Trabajo trabajoConFavoritoDurmio() {
        User cliente = new User(); cliente.setId(1L); cliente.setLocalidad("Rosario");
        Trabajo t = new Trabajo();
        t.setId(100L); t.setCliente(cliente); t.setOficio(oficioPlomeria());
        t.setDireccion("Córdoba 1234, Rosario");
        TrabajoOferta durmio = new TrabajoOferta();
        durmio.setProveedor(proveedor(10L)); durmio.setTrabajo(t); durmio.setGrupo(1);
        durmio.setResultado(ResultadoOferta.DURMIO);
        when(trabajoOfertaRepository.findByTrabajoId(100L)).thenReturn(List.of(durmio));
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
        when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(10.0);
        when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
        return t;
    }

    @Test
    void ofrecerPoolNormalIncluyendoFavorito_reincluyeAlFavoritoYNotificaSegunCorresponda() {
        Trabajo t = trabajoConFavoritoDurmio();
        // El favorito (10) sigue disponible + otro (11).
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(proveedor(10L), proveedor(11L))));
        when(favoritoService.esFavorito(1L, 10L)).thenReturn(true);
        when(favoritoService.esFavorito(1L, 11L)).thenReturn(false);

        boolean ofrecio = trabajoService.ofrecerPoolNormalIncluyendoFavorito(t);

        assertThat(ofrecio).isTrue();
        verify(trabajoOfertaRepository, times(2)).save(any(TrabajoOferta.class)); // favorito re-incluido
        verify(notificacionService).enviarNotificacion(eq("uid-10"), eq(TipoNotificacion.NUEVO_TRABAJO_FAVORITO),
                anyString(), anyString(), eq(100L), anyString());
        verify(notificacionService).enviarNotificacion(eq("uid-11"), eq(TipoNotificacion.NUEVO_TRABAJO),
                anyString(), anyString(), eq(100L), anyString());
    }

    @Test
    void ofrecerPoolNormalIncluyendoFavorito_conSoloElFavoritoDisponible_loReofreceNoCancela() {
        Trabajo t = trabajoConFavoritoDurmio();
        // El favorito (10) es el ÚNICO disponible: igual se lo re-ofrece (no cancela).
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(proveedor(10L))));
        when(favoritoService.esFavorito(1L, 10L)).thenReturn(true);

        boolean ofrecio = trabajoService.ofrecerPoolNormalIncluyendoFavorito(t);

        assertThat(ofrecio).isTrue();
        verify(trabajoOfertaRepository).save(any(TrabajoOferta.class));
        verify(notificacionService).enviarNotificacion(eq("uid-10"), eq(TipoNotificacion.NUEVO_TRABAJO_FAVORITO),
                anyString(), anyString(), eq(100L), anyString());
    }
}
