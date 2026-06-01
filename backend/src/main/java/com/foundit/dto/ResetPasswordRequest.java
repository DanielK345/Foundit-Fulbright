package com.foundit.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ResetPasswordRequest {
    private String email;
    private String code;

    @NotBlank
    @Size(min = 6)
    private String newPassword;
}
