package uz.yuzplus.identity.security;

import java.util.Optional;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.security.CurrentActor;

/** {@link CurrentActor} — Spring Security kontekstidan. */
@Component
class SecurityCurrentActor implements CurrentActor {

    @Override
    public Optional<Actor> current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof YuzplusPrincipal p) {
            return Optional.of(p.toActor());
        }
        return Optional.empty();
    }
}
