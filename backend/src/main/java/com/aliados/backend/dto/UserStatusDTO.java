package com.aliados.backend.dto;

import com.aliados.backend.entity.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class UserStatusDTO {
    private String firebaseUid;
    private UserStatus status;
    private LocalDateTime timestamp;
}
