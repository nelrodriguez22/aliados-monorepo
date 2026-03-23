package com.aliados.backend.service;

import com.aliados.backend.dto.RegisterDTO;
import com.aliados.backend.dto.UserResponseDTO;
import com.aliados.backend.dto.UserStatusDTO;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

@Service
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

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Transactional
    public UserResponseDTO registerUser(RegisterDTO dto) {
        // Verificar que no exista el usuario
        if (userRepository.existsByFirebaseUid(dto.getFirebaseUid())) {
            throw new RuntimeException("Usuario ya registrado con este Firebase UID");
        }

        if (userRepository.existsByEmail(dto.getEmail())) {
            throw new RuntimeException("Usuario ya registrado con este email");
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
        user.setLocalidad(dto.getLocalidad() != null ? dto.getLocalidad() : "Rosario");
        user.setMatricula(dto.getMatricula());

        if (dto.getOficioId() != null) {
            oficioRepository.findById(dto.getOficioId()).ifPresent(user::setOficio);
        }

        user = userRepository.save(user);

        // Enviar email de verificación personalizado via SendGrid
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

            emailService.sendVerificationEmail(user.getEmail(), user.getNombre(), customLink);
            logger.info("✅ Email de verificación enviado a {}", user.getEmail());
        } catch (FirebaseAuthException e) {
            logger.error("❌ Error generando link de verificación para {}: {}",
                    user.getEmail(), e.getMessage());
        }
    }

    public UserResponseDTO getUserByFirebaseUid(String firebaseUid) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        return mapToDTO(user);
    }

    // NUEVOS MÉTODOS PARA WEBSOCKET

    @Transactional
    public void updateUserStatus(String firebaseUid, UserStatus status) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

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

    public void saveFcmToken(String firebaseUid, String fcmToken) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        user.setFcmToken(fcmToken);
        userRepository.save(user);
    }

    public UserResponseDTO updateProfile(String firebaseUid, Map<String, String> body) {
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        if (body.containsKey("nombre")) user.setNombre(body.get("nombre"));
        if (body.containsKey("telefono")) user.setTelefono(body.get("telefono"));
        if (body.containsKey("localidad")) user.setLocalidad(body.get("localidad"));

        userRepository.save(user);
        return mapToDTO(user);
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
        dto.setFirebaseUid(user.getFirebaseUid());
        dto.setEmail(user.getEmail());
        dto.setRole(user.getRole());
        dto.setNombre(user.getNombre());
        dto.setTelefono(user.getTelefono());
        dto.setFotoPerfil(user.getFotoPerfil());
        dto.setActivo(user.getActivo());
        dto.setStatus(user.getStatus());          // NUEVO
        dto.setLastSeenAt(user.getLastSeenAt());  // NUEVO
        dto.setCreatedAt(user.getCreatedAt());
        dto.setUpdatedAt(user.getUpdatedAt());
        dto.setLocalidad(user.getLocalidad());
        dto.setOficio(user.getOficio());
        if (user.getRole() == UserRole.PROVIDER) {
            Double promedio = calificacionRepository.getPromedioByProveedorId(user.getId());
            Long cantidad = calificacionRepository.getCantidadByProveedorId(user.getId());
            dto.setPromedioCalificacion(promedio != null ? promedio : 0.0);
            dto.setCantidadCalificaciones(cantidad != null ? cantidad : 0L);
            Long completados = trabajoRepository.countByProveedorIdAndEstado(user.getId(), TrabajoEstado.COMPLETADO);
            dto.setTotalTrabajosCompletados(completados != null ? completados : 0L);
        }
        return dto;
    }


}