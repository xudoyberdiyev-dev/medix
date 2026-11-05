package uz.medix.finance.payment;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import uz.medix.shared.money.Money;

class OffsetterTest {

    private static Allocator.Doc doc(long id, String open) {
        return new Allocator.Doc("SV", id, "SV-" + id, Money.of(open));
    }

    private final List<Allocator.Doc> docs = List.of(doc(1, "1000"), doc(2, "-700"), doc(3, "500"), doc(4, "-600"));

    @Test
    void oldestAdvanceToOldestDebt() {
        List<Offsetter.Line> lines = Offsetter.plan(docs, null);
        assertThat(lines).extracting(l -> l.advance().id() + "->" + l.debt().id() + " " + l.amount())
                .containsExactly("2->1 700.00", "4->1 300.00", "4->3 300.00");
        assertThat(Offsetter.total(lines)).isEqualTo(Money.of("1300"));
    }

    @Test
    void capLimitsTotal() {
        assertThat(Offsetter.total(Offsetter.plan(docs, Money.of("800")))).isEqualTo(Money.of("800"));
    }

    @Test
    void nothingWithoutAdvanceOrDebt() {
        assertThat(Offsetter.plan(List.of(doc(1, "5")), null)).isEmpty();
        assertThat(Offsetter.plan(List.of(doc(1, "-5")), null)).isEmpty();
    }
}
