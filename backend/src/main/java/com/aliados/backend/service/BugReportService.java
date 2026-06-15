package com.aliados.backend.service;

import com.aliados.backend.dto.BugReportResponseDTO;
import com.aliados.backend.dto.CrearBugReportDTO;
import com.aliados.backend.entity.BugCategoria;
import com.aliados.backend.entity.BugReport;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.BugReportRepository;
import com.aliados.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class BugReportService {

    @Autowired
    private BugReportRepository bugReportRepository;

    @Autowired
    private UserRepository userRepository;

    @Transactional
    public BugReportResponseDTO crear(String firebaseUid, CrearBugReportDTO dto) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        BugReport report = new BugReport();
        report.setUser(user);
        report.setCategoria(BugCategoria.valueOf(dto.getCategoria().toUpperCase()));
        report.setTitulo(dto.getTitulo());
        report.setDescripcion(dto.getDescripcion());
        report.setUrl(dto.getUrl());

        return mapToDTO(bugReportRepository.save(report));
    }

    public List<BugReportResponseDTO> listar(String firebaseUid) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        if (user.getRole() != UserRole.ADMIN) {
            throw new AccessDeniedException("No tenés permisos para ver los reportes");
        }
        return bugReportRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    private BugReportResponseDTO mapToDTO(BugReport r) {
        BugReportResponseDTO dto = new BugReportResponseDTO();
        dto.setId(r.getId());
        dto.setUsuarioNombre(r.getUser().getNombre());
        dto.setUsuarioEmail(r.getUser().getEmail());
        dto.setCategoria(r.getCategoria().name());
        dto.setTitulo(r.getTitulo());
        dto.setDescripcion(r.getDescripcion());
        dto.setUrl(r.getUrl());
        dto.setCreatedAt(r.getCreatedAt());
        return dto;
    }
}
