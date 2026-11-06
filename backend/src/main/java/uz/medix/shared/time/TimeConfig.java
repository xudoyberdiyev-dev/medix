package uz.medix.shared.time;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Vaqt manbai: kodda {@code Instant.now()} o'rniga {@link Clock} — testlarda boshqariladi. Rejali vazifalar (eslatmalar) yoqilgan. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class TimeConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
