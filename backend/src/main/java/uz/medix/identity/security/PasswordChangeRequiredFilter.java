package uz.medix.identity.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;
import uz.medix.shared.error.MedixException;

/** Birinchi kirishda parol almashtirilmaguncha faqat {@code /api/auth/**} ochiq (SPEC 13). */
class PasswordChangeRequiredFilter extends OncePerRequestFilter {

    private final HandlerExceptionResolver resolver;

    PasswordChangeRequiredFilter(HandlerExceptionResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null
                && auth.getPrincipal() instanceof MedixPrincipal p
                && p.mustChangePassword()
                && request.getRequestURI().startsWith("/api/")
                && !request.getRequestURI().startsWith("/api/auth/")) {
            resolver.resolveException(request, response, null, MedixException.forbidden("auth.passwordChangeRequired"));
            return;
        }
        chain.doFilter(request, response);
    }
}
