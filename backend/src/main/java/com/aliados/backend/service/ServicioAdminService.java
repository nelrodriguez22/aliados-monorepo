package com.aliados.backend.service;

import com.aliados.backend.dto.ServicioAdminItemDTO;
import com.aliados.backend.dto.ServiciosAdminResponse;
import com.aliados.backend.entity.MudanzaEstado;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ServicioAdminService {

    private static final Pattern Q_CON_PREFIJO = Pattern.compile("^([TM])-?(\\d+)$");
    private static final Pattern Q_NUMERO = Pattern.compile("^\\d+$");

    private final TrabajoRepository trabajoRepository;
    private final MudanzaRepository mudanzaRepository;

    public ServicioAdminService(TrabajoRepository trabajoRepository,
                                MudanzaRepository mudanzaRepository) {
        this.trabajoRepository = trabajoRepository;
        this.mudanzaRepository = mudanzaRepository;
    }

    // q parseado: tipo "TRABAJO"/"MUDANZA"/null (null = ambos), id numérico.
    private record ParsedQ(String tipo, Long id) {}

    // null = sin filtro (q vacío). ParsedQ con id null = no parseable → resultado vacío.
    static ParsedQ parseQ(String q) {
        if (q == null || q.isBlank()) return null;
        String s = q.trim().toUpperCase().replaceFirst("^#", "");
        Matcher m = Q_CON_PREFIJO.matcher(s);
        if (m.matches()) {
            String tipo = m.group(1).equals("T") ? "TRABAJO" : "MUDANZA";
            Long id = parseLongSeguro(m.group(2));
            return id != null ? new ParsedQ(tipo, id) : new ParsedQ(null, null);
        }
        if (Q_NUMERO.matcher(s).matches()) {
            Long id = parseLongSeguro(s);
            if (id != null) return new ParsedQ(null, id);
        }
        return new ParsedQ(null, null); // no parseable
    }

    // Overflow de Long (ej. 20 dígitos) = no parseable, nunca excepción.
    private static Long parseLongSeguro(String s) {
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Transactional(readOnly = true)
    public ServiciosAdminResponse buscar(String q, String tipo, String estado, int page, int size) {
        ParsedQ parsed = parseQ(q);
        if (parsed != null && parsed.id() == null) {
            return new ServiciosAdminResponse(List.of(), 0); // q no parseable → vacío, no 400
        }

        String filtroEstado = (estado == null || estado.isBlank()) ? null : estado.trim().toUpperCase();
        boolean quiereTrabajos = incluyeTipo(tipo, parsed, "TRABAJO") && estadoExisteEnTrabajo(filtroEstado);
        boolean quiereMudanzas = incluyeTipo(tipo, parsed, "MUDANZA") && estadoExisteEnMudanza(filtroEstado);

        List<ServicioAdminItemDTO> items = new ArrayList<>();
        if (parsed != null) {
            // Lookup por id
            if (quiereTrabajos) {
                trabajoRepository.findByIdForAdmin(parsed.id())
                        .map(ServicioAdminItemDTO::from).ifPresent(items::add);
            }
            if (quiereMudanzas) {
                mudanzaRepository.findByIdForAdmin(parsed.id())
                        .map(ServicioAdminItemDTO::from).ifPresent(items::add);
            }
        } else {
            // Listado con filtros. Volumen pre-launch mínimo: se trae todo y se
            // filtra/pagina en memoria. Si crece, mover filtro+paginado a SQL.
            if (quiereTrabajos) {
                trabajoRepository.findAllForAdmin().stream()
                        .map(ServicioAdminItemDTO::from).forEach(items::add);
            }
            if (quiereMudanzas) {
                mudanzaRepository.findAllForAdmin().stream()
                        .map(ServicioAdminItemDTO::from).forEach(items::add);
            }
        }

        List<ServicioAdminItemDTO> filtrados = items.stream()
                .filter(i -> filtroEstado == null || i.estado().equals(filtroEstado))
                // createdAt es @Column(nullable=false) en ambas entidades: no hace falta null-handling.
                .sorted(Comparator.comparing(ServicioAdminItemDTO::createdAt).reversed())
                .toList();

        // long: page*size puede desbordar int con valores grandes/maliciosos (ej. page=250000000).
        long from = (long) Math.max(0, page) * Math.max(1, size);
        long to = Math.min(filtrados.size(), from + Math.max(1, size));
        List<ServicioAdminItemDTO> pagina = from >= filtrados.size() ? List.of() : filtrados.subList((int) from, (int) to);
        return new ServiciosAdminResponse(pagina, filtrados.size());
    }

    private boolean incluyeTipo(String tipoParam, ParsedQ parsed, String tipo) {
        if (tipoParam != null && !tipoParam.isBlank() && !tipoParam.trim().equalsIgnoreCase(tipo)) return false;
        return parsed == null || parsed.tipo() == null || parsed.tipo().equals(tipo);
    }

    private boolean estadoExisteEnTrabajo(String estado) {
        if (estado == null) return true;
        try { TrabajoEstado.valueOf(estado); return true; }
        catch (IllegalArgumentException e) { return false; }
    }

    private boolean estadoExisteEnMudanza(String estado) {
        if (estado == null) return true;
        try { MudanzaEstado.valueOf(estado); return true; }
        catch (IllegalArgumentException e) { return false; }
    }
}
