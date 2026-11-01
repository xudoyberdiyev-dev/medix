package uz.medix.identity.security;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.web.servlet.HandlerExceptionResolver;
import uz.medix.shared.error.MedixException;

/**
 * Xavfsizlik (SPEC 13): sessiya httpOnly cookie'da (Spring Session JDBC), CSRF — SPA uchun cookie + sarlavha,
 * har API metodida {@code @PreAuthorize}. Xatolar ProblemDetail ko'rinishida (GlobalExceptionHandler orqali).
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfig {

    @Bean
    SecurityFilterChain api(
            HttpSecurity http,
            SecurityContextRepository contextRepository,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver)
            throws Exception {
        http.securityContext(c -> c.securityContextRepository(contextRepository))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .csrf(csrf -> csrf.spa().csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .logout(l -> l.logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler((req, res, auth) -> res.setStatus(204))
                        .deleteCookies("MEDIX_SESSION"))
                .authorizeHttpRequests(a -> a.requestMatchers("/api/auth/login", "/api/auth/csrf")
                        .permitAll()
                        .requestMatchers("/actuator/health/**", "/actuator/info")
                        .permitAll()
                        .requestMatchers("/api/openapi/**", "/api/docs/**", "/swagger-ui/**")
                        .permitAll()
                        .requestMatchers("/error")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) ->
                                resolver.resolveException(req, res, null, MedixException.unauthorized("auth.unauthorized")))
                        .accessDeniedHandler((req, res, ex) -> resolver.resolveException(req, res, null,
                                ex instanceof CsrfException
                                        ? MedixException.forbidden("auth.csrf")
                                        : MedixException.forbidden("auth.forbidden"))))
                .addFilterAfter(new PasswordChangeRequiredFilter(resolver), BasicAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new DelegatingSecurityContextRepository(
                new RequestAttributeSecurityContextRepository(), new HttpSessionSecurityContextRepository());
    }

    /**
     * Kirish {@link AuthService} orqali; bu bean faqat Spring Boot'ning xotiradagi standart foydalanuvchisini
     * (tasodifiy parol bilan) o'chirish uchun.
     */
    @Bean
    UserDetailsService noFormLoginUsers() {
        return username -> {
            throw new UsernameNotFoundException(username);
        };
    }

    @Bean
    SessionAuthenticationStrategy sessionAuthenticationStrategy() {
        return new ChangeSessionIdAuthenticationStrategy();
    }

    /** {@code {bcrypt}...} — keyinchalik algoritmni almashtirish mumkin, eski xeshlar ishlayveradi. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
