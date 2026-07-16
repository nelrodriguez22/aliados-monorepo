package com.aliados.backend.service;

import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.exception.ForbiddenException;
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

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * SEC-2 (IDOR): GET /api/trabajos/{id} solo debe devolver el trabajo al cliente
 * dueño, al proveedor asignado, a un proveedor con oferta para ese trabajo, o a
 * un ADMIN. Cualquier otro usuario autenticado debe recibir 403 (ForbiddenException).
 */
@ExtendWith(MockitoExtension.class)
class TrabajoAutorizacionTest {

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
    @Mock ConversacionRepository conversacionRepository;
    @Mock EventoService eventoService;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id);
        u.setFirebaseUid(uid);
        u.setRole(role);
        u.setNombre("user-" + id);
        return u;
    }

    private Trabajo trabajoDe(User cliente, User proveedor) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        Trabajo t = new Trabajo();
        t.setId(100L);
        t.setEstado(TrabajoEstado.PENDIENTE);
        t.setCliente(cliente);
        t.setProveedor(proveedor);
        t.setOficio(oficio);
        return t;
    }

    @Test
    void getTrabajoById_usuarioAjeno_lanzaForbidden() {
        User cliente = user(1L, "cliente-uid", UserRole.CLIENT);
        User ajeno = user(99L, "ajeno-uid", UserRole.PROVIDER);
        Trabajo t = trabajoDe(cliente, null);

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("ajeno-uid")).thenReturn(Optional.of(ajeno));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(100L, 99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> trabajoService.getTrabajoById(100L, "ajeno-uid"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void getTrabajoById_clienteDueno_devuelve() {
        User cliente = user(1L, "cliente-uid", UserRole.CLIENT);
        Trabajo t = trabajoDe(cliente, null);

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("cliente-uid")).thenReturn(Optional.of(cliente));
        lenient().when(calificacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());

        TrabajoResponseDTO dto = trabajoService.getTrabajoById(100L, "cliente-uid");

        assertThat(dto.getId()).isEqualTo(100L);
    }

    @Test
    void getTrabajoById_proveedorConOfertaActiva_devuelve() {
        User cliente = user(1L, "cliente-uid", UserRole.CLIENT);
        User proveedor = user(50L, "prov-uid", UserRole.PROVIDER);
        Trabajo t = trabajoDe(cliente, null); // aún no asignado; solo tiene oferta

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("prov-uid")).thenReturn(Optional.of(proveedor));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(100L, 50L))
                .thenReturn(Optional.of(oferta(ResultadoOferta.OFRECIDA)));
        lenient().when(calificacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());

        TrabajoResponseDTO dto = trabajoService.getTrabajoById(100L, "prov-uid");

        assertThat(dto.getId()).isEqualTo(100L);
    }

    // SEC-10: una oferta que ya terminó (DURMIO) no debe seguir dando acceso al trabajo.
    @Test
    void getTrabajoById_proveedorConOfertaDurmio_lanzaForbidden() {
        User cliente = user(1L, "cliente-uid", UserRole.CLIENT);
        User proveedor = user(50L, "prov-uid", UserRole.PROVIDER);
        Trabajo t = trabajoDe(cliente, null);

        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(userRepository.findByFirebaseUid("prov-uid")).thenReturn(Optional.of(proveedor));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(100L, 50L))
                .thenReturn(Optional.of(oferta(ResultadoOferta.DURMIO)));
        lenient().when(calificacionRepository.findByTrabajoId(100L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> trabajoService.getTrabajoById(100L, "prov-uid"))
                .isInstanceOf(ForbiddenException.class);
    }

    private TrabajoOferta oferta(ResultadoOferta resultado) {
        TrabajoOferta o = new TrabajoOferta();
        o.setResultado(resultado);
        return o;
    }
}
