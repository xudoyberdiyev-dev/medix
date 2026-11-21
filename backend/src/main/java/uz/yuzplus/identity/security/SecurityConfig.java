package uz.yuzplus.identity.security;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
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
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.servlet.HandlerExceptionResolver;
import uz.yuzplus.shared.error.YuzplusException;

/**
 * Xavfsizlik (SPEC 13): sessiya httpOnly cookie'da (Spring Session JDBC), CSRF — SPA uchun cookie + sarlavha,
 * har API metodida {@code @PreAuthorize}. Xatolar ProblemDetail ko'rinishida (GlobalExceptionHandler orqali).
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfig {

    static final String SESSION_COOKIE = "YUZPLUS_SESSION";
    static final String MOBILE_LOGIN = "/api/mobile/auth/login";
    static final String MOBILE_PASSWORD = "/api/mobile/auth/password";

    @Bean
    SecurityFilterChain api(
            HttpSecurity http,
            SecurityContextRepository contextRepository,
            MobileTokens mobileTokens,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver)
            throws Exception {
        http.securityContext(c -> c.securityContextRepository(contextRepository))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .csrf(csrf -> csrf.spa()
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // Mobil ilova: cookie yoʻq, token sarlavhada — CSRF xavfi yoʻq (brauzer bu sarlavhani oʻzi qoʻshmaydi)
                        .ignoringRequestMatchers(req -> MobileTokens.bearer(req.getHeader("Authorization")) != null)
                        .ignoringRequestMatchers(MOBILE_LOGIN, MOBILE_PASSWORD))
                // P3: standart sarlavhalar (nosniff, X-Frame-Options DENY, HSTS, Cache-Control) + Referrer-Policy
                .headers(h -> h.referrerPolicy(r -> r.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)))
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .logout(l -> l.logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler((req, res, auth) -> res.setStatus(204))
                        .deleteCookies(SESSION_COOKIE))
                .authorizeHttpRequests(a -> a.requestMatchers("/api/auth/login", "/api/auth/csrf", "/api/auth/login-info", MOBILE_LOGIN, MOBILE_PASSWORD)
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
                                resolver.resolveException(req, res, null, YuzplusException.unauthorized("auth.unauthorized")))
                        .accessDeniedHandler((req, res, ex) -> resolver.resolveException(req, res, null,
                                ex instanceof CsrfException
                                        ? YuzplusException.forbidden("auth.csrf")
                                        : YuzplusException.forbidden("auth.forbidden"))))
                .addFilterBefore(new MobileTokenFilter(mobileTokens, resolver), BasicAuthenticationFilter.class)
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

    /** Sessiya cookie'si: httpOnly, Secure (lokal http'da {@code YUZPLUS_COOKIE_SECURE=false}), SameSite=Lax. */
    @Bean
    CookieSerializer cookieSerializer(@Value("${yuzplus.session.cookie-secure:true}") boolean secure) {
        var serializer = new DefaultCookieSerializer();
        serializer.setCookieName(SESSION_COOKIE);
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setUseSecureCookie(secure);
        serializer.setSameSite("Lax");
        return serializer;
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
