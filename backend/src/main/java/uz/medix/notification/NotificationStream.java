package uz.medix.notification;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Bildirishnomalar real vaqtda (SPEC 10 — Server-Sent Events). Har xodimning ochiq oynalari (bir nechta varaq bo'lishi
 * mumkin) shu yerda saqlanadi. Hodisada faqat «o'zgardi» signali ketadi — ma'lumotning o'zi oddiy GET orqali olinadi
 * (ruxsat va filial filtri bitta joyda qoladi). Bitta server nusxasi uchun; bir nechta nusxada — so'rov oralig'i zaxira.
 */
@Component
class NotificationStream {

    static final String EVENT_CHANGED = "notifications";
    private static final long TIMEOUT_MS = Duration.ofMinutes(30).toMillis();
    private static final Logger log = LoggerFactory.getLogger(NotificationStream.class);

    private final Map<Long, Set<SseEmitter>> emitters = new ConcurrentHashMap<>();
    /** Yuborish alohida oqimda: uzilgan ulanish hujjat o'tkazayotgan so'rovni hech qachon to'xtatmasin va xato qaytarmasin. */
    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "notification-sse");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    void shutdown() {
        sender.shutdownNow();
    }

    SseEmitter subscribe(long employeeId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        emitters.computeIfAbsent(employeeId, k -> ConcurrentHashMap.newKeySet()).add(emitter);
        emitter.onCompletion(() -> remove(employeeId, emitter));
        emitter.onTimeout(() -> remove(employeeId, emitter));
        emitter.onError(e -> remove(employeeId, emitter));
        send(employeeId, emitter, SseEmitter.event().name("ready").data("ok").reconnectTime(5_000));
        return emitter;
    }

    /** Xodimlarning ochiq oynalariga «bildirishnomalar o'zgardi» signali. */
    void changed(Collection<Long> employeeIds) {
        Set<Long> ids = Set.copyOf(employeeIds);
        try {
            sender.execute(() -> {
                for (long id : ids) {
                    for (SseEmitter e : emitters.getOrDefault(id, Set.of())) {
                        send(id, e, SseEmitter.event().name(EVENT_CHANGED).data("changed"));
                    }
                }
            });
        } catch (RuntimeException ex) {
            log.debug("SSE signal yuborilmadi", ex);
        }
    }

    /** Signal faqat joriy tranzaksiya muvaffaqiyatli yakunlangach (bekor qilinsa — signal yo'q); tranzaksiyasiz — darhol. */
    void changedAfterCommit(Collection<Long> employeeIds) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            changed(employeeIds);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                changed(employeeIds);
            }
        });
    }

    /** Proksi va brauzer ulanishni uzib qo'ymasligi uchun; uzilgan ulanishlar shu yerda tozalanadi. */
    @Scheduled(fixedDelay = 25_000, initialDelay = 25_000)
    void heartbeat() {
        try {
            sender.execute(() -> emitters.forEach((id, set) -> set.forEach(e -> send(id, e, SseEmitter.event().comment("ping")))));
        } catch (RuntimeException ex) {
            log.debug("SSE ping yuborilmadi", ex);
        }
    }

    /** Testlar uchun: navbatdagi barcha yuborishlar tugashini kutadi. */
    void awaitSent() throws Exception {
        sender.submit(() -> {}).get(5, TimeUnit.SECONDS);
    }

    int subscribers(long employeeId) {
        return emitters.getOrDefault(employeeId, Set.of()).size();
    }

    private void send(long employeeId, SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (Exception ex) {
            // Uzilgan ulanish (varaq yopildi, proksi uzdi) — oddiy holat: ro'yxatdan chiqariladi, xato qaytarilmaydi.
            log.debug("SSE ulanish yopildi: xodim {}", employeeId);
            remove(employeeId, emitter);
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // allaqachon yopilgan
            }
        }
    }

    private void remove(long employeeId, SseEmitter emitter) {
        emitters.computeIfPresent(employeeId, (k, set) -> {
            set.remove(emitter);
            return set.isEmpty() ? null : set;
        });
    }
}
