package com.aliados.backend.service;

import com.aliados.backend.dto.ServiciosAdminResponse;
import com.aliados.backend.entity.*;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ServicioAdminServiceTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock MudanzaRepository mudanzaRepository;
    @InjectMocks ServicioAdminService service;

    private Trabajo trabajo(Long id, TrabajoEstado estado, LocalDateTime createdAt) {
        User cliente = new User();
        cliente.setNombre("Juan");
        Oficio oficio = new Oficio();
        oficio.setNombre("Plomería");
        Trabajo t = new Trabajo();
        t.setId(id);
        t.setCliente(cliente);
        t.setOficio(oficio);
        t.setEstado(estado);
        t.setDescripcion("desc");
        t.setDireccion("Calle 1");
        t.setCreatedAt(createdAt);
        return t;
    }

    private Mudanza mudanza(Long id, MudanzaEstado estado, LocalDateTime createdAt) {
        User cliente = new User();
        cliente.setNombre("Ana");
        Mudanza m = new Mudanza();
        m.setId(id);
        m.setCliente(cliente);
        m.setEstado(estado);
        m.setDireccionOrigen("Origen 1");
        m.setMontoBase(new BigDecimal("1000"));
        m.setCreatedAt(createdAt);
        return m;
    }

    @Test
    void buscarPorNumeroConPrefijoT_soloLookupDeTrabajo() {
        when(trabajoRepository.findByIdForAdmin(123L))
                .thenReturn(Optional.of(trabajo(123L, TrabajoEstado.EN_CURSO, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("#T-123", null, null, 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).tipo()).isEqualTo("TRABAJO");
        assertThat(r.items().get(0).id()).isEqualTo(123L);
        assertThat(r.items().get(0).oficio()).isEqualTo("Plomería");
        verifyNoInteractions(mudanzaRepository);
    }

    @Test
    void buscarPorNumeroConPrefijoM_soloLookupDeMudanza() {
        when(mudanzaRepository.findByIdForAdmin(45L))
                .thenReturn(Optional.of(mudanza(45L, MudanzaEstado.RESERVADO, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("m-45", null, null, 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).tipo()).isEqualTo("MUDANZA");
        assertThat(r.items().get(0).oficio()).isEqualTo("Mudanza");
        verifyNoInteractions(trabajoRepository);
    }

    @Test
    void buscarPorNumeroPelado_buscaEnAmbosTipos() {
        when(trabajoRepository.findByIdForAdmin(7L)).thenReturn(Optional.empty());
        when(mudanzaRepository.findByIdForAdmin(7L))
                .thenReturn(Optional.of(mudanza(7L, MudanzaEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("7", null, null, 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).tipo()).isEqualTo("MUDANZA");
    }

    @Test
    void qNoParseable_devuelveVacioSinConsultarRepos() {
        ServiciosAdminResponse r = service.buscar("abc", null, null, 0, 10);

        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        verifyNoInteractions(trabajoRepository, mudanzaRepository);
    }

    @Test
    void sinQ_listaAmbosTiposOrdenadosPorFechaDesc() {
        LocalDateTime ayer = LocalDateTime.now().minusDays(1);
        LocalDateTime hoy = LocalDateTime.now();
        when(trabajoRepository.findAllForAdmin())
                .thenReturn(List.of(trabajo(1L, TrabajoEstado.PENDIENTE, ayer)));
        when(mudanzaRepository.findAllForAdmin())
                .thenReturn(List.of(mudanza(2L, MudanzaEstado.PENDIENTE, hoy)));

        ServiciosAdminResponse r = service.buscar(null, null, null, 0, 10);

        assertThat(r.items()).hasSize(2);
        assertThat(r.items().get(0).tipo()).isEqualTo("MUDANZA"); // más reciente primero
        assertThat(r.total()).isEqualTo(2);
    }

    @Test
    void filtroTipoTrabajo_noConsultaMudanzas() {
        when(trabajoRepository.findAllForAdmin())
                .thenReturn(List.of(trabajo(1L, TrabajoEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar(null, "TRABAJO", null, 0, 10);

        assertThat(r.items()).hasSize(1);
        verifyNoInteractions(mudanzaRepository);
    }

    @Test
    void filtroEstado_soloAplicaDondeElValorExiste() {
        // RESERVADO existe en MudanzaEstado pero no en TrabajoEstado:
        // los trabajos quedan excluidos sin consultar su repo.
        when(mudanzaRepository.findAllForAdmin())
                .thenReturn(List.of(
                        mudanza(1L, MudanzaEstado.RESERVADO, LocalDateTime.now()),
                        mudanza(2L, MudanzaEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar(null, null, "RESERVADO", 0, 10);

        assertThat(r.items()).hasSize(1);
        assertThat(r.items().get(0).estado()).isEqualTo("RESERVADO");
        verifyNoInteractions(trabajoRepository);
    }

    @Test
    void filtroEstadoComun_filtraEnAmbosTipos() {
        when(trabajoRepository.findAllForAdmin())
                .thenReturn(List.of(
                        trabajo(1L, TrabajoEstado.EN_CURSO, LocalDateTime.now()),
                        trabajo(2L, TrabajoEstado.PENDIENTE, LocalDateTime.now())));
        when(mudanzaRepository.findAllForAdmin())
                .thenReturn(List.of(mudanza(3L, MudanzaEstado.EN_CURSO, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar(null, null, "EN_CURSO", 0, 10);

        assertThat(r.items()).hasSize(2);
        assertThat(r.items()).allSatisfy(i -> assertThat(i.estado()).isEqualTo("EN_CURSO"));
    }

    @Test
    void paginado_devuelveSegundaPaginaYTotalCompleto() {
        List<Trabajo> trabajos = new java.util.ArrayList<>();
        for (long i = 1; i <= 15; i++) {
            trabajos.add(trabajo(i, TrabajoEstado.PENDIENTE, LocalDateTime.now().minusMinutes(i)));
        }
        when(trabajoRepository.findAllForAdmin()).thenReturn(trabajos);

        ServiciosAdminResponse r = service.buscar(null, "TRABAJO", null, 1, 10);

        assertThat(r.items()).hasSize(5);
        assertThat(r.total()).isEqualTo(15);
    }

    @Test
    void lookupPorIdConFiltroEstado_excluyeSiNoMatchea() {
        when(trabajoRepository.findByIdForAdmin(1L))
                .thenReturn(Optional.of(trabajo(1L, TrabajoEstado.PENDIENTE, LocalDateTime.now())));

        ServiciosAdminResponse r = service.buscar("T-1", null, "COMPLETADO", 0, 10);

        assertThat(r.items()).isEmpty();
    }
}
