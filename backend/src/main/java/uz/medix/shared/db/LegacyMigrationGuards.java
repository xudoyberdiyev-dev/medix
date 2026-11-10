package uz.medix.shared.db;

import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Optional;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.stereotype.Component;

/**
 * Qo'llangan migratsiyani o'zgartirmasdan (checksum) uning to'ldirilgan bazadagi xatosini chetlab o'tish.
 *
 * <p>V70 {@code UPDATE sales_order_line SET list_price = price} — bo'sh bazada (CI) o'tadi, lekin DRAFT bo'lmagan
 * buyurtma qatori bor bazada {@code sales_order_line_locked} triggeri uni rad etadi va ilova ishga tushmaydi
 * (Railway «Crashed», 10.11.2026). Shu migratsiya tranzaksiyasi ichida trigger vaqtincha o'chiriladi va darhol qayta
 * yoqiladi; migratsiya yiqilsa — tranzaksiya bilan birga qaytariladi. V70 allaqachon qo'llangan bazalarga ta'sir yo'q.
 */
@Component
public class LegacyMigrationGuards implements Callback {

    /** Migratsiya versiyasi → shu migratsiya vaqtida o'chiriladigan trigger (jadval, trigger). */
    static final Map<String, String[]> TRIGGERS_OFF = Map.of("70", new String[] {"sales_order_line", "sales_order_line_locked"});

    @Override
    public boolean supports(Event event, Context context) {
        return (event == Event.BEFORE_EACH_MIGRATE || event == Event.AFTER_EACH_MIGRATE) && guard(context).isPresent();
    }

    @Override
    public boolean canHandleInTransaction(Event event, Context context) {
        return true;
    }

    @Override
    public void handle(Event event, Context context) {
        guard(context).ifPresent(t -> {
            String action = event == Event.BEFORE_EACH_MIGRATE ? "DISABLE" : "ENABLE";
            try (Statement st = context.getConnection().createStatement()) {
                st.execute("ALTER TABLE " + t[0] + " " + action + " TRIGGER " + t[1]);
            } catch (SQLException e) {
                throw new FlywayException("Trigger " + t[1] + " " + action + " xatosi", e);
            }
        });
    }

    @Override
    public String getCallbackName() {
        return "medix-legacy-migration-guards";
    }

    private static Optional<String[]> guard(Context context) {
        return Optional.ofNullable(context)
                .map(Context::getMigrationInfo)
                .map(MigrationInfo::getVersion)
                .map(MigrationVersion::getVersion)
                .map(TRIGGERS_OFF::get);
    }
}
