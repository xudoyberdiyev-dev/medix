package uz.medix.identity.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Birinchi ishga tushirish (SPEC 2): xodimlar yo'q bo'lsa, CEO hisobi env'dan yaratiladi
 * ({@code MEDIX_BOOTSTRAP_LOGIN}, {@code MEDIX_BOOTSTRAP_PASSWORD}). Birinchi kirishda parol almashtiriladi.
 * Parol kodda yoki repoda saqlanmaydi.
 */
@Component
class BootstrapAccount implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAccount.class);

    private final EmployeeAccounts accounts;
    private final PasswordEncoder encoder;
    private final String login;
    private final String password;

    BootstrapAccount(
            EmployeeAccounts accounts,
            PasswordEncoder encoder,
            @Value("${medix.bootstrap.login:}") String login,
            @Value("${medix.bootstrap.password:}") String password) {
        this.accounts = accounts;
        this.encoder = encoder;
        this.login = login;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (accounts.count() > 0) {
            return;
        }
        if (login.isBlank() || password.isBlank()) {
            log.warn("Xodimlar yo'q va MEDIX_BOOTSTRAP_LOGIN/MEDIX_BOOTSTRAP_PASSWORD berilmagan — tizimga kirib bo'lmaydi.");
            return;
        }
        long id = accounts.create(AuthService.normalizeLogin(login), "CEO", accounts.roleId("DIRECTOR"), encoder.encode(password));
        log.info("Boshlang'ich CEO hisobi yaratildi (id={}). Birinchi kirishda parol almashtiriladi.", id);
    }
}
