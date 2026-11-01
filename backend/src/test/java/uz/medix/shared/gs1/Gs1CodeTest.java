package uz.medix.shared.gs1;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import uz.medix.shared.gs1.Gs1Code.Kind;

class Gs1CodeTest {

    private static Gs1Code ok(String raw) {
        Gs1Code.Parsed p = Gs1Code.parse(raw);
        assertThat(p).isInstanceOf(Gs1Code.Ok.class);
        return ((Gs1Code.Ok) p).code();
    }

    private static String error(String raw) {
        Gs1Code.Parsed p = Gs1Code.parse(raw);
        assertThat(p).isInstanceOf(Gs1Code.Error.class);
        return ((Gs1Code.Error) p).key();
    }

    @Test
    void bracketedForm() {
        Gs1Code c = ok("(01)04601234567893(21)ABC123(17)280500(10)LOT-7(91)Q");
        assertThat(c.gtin()).isEqualTo("04601234567893");
        assertThat(c.serial()).isEqualTo("ABC123");
        assertThat(c.batch()).isEqualTo("LOT-7");
        assertThat(c.expiry()).isEqualTo(LocalDate.of(2028, 5, 31));
        assertThat(c.kind()).isEqualTo(Kind.BOX);
        assertThat(c.humanReadable()).isEqualTo("(01)04601234567893(21)ABC123(17)280531(10)LOT-7(91)Q");
    }

    @Test
    void gsSeparatedFormWithSymbologyAndExtraAis() {
        Gs1Code c = ok("]d2010460123456789321ABC123\u001D17280531104567\u001D91D\u001D93ab+=");
        assertThat(c.serial()).isEqualTo("ABC123");
        assertThat(c.batch()).isEqualTo("4567");
        assertThat(c.kind()).isEqualTo(Kind.UNIT);
    }

    @Test
    void errors() {
        assertThat(error("")).isEqualTo("marking.format");
        assertThat(error("4601234567893")).isEqualTo("marking.format");
        assertThat(error("(01)04601234567893(21)A(10)B")).isEqualTo("marking.format");
        assertThat(error("(01)04601234567894(21)A(10)B(91)Q")).isEqualTo("marking.gtinInvalid");
        assertThat(error("(01)04601234567893(21)A(10)B(91)X")).isEqualTo("marking.kindInvalid");
        assertThat(error("(01)04601234567893(21)A(10)B(91)D(17)281340")).isEqualTo("marking.expiryInvalid");
        assertThat(error("(01)04601234567893(21)A(21)C(10)B(91)D")).isEqualTo("marking.format");
    }

    @Test
    void barcodeToGtin14() {
        assertThat(Gs1Code.gtin14("4601234567893")).contains("04601234567893");
        assertThat(Gs1Code.gtin14("12345670")).contains("00000012345670");
        assertThat(Gs1Code.gtin14("ABC")).isEmpty();
    }
}
