package uz.medix.shared.numbering;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class DocumentNumberTest {

    @Test
    void formatsWithSixDigitPadding() {
        assertThat(new DocumentNumber(DocumentPrefix.BY, "TSH", 355)).hasToString("BY-TSH-000355");
        assertThat(new DocumentNumber(DocumentPrefix.BNS, "SMQ", 1)).hasToString("BNS-SMQ-000001");
        assertThat(new DocumentNumber(DocumentPrefix.KR, "FRG", 1_234_567)).hasToString("KR-FRG-1234567");
    }

    @Test
    void parsesBackToSameValue() {
        DocumentNumber n = DocumentNumber.parse("MT-BXR-000042");
        assertThat(n.prefix()).isEqualTo(DocumentPrefix.MT);
        assertThat(n.branchCode()).isEqualTo("BXR");
        assertThat(n.sequence()).isEqualTo(42);
        assertThat(DocumentNumber.parse(n.toString())).isEqualTo(n);
    }

    @Test
    void rejectsInvalidInput() {
        assertThatThrownBy(() -> new DocumentNumber(DocumentPrefix.BY, "tsh", 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new DocumentNumber(DocumentPrefix.BY, "TSH", 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DocumentNumber.parse("BY-TSH-12")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DocumentNumber.parse("XX-TSH-000001")).isInstanceOf(IllegalArgumentException.class);
    }
}
