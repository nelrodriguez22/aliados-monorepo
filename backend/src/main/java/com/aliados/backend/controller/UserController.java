package com.aliados.backend.controller;

import com.aliados.backend.dto.RegisterDTO;
import com.aliados.backend.dto.UserResponseDTO;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.service.TrabajoService;
import com.aliados.backend.service.UserService;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final Logger logger = LoggerFactory.getLogger(UserController.class);

    @Autowired
    private UserService userService;

    @Autowired
    private TrabajoService trabajoService;

    @Autowired
    private UserRepository userRepository;

    @PostMapping("/register")
    public ResponseEntity<?> register(
            @Valid @RequestBody RegisterDTO dto,
            @RequestHeader("Authorization") String authHeader) {
        try {
            String token = authHeader.replace("Bearer ", "");
            FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(token);

            if (!decodedToken.getUid().equals(dto.getFirebaseUid())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body("Token no corresponde al usuario");
            }

            UserResponseDTO user = userService.registerUser(dto);
            return ResponseEntity.status(HttpStatus.CREATED).body(user);
        } catch (FirebaseAuthException e) {
            // SEC-4: no exponer el detalle interno de Firebase al cliente; se loguea server-side.
            logger.warn("Registro con token inválido: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Token inválido");
        }
        // ConflictException→409, NotFoundException→404 y RuntimeException→400
        // los maneja GlobalExceptionHandler (no los atrapamos acá).
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<?> resendVerification(@RequestBody Map<String, String> body) {
        // Respuesta genérica e idéntica siempre (anti-enumeración): no revela si el
        // email existe ni si ya estaba verificado. El reenvío real ocurre en el service.
        userService.resendVerification(body.get("email"));
        return ResponseEntity.ok(Map.of(
                "message", "Si el email está registrado y sin verificar, te reenviamos el enlace de verificación."));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        // Respuesta genérica e idéntica siempre (anti-enumeración): no revela si el
        // email existe. El envío real (con su cooldown) ocurre en el service.
        userService.forgotPassword(body.get("email"));
        return ResponseEntity.ok(Map.of(
                "message", "Si el email está registrado, te enviamos un enlace para restablecer tu contraseña."));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponseDTO> getCurrentUser(Authentication authentication) {
        String uid = authentication.getName();
        // 200 siempre para autenticados: si aún no existe en la DB (pre-onboarding),
        // devolvemos { registered:false } en vez de 404 (evita el 404 en la consola).
        UserResponseDTO body = userService.findUserByFirebaseUid(uid)
                .orElseGet(() -> {
                    UserResponseDTO nuevo = new UserResponseDTO();
                    nuevo.setRegistered(false);
                    return nuevo;
                });
        return ResponseEntity.ok(body);
    }

    @PatchMapping("/me/status")
    public ResponseEntity<?> updateStatus(
            @RequestBody Map<String, String> body,
            Authentication authentication) {
        String firebaseUid = authentication.getName();
        String statusStr = body.get("status");

        if (statusStr == null) {
            return ResponseEntity.badRequest().body("Status requerido");
        }

        UserStatus status = UserStatus.valueOf(statusStr);
        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        userService.updateUserStatus(firebaseUid, status);

        if (user.getRole() == UserRole.PROVIDER && status == UserStatus.ONLINE) {
            trabajoService.asignarTrabajosAProveedorQueSeConecta(user);
            logger.debug("✅ Trabajos pendientes asignados a proveedor {}", user.getNombre());
        }

        return ResponseEntity.ok().build();
    }

    @PostMapping("/fcm-token")
    public ResponseEntity<?> saveFcmToken(@RequestBody Map<String, String> body, Authentication authentication) {
        String uid = authentication.getName();
        userService.saveFcmToken(uid, body.get("token"));
        return ResponseEntity.ok().build();
    }

    @PutMapping("/me")
    public ResponseEntity<UserResponseDTO> updateProfile(@RequestBody Map<String, String> body, Authentication authentication) {
        String uid = authentication.getName();
        UserResponseDTO updated = userService.updateProfile(uid, body);
        return ResponseEntity.ok(updated);
    }
}
