package uz.medix.shared.security;

import java.util.Optional;

/** Joriy so'rovdagi xodim. Amalga oshirish — identity modulida (SecurityContext'dan). */
public interface CurrentActor {

    Optional<Actor> current();
}
