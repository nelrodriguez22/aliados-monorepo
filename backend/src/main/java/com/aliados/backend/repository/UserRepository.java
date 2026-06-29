package com.aliados.backend.repository;

import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByFirebaseUid(String firebaseUid);

    Optional<User> findByEmail(String email);

    boolean existsByFirebaseUid(String firebaseUid);

    boolean existsByEmail(String email);

    @Query("SELECT u FROM User u WHERE u.role = 'PROVIDER' AND u.status IN ('ONLINE', 'BUSY') AND u.localidad = :localidad AND u.oficio.id = :oficioId AND (SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = u.id AND t.estado IN ('EN_CURSO', 'EN_COLA')) < :maxTrabajos")
    List<User> findProveedoresDisponibles(@Param("localidad") String localidad, @Param("oficioId") Long oficioId, @Param("maxTrabajos") int maxTrabajos);

    long countByRole(UserRole role);

    long countByRoleAndStatus(UserRole role, UserStatus status);

    @Query("SELECT u FROM User u WHERE u.role = :role AND u.status IN :statuses ORDER BY u.lastSeenAt DESC")
    List<User> findByRoleAndStatusIn(@Param("role") UserRole role, @Param("statuses") List<UserStatus> statuses);

    // Proveedores de fletes/mudanzas (busca por nombre de oficio).
    // Los parentesis son necesarios: sin ellos AND precede a OR y la rama del LIKE '%lete%'
    // traeria a cualquier usuario (incluso clientes o inactivos) cuyo oficio contenga "lete".
    @Query("SELECT u FROM User u WHERE u.role = 'PROVIDER' AND u.activo = true AND (u.oficio.nombre LIKE '%udanza%' OR u.oficio.nombre LIKE '%lete%')")
    List<User> findProveedoresFletes();

    // Limpia el token FCM de un usuario cuando FCM lo reporta muerto (UNREGISTERED/INVALID_ARGUMENT).
    // @Transactional propio porque se llama desde un método @Async (sin tx del caller).
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.fcmToken = null WHERE u.id = :id")
    void clearFcmToken(@Param("id") Long id);

    List<User> findByRoleInAndActivoTrue(Collection<UserRole> roles);

    @Query("SELECT u FROM User u WHERE " +
           "(:q = '' OR LOWER(u.nombre) LIKE LOWER(CONCAT('%', :q, '%')) " +
           " OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))) " +
           "AND (:role IS NULL OR u.role = :role) " +
           "AND u.role <> com.aliados.backend.entity.UserRole.ADMIN " +
           "ORDER BY u.createdAt DESC")
    java.util.List<com.aliados.backend.entity.User> searchUsuarios(
            @org.springframework.data.repository.query.Param("q") String q,
            @org.springframework.data.repository.query.Param("role") com.aliados.backend.entity.UserRole role);
}
