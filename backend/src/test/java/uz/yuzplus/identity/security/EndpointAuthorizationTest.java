package uz.yuzplus.identity.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.util.ClassUtils;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * P1 (ishga tushirishga tayyorlash): har API metodida (yoki klassida) {@code @PreAuthorize} bo'lishi shart. Faqat «tizimga kirgan» yetarli
 * bo'lgan joyda ham bu aniq yoziladi ({@code isAuthenticated()}). Istisno — kirishdan oldingi ochiq endpointlar (SecurityConfig permitAll).
 */
class EndpointAuthorizationTest {

    /** Tizimga kirmasdan ochiq: CSRF token, kirish, kirish sahifasi ma'lumoti. */
    private static final Set<String> PUBLIC = Set.of("AuthController#csrf", "AuthController#login", "LoginInfoController#get", "MobileAuthController#login",
            "MobileAuthController#password");

    @Test
    void everyEndpointDeclaresPreAuthorize() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Controller.class));
        List<String> missing = new ArrayList<>();
        List<String> publicSecured = new ArrayList<>();
        Set<String> seenPublic = new HashSet<>();
        int endpoints = 0;
        for (BeanDefinition bd : scanner.findCandidateComponents("uz.yuzplus")) {
            Class<?> type = ClassUtils.forName(bd.getBeanClassName(), getClass().getClassLoader());
            boolean classLevel = AnnotatedElementUtils.hasAnnotation(type, PreAuthorize.class);
            for (Method m : type.getDeclaredMethods()) {
                if (m.isSynthetic() || !AnnotatedElementUtils.hasAnnotation(m, RequestMapping.class)) {
                    continue;
                }
                endpoints++;
                String id = type.getSimpleName() + "#" + m.getName();
                boolean secured = classLevel || AnnotatedElementUtils.hasAnnotation(m, PreAuthorize.class);
                if (PUBLIC.contains(id)) {
                    seenPublic.add(id);
                    if (secured) {
                        publicSecured.add(id);
                    }
                } else if (!secured) {
                    missing.add(id);
                }
            }
        }
        assertThat(endpoints).as("controllerlar topilmadi").isGreaterThan(400);
        assertThat(missing).as("@PreAuthorize yo'q API metodlari").isEmpty();
        assertThat(publicSecured).as("ochiq endpoint @PreAuthorize bilan").isEmpty();
        assertThat(seenPublic).as("PUBLIC ro'yxati eskirgan").isEqualTo(PUBLIC);
    }
}
