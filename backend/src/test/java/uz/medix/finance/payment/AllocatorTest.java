package uz.medix.finance.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import uz.medix.shared.money.Money;

class AllocatorTest {

    private static final List<Allocator.Doc> DOCS = List.of(
            new Allocator.Doc("SV", 1, "SV-1", Money.of("5000.00")),
            new Allocator.Doc("SV", 2, "SV-2", Money.of("4000.50")));

    @Test
    void autoClosesOldestFirstAndRestIsAdvance() {
        Allocator.Result r = Allocator.auto(DOCS, Money.of("6000.25"));
        assertThat(r.parts()).extracting(p -> p.doc().number(), p -> p.amount().toString())
                .containsExactly(org.assertj.core.groups.Tuple.tuple("SV-1", "5000.00"), org.assertj.core.groups.Tuple.tuple("SV-2", "1000.25"));
        assertThat(r.advance()).isEqualTo(Money.ZERO);
        assertThat(Allocator.auto(DOCS, Money.of("10000")).advance().toString()).isEqualTo("999.50");
        assertThat(Allocator.auto(List.of(), Money.of("10")).advance().toString()).isEqualTo("10.00");
    }

    @Test
    void manualRules() {
        Allocator.Result r = Allocator.manual(DOCS, Money.of("3000"), List.of(new Allocator.Manual("SV", 2, Money.of("1000")),
                new Allocator.Manual("SV", 2, Money.of("500")), new Allocator.Manual("SV", 1, Money.ZERO)));
        assertThat(r.parts()).hasSize(1);
        assertThat(r.parts().getFirst().amount().toString()).isEqualTo("1500.00");
        assertThat(r.advance().toString()).isEqualTo("1500.00");
        assertThatThrownBy(() -> Allocator.manual(DOCS, Money.of("9000"), List.of(new Allocator.Manual("SV", 2, Money.of("4000.51")))))
                .hasMessage("payment.allocOverOpen");
        assertThatThrownBy(() -> Allocator.manual(DOCS, Money.of("100"), List.of(new Allocator.Manual("SV", 1, Money.of("101")))))
                .hasMessage("payment.allocOverAmount");
        assertThatThrownBy(() -> Allocator.manual(DOCS, Money.of("100"), List.of(new Allocator.Manual("SV", 3, Money.of("1")))))
                .hasMessage("payment.allocUnknown");
        assertThatThrownBy(() -> Allocator.manual(DOCS, Money.of("100"), List.of(new Allocator.Manual("SV", 1, Money.of("-1")))))
                .hasMessage("payment.allocInvalid");
        assertThatThrownBy(() -> Allocator.auto(DOCS, Money.ZERO)).hasMessage("payment.amountInvalid");
    }
}
