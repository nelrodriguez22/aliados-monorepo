package com.aliados.backend.repository;

import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByFirebaseUid(String firebaseUid);

    Optional<User> findByEmail(String email);

    boolean existsByFirebaseUid(String firebaseUid);

    boolean existsByEmail(String email);

    @Query("SELECT u FROM User u WHERE u.role = 'PROVIDER' AND u.status IN ('ONLINE', 'BUSY') AND u.localidad = :localidad AND u.oficio.id = :oficioId AND (SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = u.id AND t.estado IN ('EN_CURSO', 'EN_COLA')) < 3")
    List<User> findProveedoresDisponibles(@Param("localidad") String localidad, @Param("oficioId") Long oficioId);

    long countByRole(UserRole role);

    long countByRoleAndStatus(UserRole role, UserStatus status);
}