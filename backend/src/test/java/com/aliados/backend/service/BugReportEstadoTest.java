package com.aliados.backend.service;

import com.aliados.backend.dto.BugReportResponseDTO;
import com.aliados.backend.entity.BugCategoria;
import com.aliados.backend.entity.BugEstado;
import com.aliados.backend.entity.BugReport;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.BugReportRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BugReportEstadoTest {

    @Mock BugReportRepository bugReportRepository;
    @Mock UserRepository userRepository;

    @InjectMocks BugReportService bugReportService;

    private BugReport bug() {
        User u = new User();
        u.setNombre("Juan");
        u.setEmail("juan@x.com");
        BugReport b = new BugReport();
        b.setId(1L);
        b.setUser(u);
        b.setCategoria(BugCategoria.OTRO);
        b.setTitulo("titulo");
        b.setDescripcion("desc");
        b.setEstado(BugEstado.NUEVO);
        return b;
    }

    @Test
    void actualizarEstado_cambiaYDevuelveDTO() {
        BugReport b = bug();
        when(bugReportRepository.findById(1L)).thenReturn(Optional.of(b));
        when(bugReportRepository.save(b)).thenReturn(b);

        BugReportResponseDTO dto = bugReportService.actualizarEstado(1L, BugEstado.RESUELTO);

        assertThat(b.getEstado()).isEqualTo(BugEstado.RESUELTO);
        assertThat(dto.getEstado()).isEqualTo("RESUELTO");
        verify(bugReportRepository).save(b);
    }

    @Test
    void actualizarEstado_noExiste_lanzaNoSuchElement() {
        when(bugReportRepository.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> bugReportService.actualizarEstado(9L, BugEstado.RESUELTO))
                .isInstanceOf(NoSuchElementException.class);
    }
}
