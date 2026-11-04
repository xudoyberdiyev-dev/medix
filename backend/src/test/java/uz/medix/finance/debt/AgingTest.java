package uz.medix.finance.debt;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import uz.medix.shared.money.Money;

class AgingTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 5);

    private static Aging.Doc doc(int overdueDays, String open) {
        return new Aging.Doc(TODAY.minusDays(overdueDays), Money.of(open));
    }

    @Test
    void bucketsByDaysFromDueDate() {
        Aging.Result r = Aging.of(List.of(doc(120, "100"), doc(61, "200"), doc(31, "300"), doc(1, "400"), doc(0, "500"), doc(-5, "600"),
                new Aging.Doc(null, Money.of("700"))), TODAY);
        assertThat(r.d90plus()).isEqualTo(Money.of("100"));
        assertThat(r.d61to90()).isEqualTo(Money.of("200"));
        assertThat(r.d31to60()).isEqualTo(Money.of("300"));
        assertThat(r.d1to30()).isEqualTo(Money.of("400"));
        assertThat(r.notDue()).isEqualTo(Money.of("1800"));
        assertThat(r.debt()).isEqualTo(Money.of("2800"));
        assertThat(r.overdue()).isEqualTo(Money.of("1000"));
        assertThat(r.maxOverdueDays()).isEqualTo(120);
        assertThat(r.advance()).isEqualTo(Money.ZERO);
    }

    @Test
    void advanceCoversOldestFirst() {
        Aging.Result r = Aging.of(List.of(doc(95, "1000.50"), doc(10, "2000"), doc(0, "-1500.50")), TODAY);
        assertThat(r.d90plus()).isEqualTo(Money.ZERO);
        assertThat(r.d1to30()).isEqualTo(Money.of("1500"));
        assertThat(r.debt()).isEqualTo(Money.of("1500"));
        assertThat(r.maxOverdueDays()).isEqualTo(10);
    }

    @Test
    void netAdvanceWhenPaidMoreThanOwed() {
        Aging.Result r = Aging.of(List.of(doc(40, "300"), doc(0, "-1000")), TODAY);
        assertThat(r.debt()).isEqualTo(Money.ZERO);
        assertThat(r.advance()).isEqualTo(Money.of("700"));
        assertThat(r.overdue()).isEqualTo(Money.ZERO);
        assertThat(r.maxOverdueDays()).isZero();
    }
}
