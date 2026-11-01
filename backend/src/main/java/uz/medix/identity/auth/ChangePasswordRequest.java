package uz.medix.identity.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record ChangePasswordRequest(
        @NotBlank(message = "{validation.required}") String currentPassword,
        @NotBlank(message = "{validation.required}") @Size(min = 8, max = 128, message = "{validation.password.length}")
                String newPassword) {}
