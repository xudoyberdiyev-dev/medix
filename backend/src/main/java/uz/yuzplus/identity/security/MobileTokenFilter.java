package uz.yuzplus.identity.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;
import uz.yuzplus.shared.error.YuzplusException;

/**
 * {@code Authorization: Bearer <qurilma tokeni>} — haydovchi mobil ilovasi (M2). Sessiya yaratilmaydi: kontekst faqat
 * shu soʻrov uchun. Token yaroqsiz boʻlsa — 401 {@code mobile.tokenInvalid} (ilova login ekraniga qaytadi).
 */
class MobileTokenFilter extends OncePerRequestFilter {

    private final MobileTokens tokens;
    private final HandlerExceptionResolver resolver;

    MobileTokenFilter(MobileTokens tokens, HandlerExceptionResolver resolver) {
        this.tokens = tokens;
        this.resolver = resolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = MobileTokens.bearer(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (token == null) {
            chain.doFilter(request, response);
            return;
        }
        var authentication = tokens.authenticate(token);
        if (authentication.isEmpty()) {
            resolver.resolveException(request, response, null, YuzplusException.unauthorized("mobile.tokenInvalid"));
            return;
        }
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication.get());
        SecurityContextHolder.setContext(context);
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
            // Bearer soʻrovida sessiya kerak emas — tasodifan yaratilgan boʻlsa, saqlanmasin
            var session = request.getSession(false);
            if (session != null && session.isNew()) {
                session.invalidate();
            }
        }
    }
}
