package uz.yuzplus;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/** Modul chegaralari buzilmaganini tekshiradi (SPEC 14-bo'lim). */
class ModularityTest {

    @Test
    void moduleBoundariesAreRespected() {
        ApplicationModules.of(YuzplusApplication.class).verify();
    }
}
