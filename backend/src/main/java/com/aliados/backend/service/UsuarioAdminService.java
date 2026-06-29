package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Service
public class UsuarioAdminService {

    private final UserRepository userRepository;

    public UsuarioAdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<User> buscar(String q, UserRole role) {
        // "" (no null) cuando está vacío: un :q null en LOWER(CONCAT(...)) hace que
        // Postgres infiera bytea ("function lower(bytea) does not exist"). Con "" el
        // parámetro se tipa como texto y el branch `:q = ''` matchea todo.
        String query = (q == null) ? "" : q.trim();
        return userRepository.searchUsuarios(query, role);
    }

    @Transactional
    public User actualizarActivo(Long id, boolean activo) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Usuario no encontrado: " + id));
        if (user.getRole() == UserRole.ADMIN) {
            throw new IllegalArgumentException("No se puede suspender un admin");
        }
        user.setActivo(activo);
        return userRepository.save(user);
    }
}
