package com.aliados.backend.service;

import com.aliados.backend.dto.OficioResponseDTO;
import com.aliados.backend.dto.RegisterDTO;
import com.aliados.backend.dto.UserResponseDTO;
import com.aliados.backend.dto.UserStatusDTO;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.exception.ConflictException;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.exception.UserNotFoundException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import org.hibernate.Hibernate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Transactional(readOnly = true) // sesión abierta durante el mapeo a DTO (asociaciones LAZY); los writers la sobreescriben con @Transactional
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private CalificacionRepository calificacionRepository;

    @Autowired
    private TrabajoRepository trabajoRepository;

    @Autowired
    private OficioRepository oficioRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private CloudinaryService cloudinaryService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    // Anti-abuso del reenvío de verificación: última vez que se reenvió por email.
    // En memoria (suficiente para una sola instancia); es solo el backstop silencioso,
    // el cooldown visible lo maneja el frontend.
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private final Map<String, Instant> lastResendByEmail = new ConcurrentHashMap<>();

    @Transactional
    public UserResponseDTO registerUser(RegisterDTO dto) {
        // SEC-1: el rol ADMIN nunca se auto-asigna por el registro público. Solo se
        // crea por un camino privilegiado (seed/migración). Rechazamos antes de tocar
        // la BD para no dejar rastro de un intento de escalada.
        if (dto.getRole() == UserRole.ADMIN) {
            throw new ForbiddenException("Rol no permitido en el registro");
        }

        // Verificar que no exista el usuario
        if (userRepository.existsByFirebaseUid(dto.getFirebaseUid())) {
            throw new ConflictException("Usuario ya registrado con este Firebase UID");
        }

        if (userRepository.existsByEmail(dto.getEmail())) {
            throw new ConflictException("Usuario ya registrado con este email");
        }

        // Crear usuario
        User user = new User();
        user.setFirebaseUid(dto.getFirebaseUid());
        user.setEmail(dto.getEmail());
        user.setRole(dto.getRole());
        user.setNombre(dto.getNombre());
        user.setTelefono(dto.getTelefono());
        user.setActivo(true);
        user.setStatus(UserStatus.OFFLINE); // Por defecto offline
        user.setLocalidad(normalizeLocalidad(dto.getLocalidad() != null ? dto.getLocalidad() : "Rosario"));
        user.setMatricula(dto.getMatricula());

        if (dto.getOficioId() != null) {
            oficioRepository.findById(dto.getOficioId()).ifPresent(user::setOficio);
        }

        user = userRepository.save(user);

        // Enviar email de verificación personalizado via Resend
        sendVerificationEmail(user);

        return mapToDTO(user);
    }

    private void sendVerificationEmail(User user) {
        try {
            String verificationLink = FirebaseAuth.getInstance()
                    .generateEmailVerificationLink(user.getEmail());

            // Extraer oobCode del link de Firebase y armar URL propia
            String oobCode = extractParam(verificationLink, "oobCode");
            String apiKey = extractParam(verificationLink, "apiKey");
            String customLink = frontendUrl + "/verificacion-exitosa?mode=verifyEmail&oobCode=" + oobCode + "&apiKey=" + apiKey;

            boolean enviado = emailService.sendVerificationEmail(user.getEmail(), user.getNombre(), customLink);
            if (enviado) {
                logger.debug("✅ Email de verificación enviado a {}", user.getEmail());
            } else {
                logger.error("❌ Resend no aceptó el email de verificación para {} (revisar API key / remitente)", user.getEmail());
            }
        } catch (FirebaseAuthException e) {
            logger.error("❌ Error generando link de verificación para {} (Resend no se llegó a invocar): {}",
                    user.getEmail(), e.getMessage());
        }
    }

    public UserResponseDTO getUserByFirebaseUid(String firebaseUid) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new UserNotFoundException("Usuario no encontrado"));

        return mapToDTO(user);
    }

    /**
     * Variante no-lanzante de {@link #getUserByFirebaseUid}: devuelve Optional vacío
     * cuando el usuario no existe en la DB (autenticado en Firebase, aún sin registrar).
     * La usa GET /me para responder 200 { registered:false } en vez de 404.
     */
    public Optional<UserResponseDTO> findUserByFirebaseUid(String firebaseUid) {
        return userRepository.findByFirebaseUid(firebaseUid).map(this::mapToDTO);
    }

    /**
     * Reenvía el email de verificación. Pensado para un endpoint público, así que
     * NUNCA lanza ni revela si el email existe / está verificado (anti-enumeración):
     * cualquier resultado termina silencioso. El caller responde siempre genérico.
     */
    public void resendVerification(String rawEmail) {
        if (rawEmail == null || rawEmail.isBlank()) return;
        String email = rawEmail.trim().toLowerCase();

        // Backstop anti-spam: si se reenvió hace menos de RESEND_COOLDOWN, ignorar.
        Instant last = lastResendByEmail.get(email);
        if (last != null && Duration.between(last, Instant.now()).compareTo(RESEND_COOLDOWN) < 0) {
            logger.debug("⏳ Reenvío de verificación ignorado por cooldown para {}", email);
            return;
        }

        try {
            // No reenviar si el email ya está verificado en Firebase.
            UserRecord record = FirebaseAuth.getInstance().getUserByEmail(email);
            if (record.isEmailVerified()) {
                logger.debug("✓ Reenvío omitido: {} ya está verificado", email);
                return;
            }
        } catch (FirebaseAuthException e) {
            // Email inexistente en Firebase (u otro error): no filtrar nada, salir.
            logger.debug("Reenvío de verificación solicitado para email no resoluble en Firebase");
            return;
        }

        // Debe existir también en nuestra DB para reusar el flujo de envío.
        userRepository.findByEmail(email).ifPresent(user -> {
            lastResendByEmail.put(email, Instant.now());
            sendVerificationEmail(user);
            logger.debug("📧 Reenvío de verificación disparado para {}", email);
        });
    }

    // NUEVOS MÉTODOS PARA WEBSOCKET

    @Transactional
    public void updateUserStatus(String firebaseUid, UserStatus status) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        user.setStatus(status);
        user.setLastSeenAt(LocalDateTime.now());
        userRepository.save(user);

        // Broadcast del cambio de estado a todos los clientes suscritos
        UserStatusDTO statusDTO = new UserStatusDTO(
                firebaseUid,
                status,
                LocalDateTime.now()
        );

        messagingTemplate.convertAndSend(
                "/topic/user-status/" + firebaseUid,
                statusDTO
        );
    }

    public User getUserEntityByFirebaseUid(String firebaseUid) {
        return userRepository.findByFirebaseUid(firebaseUid).orElse(null);
    }

    @Transactional
    public void saveFcmToken(String firebaseUid, String fcmToken) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        user.setFcmToken(fcmToken);
        userRepository.save(user);
    }

    @Transactional
    public UserResponseDTO updateProfile(String firebaseUid, Map<String, String> body) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        if (body.containsKey("nombre")) user.setNombre(body.get("nombre"));
        if (body.containsKey("telefono")) user.setTelefono(body.get("telefono"));
        if (body.containsKey("localidad")) user.setLocalidad(normalizeLocalidad(body.get("localidad")));

        if (body.containsKey("fotoPerfil")) {
            String nueva = body.get("fotoPerfil");
            String anterior = user.getFotoPerfil();
            if (anterior != null && !anterior.equals(nueva)) {
                cloudinaryService.borrarUrl(anterior); // borra el avatar viejo
            }
            user.setFotoPerfil(nueva);
        }

        userRepository.save(user);
        return mapToDTO(user);
    }

    // Normaliza la localidad para que el match exacto (=) del query de proveedores sea
    // consistente sin importar cómo la escriba el usuario: trim + Title Case por palabra
    // ("rosario"/"ROSARIO"/" Rosario " → "Rosario"). #17 del informe.
    private static String normalizeLocalidad(String localidad) {
        if (localidad == null) return null;
        String trimmed = localidad.trim();
        if (trimmed.isEmpty()) return null;
        String[] words = trimmed.toLowerCase().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return sb.toString();
    }

    private String extractParam(String url, String param) {
        try {
            String query = url.substring(url.indexOf('?') + 1);
            for (String pair : query.split("&")) {
                String[] parts = pair.split("=", 2);
                if (parts[0].equals(param) && parts.length > 1) {
                    return java.net.URLDecoder.decode(parts[1], "UTF-8");
                }
            }
        } catch (Exception e) {
            logger.error("Error extrayendo parámetro {} de URL: {}", param, e.getMessage());
        }
        return "";
    }

    private UserResponseDTO mapToDTO(User user) {
        UserResponseDTO dto = new UserResponseDTO();
        dto.setId(user.getId());
        dto.setEmail(user.getEmail());
        dto.setRole(user.getRole());
        dto.setNombre(user.getNombre());
        dto.setTelefono(user.getTelefono());
        dto.setFotoPerfil(user.getFotoPerfil());
        dto.setActivo(user.getActivo());
        dto.setStatus(user.getStatus());
        dto.setLastSeenAt(user.getLastSeenAt());
        dto.setLocalidad(user.getLocalidad());
        // Vista liviana: solo id/nombre/icono (sin flags internos del Oficio).
        // unproxy null-safe: clientes no tienen oficio.
        dto.setOficio(OficioResponseDTO.from((Oficio) Hibernate.unproxy(user.getOficio())));
        if (user.getRole() == UserRole.PROVIDER) {
            // #8: denormalizado en `users` (se mantiene al crear calificación) → sin queries.
            dto.setPromedioCalificacion(user.getPromedioCalificacion() != null ? user.getPromedioCalificacion() : 0.0);
            dto.setCantidadCalificaciones(user.getCantidadCalificaciones() != null ? user.getCantidadCalificaciones() : 0L);
            Long completados = trabajoRepository.countByProveedorIdAndEstado(user.getId(), TrabajoEstado.COMPLETADO);
            dto.setTotalTrabajosCompletados(completados != null ? completados : 0L);
        }
        return dto;
    }


}