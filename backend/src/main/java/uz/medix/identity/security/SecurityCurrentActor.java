package uz.medix.identity.security;

import java.util.Optional;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** {@link CurrentActor} — Spring Security kontekstidan. */
@Component
class SecurityCurrentActor implements CurrentActor {

    @Override
    public Optional<Actor> current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof MedixPrincipal p) {
            return Optional.of(new Actor(p.id(), p.branchId()));
        }
        return Optional.empty();
    }
}
