package uz.yuzplus.shared.gs1;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import uz.yuzplus.shared.gs1.Gs1Code.Kind;

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
        assertThat(c.kind()).isEqualTo(Kind.UNIT);
        assertThat(c.humanReadable()).isEqualTo("(01)04601234567893(21)ABC123(17)280531(10)LOT-7");
    }

    @Test
    void gsSeparatedFormWithSymbologyAndExtraAis() {
        Gs1Code c = ok("]d2010460123456789321ABC123\u001D17280531104567\u001D91D\u001D93ab+=");
        assertThat(c.serial()).isEqualTo("ABC123");
        assertThat(c.batch()).isEqualTo("4567");
        assertThat(c.kind()).isEqualTo(Kind.UNIT);
    }

    /** O16: egasi namunasidagi uchala kod (docs/notes/markirovka-namuna-egasi.xlsx) qabul qilinadi. */
    @Test
    void ownerSampleCodes() {
        Gs1Code unit = ok("0104780011675089217HTFlJLN7jbo3");
        assertThat(unit.kind()).isEqualTo(Kind.UNIT);
        assertThat(unit.gtin()).isEqualTo("04780011675089");
        assertThat(unit.serial()).isEqualTo("7HTFlJLN7jbo3");
        assertThat(unit.batch()).isNull();
        assertThat(unit.expiry()).isNull();
        assertThat(unit.plain()).isEqualTo("0104780011675089217HTFlJLN7jbo3");
        assertThat(unit.humanReadable()).isEqualTo("(01)04780011675089(21)7HTFlJLN7jbo3");

        Gs1Code box = ok("00047800116744728760");
        assertThat(box.kind()).isEqualTo(Kind.AGGREGATE);
        assertThat(box.serial()).isEqualTo("047800116744728760");
        assertThat(box.gtin()).isNull();
        assertThat(box.plain()).isEqualTo("00047800116744728760");
        assertThat(ok("00047800116744727275").serial()).isEqualTo("047800116744727275");
        // Excel oldingi nollarni yo'qotgan
        assertThat(ok("47800116744728760").serial()).isEqualTo("047800116744728760");
        assertThat(ok("(00)047800116744728760").kind()).isEqualTo(Kind.AGGREGATE);
    }

    @Test
    void unitCodeWithCryptoTailWithoutSeparator() {
        Gs1Code c = ok("0104780011675089217HTFlJLN7jbo391EE0692dGVzdA==");
        assertThat(c.serial()).isEqualTo("7HTFlJLN7jbo3");
        Gs1Code g = ok("]d20104780011675089217HTFlJLN7jbo3\u001D91EE06\u001D92dGVzdA==");
        assertThat(g.serial()).isEqualTo("7HTFlJLN7jbo3");
        assertThat(g.batch()).isNull();
    }

    @Test
    void errors() {
        assertThat(error("")).isEqualTo("marking.format");
        assertThat(error("4601234567893")).isEqualTo("marking.format");
        assertThat(error("(01)04601234567893(10)B")).isEqualTo("marking.format");
        assertThat(error("(01)04601234567894(21)A(10)B(91)Q")).isEqualTo("marking.gtinInvalid");
        assertThat(error("(01)04601234567893(21)A(10)B(91)D(17)281340")).isEqualTo("marking.expiryInvalid");
        assertThat(error("(01)04601234567893(21)A(21)C(10)B(91)D")).isEqualTo("marking.format");
        assertThat(error("00047800116744728761")).isEqualTo("marking.ssccInvalid");
    }

    @Test
    void barcodeToGtin14() {
        assertThat(Gs1Code.gtin14("4601234567893")).contains("04601234567893");
        assertThat(Gs1Code.gtin14("12345670")).contains("00000012345670");
        assertThat(Gs1Code.gtin14("ABC")).isEmpty();
    }

    @Test
    void scannedKeepsCryptoTailAndShowsGs() {
        String raw = "]d20104601234567893215ABCD\u001D91Q\u001D93Ab1c\u001D10LOT7";
        String scanned = Gs1Code.scanned(raw);
        assertThat(scanned).startsWith("0104601234567893").contains("93Ab1c");
        assertThat(Gs1Code.visibleGs(scanned)).isEqualTo("0104601234567893215ABCD<GS>91Q<GS>93Ab1c<GS>10LOT7");
        assertThat(Gs1Code.scanned("x".repeat(400))).hasSize(300);
    }
}
