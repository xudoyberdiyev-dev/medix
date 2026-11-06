package uz.medix.notification;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * PostgreSQL {@code LISTEN medix_live} (V32 triggerlari): hujjat tranzaksiyasi yakunlangach keladigan «mavzu:filial»
 * signallarini ochiq oynalarga uzatadi. Alohida ulanishda; uzilsa 5 soniyadan keyin qayta ulanadi. Signal yo'qolsa
 * ham sahifalar so'rov oralig'i bilan yangilanadi (zaxira).
 */
@Component
class LiveSignalListener implements SmartLifecycle {

    static final String CHANNEL = "medix_live";
    private static final int POLL_MS = 5_000;
    private static final long RETRY_MS = 5_000;
    private static final Logger log = LoggerFactory.getLogger(LiveSignalListener.class);

    private final DataSource dataSource;
    private final NotificationStream stream;
    private volatile boolean running;
    private volatile boolean listening;
    private Thread thread;

    LiveSignalListener(DataSource dataSource, NotificationStream stream) {
        this.dataSource = dataSource;
        this.stream = stream;
    }

    @Override
    public synchronized void start() {
        if (running) {
            return;
        }
        running = true;
        thread = Thread.ofPlatform().daemon().name("live-signal-listener").start(this::loop);
    }

    @Override
    public synchronized void stop() {
        running = false;
        if (thread != null) {
            thread.interrupt();
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /** Testlar uchun: LISTEN o'rnatilganmi. */
    boolean listening() {
        return listening;
    }

    private void loop() {
        while (running) {
            try (Connection c = dataSource.getConnection()) {
                c.setAutoCommit(true);
                try (Statement s = c.createStatement()) {
                    s.execute("LISTEN " + CHANNEL);
                }
                PGConnection pg = c.unwrap(PGConnection.class);
                listening = true;
                while (running) {
                    PGNotification[] batch = pg.getNotifications(POLL_MS);
                    if (batch != null) {
                        for (PGNotification n : batch) {
                            dispatch(n.getParameter());
                        }
                    }
                }
            } catch (SQLException | RuntimeException e) {
                listening = false;
                if (running) {
                    log.warn("Real vaqt signallari ulanishi uzildi, qayta ulanadi: {}", e.getMessage());
                    sleep();
                }
            }
        }
        listening = false;
    }

    /** «orders:12» → mavzu «orders», filial 12. Noto'g'ri ko'rinishdagi signal e'tiborsiz qoldiriladi. */
    void dispatch(String payload) {
        int i = payload == null ? -1 : payload.indexOf(':');
        if (i <= 0) {
            return;
        }
        try {
            stream.broadcast(payload.substring(0, i), Long.parseLong(payload.substring(i + 1)));
        } catch (NumberFormatException e) {
            log.debug("Noto'g'ri signal: {}", payload);
        }
    }

    private void sleep() {
        try {
            Thread.sleep(RETRY_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
