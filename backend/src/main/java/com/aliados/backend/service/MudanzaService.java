package com.aliados.backend.service;

import com.aliados.backend.dto.*;
import com.aliados.backend.entity.*;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.MudanzaTierRepository;
import com.aliados.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class MudanzaService {

    private static final Logger logger = LoggerFactory.getLogger(MudanzaService.class);

    @Autowired
    private MudanzaRepository mudanzaRepository;

    @Autowired
    private MudanzaTierRepository mudanzaTierRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificacionService notificacionService;

    private static final int MAX_MUDANZAS_POR_DIA = 2;

    // Ratio de tiempo para testing: 1 min real = ratioTiempo minutos de servicio
    // En producción: 1.0 (1 min real = 1 min servicio)
    // En testing: 180.0 (1 min real = 180 min servicio = 3 horas)
    @Value("${mudanza.ratio-tiempo:1.0}")
    private Double ratioTiempo;

    // ════════════════════════════════════════════
    // TIERS
    // ════════════════════════════════════════════

    public List<MudanzaTierResponseDTO> getTiers() {
        return mudanzaTierRepository.findByActivoTrueOrderByOrdenAsc()
                .stream()
                .map(this::mapTierToDTO)
                .collect(Collectors.toList());
    }

    // ════════════════════════════════════════════
    // FASE 1: CREAR SOLICITUD (Cliente)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO crearMudanza(String clienteFirebaseUid, CrearMudanzaDTO dto) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        MudanzaTier tier = mudanzaTierRepository.findById(dto.getTierId())
                .orElseThrow(() -> new RuntimeException("Tier no encontrado"));

        // Validar región Rosario
        double lat = dto.getLatitudOrigen();
        double lng = dto.getLongitudOrigen();
        if (lat < -33.05 || lat > -32.85 || lng < -60.80 || lng > -60.55) {
            throw new RuntimeException("Por el momento, Aliados solo está disponible en Rosario, Santa Fe.");
        }

        Mudanza mudanza = new Mudanza();
        mudanza.setCliente(cliente);
        mudanza.setTier(tier);
        mudanza.setEstado(MudanzaEstado.PENDIENTE);

        // Origen
        mudanza.setDireccionOrigen(dto.getDireccionOrigen());
        mudanza.setLatitudOrigen(dto.getLatitudOrigen());
        mudanza.setLongitudOrigen(dto.getLongitudOrigen());

        // Destino
        mudanza.setDireccionDestino(dto.getDireccionDestino());
        mudanza.setLatitudDestino(dto.getLatitudDestino());
        mudanza.setLongitudDestino(dto.getLongitudDestino());

        // Accesibilidad
        mudanza.setPisos(dto.getPisos());
        mudanza.setTieneAscensor(dto.getTieneAscensor());
        mudanza.setCantidadAmbientes(dto.getCantidadAmbientes());

        // Fecha
        mudanza.setFechaDeseada(dto.getFechaDeseada());

        // Media
        mudanza.setFotos(dto.getFotos());
        mudanza.setNotasCliente(dto.getNotasCliente());

        // Montos
        mudanza.setMontoBase(tier.getPrecioBase());

        mudanza = mudanzaRepository.save(mudanza);

        logger.info("Mudanza {} creada por cliente {} - Tier: {} (${}) ",
                mudanza.getId(), cliente.getNombre(), tier.getNombre(), tier.getPrecioBase());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // FASE 2: RESERVAR / "PAGAR" (Cliente)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO reservarMudanza(Long mudanzaId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!mudanza.getEstado().equals(MudanzaEstado.PENDIENTE)) {
            throw new RuntimeException("La mudanza no está en estado pendiente");
        }

        mudanza.setEstado(MudanzaEstado.RESERVADO);
        mudanza.setReservadoAt(LocalDateTime.now());
        mudanza = mudanzaRepository.save(mudanza);

        // Notificar al proveedor de fletes (Ricky Bay por ahora es fijo)
        notificarProveedorFletes(mudanza);

        logger.info("Mudanza {} reservada - Monto: ${}", mudanza.getId(), mudanza.getMontoBase());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // PROVEEDOR: ACEPTAR DIRECTAMENTE
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO aceptarMudanza(Long mudanzaId, String proveedorFirebaseUid, MudanzaTurno turno) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getEstado().equals(MudanzaEstado.RESERVADO)) {
            throw new RuntimeException("La mudanza no está disponible para aceptar");
        }

        // Validar que el turno esté libre para esa fecha
        LocalDate fechaAgendar = mudanza.getFechaDeseada();
        boolean turnoOcupado = mudanzaRepository.existsByFechaConfirmadaAndTurnoAndEstadoNotIn(
                fechaAgendar, turno, List.of(MudanzaEstado.CANCELADO, MudanzaEstado.COMPLETADO));
        if (turnoOcupado) {
            String turnoLabel = turno == MudanzaTurno.PRIMERO ? "1er turno (6:30hs)" : "2do turno (~11:00hs)";
            throw new RuntimeException("El " + turnoLabel + " del " + fechaAgendar + " ya está ocupado.");
        }

        mudanza.setEstado(MudanzaEstado.ACEPTADO);
        mudanza.setProveedor(proveedor);
        mudanza.setFechaConfirmada(fechaAgendar);
        mudanza.setTurno(turno);
        mudanza.setAcceptedAt(LocalDateTime.now());
        mudanza = mudanzaRepository.save(mudanza);

        String turnoLabel = turno == MudanzaTurno.PRIMERO ? "1er turno (6:30hs)" : "2do turno (~11:00hs)";
        notificacionService.enviarNotificacion(
                mudanza.getCliente().getFirebaseUid(),
                "MUDANZA_ACEPTADA",
                "Mudanza Confirmada",
                "Fletes Bay aceptó tu mudanza " + mudanza.getTier().getEmoji() + " " + mudanza.getTier().getNombre() +
                        " para el " + fechaAgendar + " - " + turnoLabel,
                mudanza.getId(),
                "/cliente/mudanza/" + mudanza.getId()
        );

        logger.info("Mudanza {} aceptada - Fecha: {} Turno: {}", mudanza.getId(), fechaAgendar, turno);

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // PROVEEDOR: CONTRAPROPONER TIER
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO contraproponer(Long mudanzaId, String proveedorFirebaseUid, ContrapropuestaMudanzaDTO dto) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getEstado().equals(MudanzaEstado.RESERVADO)) {
            throw new RuntimeException("La mudanza no está disponible para contraproponer");
        }

        if (dto.getTierSugeridoId() == null && dto.getFechaSugerida() == null) {
            throw new RuntimeException("Debés sugerir un cambio de plan, fecha, o ambos");
        }

        mudanza.setProveedor(proveedor);
        mudanza.setMotivoContrapropuesta(dto.getMotivo());
        mudanza.setTurno(dto.getTurno());

        StringBuilder mensajeParts = new StringBuilder();

        // Contrapropuesta de tier
        if (dto.getTierSugeridoId() != null) {
            MudanzaTier tierSugerido = mudanzaTierRepository.findById(dto.getTierSugeridoId())
                    .orElseThrow(() -> new RuntimeException("Tier sugerido no encontrado"));

            if (tierSugerido.getId().equals(mudanza.getTier().getId())) {
                throw new RuntimeException("El tier sugerido es el mismo que el actual");
            }

            mudanza.setTierOriginal(mudanza.getTier());
            mudanza.setTier(tierSugerido);
            mudanza.setMontoBase(tierSugerido.getPrecioBase());

            mensajeParts.append(String.format("Plan: %s %s (%s)",
                    tierSugerido.getEmoji(), tierSugerido.getNombre(),
                    formatPrecio(tierSugerido.getPrecioBase())));
        }

        // Contrapropuesta de fecha
        if (dto.getFechaSugerida() != null) {
            if (dto.getFechaSugerida().equals(mudanza.getFechaDeseada())) {
                throw new RuntimeException("La fecha sugerida es la misma que la solicitada");
            }

            mudanza.setFechaOriginal(mudanza.getFechaDeseada());
            mudanza.setFechaDeseada(dto.getFechaSugerida());

            if (mensajeParts.length() > 0) mensajeParts.append(". ");
            mensajeParts.append("Fecha: ").append(dto.getFechaSugerida());
        }

        mudanza.setEstado(MudanzaEstado.CONTRAPROPUESTO);
        mudanza = mudanzaRepository.save(mudanza);

        String mensaje = String.format("Fletes Bay sugiere cambios: %s. Motivo: %s",
                mensajeParts, dto.getMotivo());

        notificacionService.enviarNotificacion(
                mudanza.getCliente().getFirebaseUid(),
                "MUDANZA_CONTRAPROPUESTA",
                "Cambio Sugerido",
                mensaje,
                mudanza.getId(),
                "/cliente/mudanza/" + mudanza.getId()
        );

        logger.info("Mudanza {} contrapropuesta - {}", mudanza.getId(), mensajeParts);

        return mapToDTO(mudanza);
    }

    private String formatPrecio(Double precio) {
        return String.format("$%,.0f", precio);
    }

    // ════════════════════════════════════════════
    // CLIENTE: ACEPTAR CONTRAPROPUESTA
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO aceptarContrapropuesta(Long mudanzaId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!mudanza.getEstado().equals(MudanzaEstado.CONTRAPROPUESTO)) {
            throw new RuntimeException("La mudanza no tiene una contrapropuesta activa");
        }

        // Validar que el turno esté libre para la fecha
        LocalDate fechaAgendar = mudanza.getFechaDeseada();
        MudanzaTurno turno = mudanza.getTurno();
        boolean turnoOcupado = mudanzaRepository.existsByFechaConfirmadaAndTurnoAndEstadoNotIn(
                fechaAgendar, turno, List.of(MudanzaEstado.CANCELADO, MudanzaEstado.COMPLETADO));
        if (turnoOcupado) {
            String turnoLabel = turno == MudanzaTurno.PRIMERO ? "1er turno (6:30hs)" : "2do turno (~11:00hs)";
            throw new RuntimeException("El " + turnoLabel + " del " + fechaAgendar + " ya no está disponible.");
        }

        mudanza.setEstado(MudanzaEstado.ACEPTADO);
        mudanza.setFechaConfirmada(fechaAgendar);
        mudanza.setAcceptedAt(LocalDateTime.now());
        mudanza = mudanzaRepository.save(mudanza);

        // Notificar proveedor
        notificacionService.enviarNotificacion(
                mudanza.getProveedor().getFirebaseUid(),
                "MUDANZA_CONTRAPROPUESTA_ACEPTADA",
                "Contrapropuesta Aceptada",
                cliente.getNombre() + " aceptó los cambios. Agendada para el " + fechaAgendar,
                mudanza.getId(),
                "/proveedor/mudanza/" + mudanza.getId()
        );

        logger.info("Mudanza {} contrapropuesta aceptada - Agendada: {} Turno: {}", mudanza.getId(), fechaAgendar, turno);

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // CLIENTE: RECHAZAR CONTRAPROPUESTA (→ CANCELADO + reembolso)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO rechazarContrapropuesta(Long mudanzaId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!mudanza.getEstado().equals(MudanzaEstado.CONTRAPROPUESTO)) {
            throw new RuntimeException("La mudanza no tiene una contrapropuesta activa");
        }

        mudanza.setEstado(MudanzaEstado.CANCELADO);
        mudanza.setCancelledAt(LocalDateTime.now());
        mudanza.setMotivoCancelacion("Cliente rechazó contrapropuesta de tier");
        mudanza = mudanzaRepository.save(mudanza);

        // Notificar proveedor
        notificacionService.enviarNotificacion(
                mudanza.getProveedor().getFirebaseUid(),
                "MUDANZA_CONTRAPROPUESTA_RECHAZADA",
                "Contrapropuesta Rechazada",
                cliente.getNombre() + " rechazó el cambio de plan. Mudanza cancelada.",
                mudanza.getId(),
                "/proveedor/mudanzas"
        );

        logger.info("Mudanza {} contrapropuesta rechazada → cancelada", mudanza.getId());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // FASE 3: INICIAR TRABAJO (Proveedor)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO iniciarMudanza(Long mudanzaId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getEstado().equals(MudanzaEstado.ACEPTADO)) {
            throw new RuntimeException("La mudanza no está lista para iniciar");
        }

        if (!mudanza.getProveedor().getId().equals(proveedor.getId())) {
            throw new RuntimeException("No autorizado");
        }

        mudanza.setEstado(MudanzaEstado.EN_CURSO);
        mudanza.setIniciadoAt(LocalDateTime.now());
        mudanza = mudanzaRepository.save(mudanza);

        // Notificar al cliente
        notificacionService.enviarNotificacion(
                mudanza.getCliente().getFirebaseUid(),
                "MUDANZA_INICIADA",
                "Mudanza en Curso",
                "Fletes Bay inició tu mudanza. El cronómetro está corriendo.",
                mudanza.getId(),
                "/cliente/mudanza/" + mudanza.getId()
        );

        logger.info("Mudanza {} iniciada - Cronómetro activado", mudanza.getId());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // FASE 3: FINALIZAR TRABAJO (Proveedor)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO finalizarMudanza(Long mudanzaId, String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getEstado().equals(MudanzaEstado.EN_CURSO)) {
            throw new RuntimeException("La mudanza no está en curso");
        }

        if (!mudanza.getProveedor().getId().equals(proveedor.getId())) {
            throw new RuntimeException("No autorizado");
        }

        LocalDateTime ahora = LocalDateTime.now();
        mudanza.setFinalizadoAt(ahora);

        // ── Cálculo de tiempo y costos ──
        long minutosReales = Duration.between(mudanza.getIniciadoAt(), ahora).toMinutes();
        // Aplicar ratio de testing
        long minutosServicio = Math.round(minutosReales * ratioTiempo);

        mudanza.setDuracionRealMinutos((int) minutosServicio);

        MudanzaTier tier = mudanza.getTier();
        int minutosIncluidos = tier.getMinutosIncluidos();

        if (minutosServicio > minutosIncluidos) {
            // Hay excedente
            long minutosExtra = minutosServicio - minutosIncluidos;
            int bloques = (int) Math.ceil((double) minutosExtra / 30.0);
            double montoExtra = bloques * tier.getPrecioBloque30Min();

            mudanza.setBloquesExtra(bloques);
            mudanza.setMontoExtra(montoExtra);
            mudanza.setMontoFinal(mudanza.getMontoBase() + montoExtra);
            mudanza.setEstado(MudanzaEstado.PENDIENTE_PAGO_EXTRA);
        } else {
            // Dentro del mínimo
            mudanza.setBloquesExtra(0);
            mudanza.setMontoExtra(0.0);
            mudanza.setMontoFinal(mudanza.getMontoBase());
            mudanza.setEstado(MudanzaEstado.FINALIZADO);
        }

        // Calcular comisión y neto proveedor
        double comision = mudanza.getMontoFinal() * (mudanza.getComisionPorcentaje() / 100.0);
        mudanza.setComisionMonto(comision);
        mudanza.setMontoProveedor(mudanza.getMontoFinal() - comision);

        mudanza = mudanzaRepository.save(mudanza);

        // Notificar al cliente
        String mensajeCliente;
        if (mudanza.getEstado().equals(MudanzaEstado.PENDIENTE_PAGO_EXTRA)) {
            mensajeCliente = String.format(
                    "Tu mudanza finalizó. Duración: %d min de servicio. Hay un extra de $%,.0f por pagar.",
                    minutosServicio, mudanza.getMontoExtra()
            );
        } else {
            mensajeCliente = String.format(
                    "Tu mudanza finalizó. Duración: %d min de servicio. Costo total: $%,.0f",
                    minutosServicio, mudanza.getMontoFinal()
            );
        }

        notificacionService.enviarNotificacion(
                mudanza.getCliente().getFirebaseUid(),
                "MUDANZA_FINALIZADA",
                "Mudanza Finalizada",
                mensajeCliente,
                mudanza.getId(),
                "/cliente/mudanza/" + mudanza.getId()
        );

        logger.info("Mudanza {} finalizada - Duración real: {} min, Servicio: {} min, Extra: {}, Monto final: ${}",
                mudanza.getId(), minutosReales, minutosServicio,
                mudanza.getMontoExtra(), mudanza.getMontoFinal());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // FASE 4: PAGAR EXTRA (Cliente)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO pagarExtra(Long mudanzaId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!mudanza.getEstado().equals(MudanzaEstado.PENDIENTE_PAGO_EXTRA)) {
            throw new RuntimeException("No hay pago extra pendiente");
        }

        // Acá en el futuro se integra MercadoPago
        // Por ahora simplemente avanzamos el estado
        mudanza.setEstado(MudanzaEstado.FINALIZADO);
        mudanza = mudanzaRepository.save(mudanza);

        logger.info("Mudanza {} - Extra de ${} pagado por cliente", mudanza.getId(), mudanza.getMontoExtra());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // FASE 4: COMPLETAR / CALIFICAR (Cliente)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO completarMudanza(Long mudanzaId, String clienteFirebaseUid) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!mudanza.getEstado().equals(MudanzaEstado.FINALIZADO)) {
            throw new RuntimeException("La mudanza no está finalizada");
        }

        mudanza.setEstado(MudanzaEstado.COMPLETADO);
        mudanza.setCompletedAt(LocalDateTime.now());
        mudanza = mudanzaRepository.save(mudanza);

        // Notificar proveedor
        notificacionService.enviarNotificacion(
                mudanza.getProveedor().getFirebaseUid(),
                "MUDANZA_COMPLETADA",
                "Mudanza Completada",
                String.format("Mudanza completada. Neto: $%,.0f", mudanza.getMontoProveedor()),
                mudanza.getId(),
                "/proveedor/mudanza/" + mudanza.getId()
        );

        logger.info("Mudanza {} completada - Final: ${}, Comisión: ${}, Proveedor: ${}",
                mudanza.getId(), mudanza.getMontoFinal(),
                mudanza.getComisionMonto(), mudanza.getMontoProveedor());

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // CANCELAR (Cliente - solo en PENDIENTE o RESERVADO)
    // ════════════════════════════════════════════

    @Transactional
    public MudanzaResponseDTO cancelarMudanza(Long mudanzaId, String clienteFirebaseUid, String motivo) {
        User cliente = userRepository.findByFirebaseUid(clienteFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));

        Mudanza mudanza = mudanzaRepository.findById(mudanzaId)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));

        if (!mudanza.getCliente().getId().equals(cliente.getId())) {
            throw new RuntimeException("No autorizado");
        }

        if (!mudanza.getEstado().equals(MudanzaEstado.PENDIENTE) &&
                !mudanza.getEstado().equals(MudanzaEstado.RESERVADO)) {
            throw new RuntimeException("Solo se pueden cancelar mudanzas pendientes o reservadas");
        }

        mudanza.setEstado(MudanzaEstado.CANCELADO);
        mudanza.setCancelledAt(LocalDateTime.now());
        mudanza.setMotivoCancelacion(motivo);
        mudanza = mudanzaRepository.save(mudanza);

        logger.info("Mudanza {} cancelada por cliente - Motivo: {}", mudanza.getId(), motivo);

        return mapToDTO(mudanza);
    }

    // ════════════════════════════════════════════
    // QUERIES
    // ════════════════════════════════════════════

    public MudanzaResponseDTO getMudanzaById(Long id) {
        Mudanza mudanza = mudanzaRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Mudanza no encontrada"));
        return mapToDTO(mudanza);
    }

    public List<MudanzaResponseDTO> getMudanzasByCliente(String clienteFirebaseUid) {
        return mudanzaRepository.findByClienteFirebaseUidOrderByCreatedAtDesc(clienteFirebaseUid)
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public List<MudanzaResponseDTO> getMudanzasPendientesProveedor() {
        // Por ahora devuelve todas las RESERVADO (para Ricky Bay)
        return mudanzaRepository.findByEstadoOrderByCreatedAtAsc(MudanzaEstado.RESERVADO)
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public MudanzaResponseDTO getMudanzaActivaProveedor(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        // Buscar mudanza en curso o aceptada
        List<Mudanza> activas = mudanzaRepository.findByProveedorIdAndEstadoIn(
                proveedor.getId(),
                List.of(MudanzaEstado.ACEPTADO, MudanzaEstado.EN_CURSO, MudanzaEstado.FINALIZADO, MudanzaEstado.PENDIENTE_PAGO_EXTRA)
        );
        if (activas.isEmpty()) return null;
        return mapToDTO(activas.get(0));
    }

    public List<MudanzaResponseDTO> getMudanzasCompletadasProveedor(String proveedorFirebaseUid) {
        User proveedor = userRepository.findByFirebaseUid(proveedorFirebaseUid)
                .orElseThrow(() -> new RuntimeException("Proveedor no encontrado"));

        return mudanzaRepository.findByProveedorIdAndEstadoOrderByCompletedAtDesc(
                        proveedor.getId(), MudanzaEstado.COMPLETADO)
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    // ════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════

    private void notificarProveedorFletes(Mudanza mudanza) {
        // Por ahora busca proveedores con oficio de Mudanzas/Fletes
        // En el futuro puede ser asignación directa a Ricky Bay
        // Por ahora notificamos a todos los proveedores de fletes
        List<User> proveedoresFletes = userRepository.findProveedoresFletes();

        if (proveedoresFletes.isEmpty()) {
            logger.warn("No hay proveedores de fletes disponibles para mudanza {}", mudanza.getId());
            return;
        }

        for (User proveedor : proveedoresFletes) {
            notificacionService.enviarNotificacion(
                    proveedor.getFirebaseUid(),
                    "NUEVA_MUDANZA",
                    "Nueva Solicitud de Mudanza",
                    "Nueva mudanza " + mudanza.getTier().getEmoji() + " " + mudanza.getTier().getNombre() +
                            " de " + mudanza.getDireccionOrigen() + " a " + mudanza.getDireccionDestino(),
                    mudanza.getId(),
                    "/proveedor/mudanza/" + mudanza.getId()
            );
        }
    }

    private MudanzaResponseDTO mapToDTO(Mudanza m) {
        MudanzaResponseDTO dto = new MudanzaResponseDTO();
        dto.setId(m.getId());

        // Cliente
        dto.setClienteId(m.getCliente().getId());
        dto.setClienteNombre(m.getCliente().getNombre());

        // Proveedor
        if (m.getProveedor() != null) {
            dto.setProveedorId(m.getProveedor().getId());
            dto.setProveedorNombre(m.getProveedor().getNombre());
        }

        // Tier actual
        dto.setTierId(m.getTier().getId());
        dto.setTierNombre(m.getTier().getNombre());
        dto.setTierEmoji(m.getTier().getEmoji());

        // Tier original
        if (m.getTierOriginal() != null) {
            dto.setTierOriginalId(m.getTierOriginal().getId());
            dto.setTierOriginalNombre(m.getTierOriginal().getNombre());
        }

        // Estado
        dto.setEstado(m.getEstado());

        // Ubicaciones
        dto.setDireccionOrigen(m.getDireccionOrigen());
        dto.setLatitudOrigen(m.getLatitudOrigen());
        dto.setLongitudOrigen(m.getLongitudOrigen());
        dto.setDireccionDestino(m.getDireccionDestino());
        dto.setLatitudDestino(m.getLatitudDestino());
        dto.setLongitudDestino(m.getLongitudDestino());

        // Accesibilidad
        dto.setPisos(m.getPisos());
        dto.setTieneAscensor(m.getTieneAscensor());
        dto.setCantidadAmbientes(m.getCantidadAmbientes());

        // Fecha y turno
        dto.setFechaDeseada(m.getFechaDeseada());
        dto.setFechaConfirmada(m.getFechaConfirmada());
        dto.setFechaOriginal(m.getFechaOriginal());
        dto.setTurno(m.getTurno());

        // Media
        dto.setFotos(m.getFotos());
        dto.setNotasCliente(m.getNotasCliente());

        // Montos
        dto.setMontoBase(m.getMontoBase());
        dto.setMontoFinal(m.getMontoFinal());
        dto.setMontoExtra(m.getMontoExtra());
        dto.setComisionPorcentaje(m.getComisionPorcentaje());
        dto.setComisionMonto(m.getComisionMonto());
        dto.setMontoProveedor(m.getMontoProveedor());

        // Contrapropuesta
        dto.setMotivoContrapropuesta(m.getMotivoContrapropuesta());

        // Cronómetro
        dto.setIniciadoAt(m.getIniciadoAt());
        dto.setFinalizadoAt(m.getFinalizadoAt());
        dto.setDuracionRealMinutos(m.getDuracionRealMinutos());
        dto.setBloquesExtra(m.getBloquesExtra());

        // Timestamps
        dto.setCreatedAt(m.getCreatedAt());
        dto.setReservadoAt(m.getReservadoAt());
        dto.setAcceptedAt(m.getAcceptedAt());
        dto.setCompletedAt(m.getCompletedAt());
        dto.setCancelledAt(m.getCancelledAt());
        dto.setMotivoCancelacion(m.getMotivoCancelacion());

        return dto;
    }

    private MudanzaTierResponseDTO mapTierToDTO(MudanzaTier tier) {
        MudanzaTierResponseDTO dto = new MudanzaTierResponseDTO();
        dto.setId(tier.getId());
        dto.setNombre(tier.getNombre());
        dto.setEmoji(tier.getEmoji());
        dto.setPrecioBase(tier.getPrecioBase());
        dto.setMinutosIncluidos(tier.getMinutosIncluidos());
        dto.setPrecioBloque30Min(tier.getPrecioBloque30Min());
        dto.setDescripcion(tier.getDescripcion());
        dto.setDescripcionCompleta(tier.getDescripcionCompleta());
        dto.setOrden(tier.getOrden());
        return dto;
    }
}
