package uz.medix.identity.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Yangi parol: 8–128 belgi, kamida bitta harf va bitta raqam (prototip «Yangi parol oʻrnating» talablari). */
record ChangePasswordRequest(
        @NotBlank(message = "{validation.required}") String currentPassword,
        @NotBlank(message = "{validation.required}")
                @Size(min = 8, max = 128, message = "{validation.password.length}")
                @Pattern(regexp = "^(?=.*\\p{L})(?=.*\\d).*$", flags = Pattern.Flag.DOTALL, message = "{validation.password.chars}")
                String newPassword) {}
