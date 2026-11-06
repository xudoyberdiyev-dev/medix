package uz.medix.identity.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record LoginRequest(
        @NotBlank(message = "{validation.required}") @Size(max = 64) String login,
        @NotBlank(message = "{validation.required}") @Size(max = 128) String password) {}
