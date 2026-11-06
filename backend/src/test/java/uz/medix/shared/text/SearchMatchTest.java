package uz.medix.shared.text;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class SearchMatchTest {

    private static final List<SearchMatch> HIDDEN = List.of(new SearchMatch("CONTRACT_NAME", "Нимесулид гранулы 100 мг"),
            new SearchMatch("BARCODE", "4780012345678"), new SearchMatch("CLASSIFIER_NAME", null));

    @Test
    void visibleMatchNeedsNoHint() {
        assertThat(SearchMatch.hidden("nimesil", List.of("00012345", "Nimesil"), HIDDEN)).isEmpty();
        assertThat(SearchMatch.hidden("  ", List.of("Nimesil"), HIDDEN)).isEmpty();
    }

    @Test
    void hiddenFieldIsReported() {
        assertThat(SearchMatch.hidden("4780012345678", List.of("00012345", "Nimesil"), HIDDEN))
                .contains(new SearchMatch("BARCODE", "4780012345678"));
        // kirill/lotin farqsiz, so'zlarning bir qismi ko'rinadigan maydonda
        assertThat(SearchMatch.hidden("nimesil granuli", List.of("00012345", "Nimesil"), HIDDEN))
                .contains(new SearchMatch("CONTRACT_NAME", "Нимесулид гранулы 100 мг"));
    }

    @Test
    void nothingMatches() {
        assertThat(SearchMatch.hidden("aspirin", Arrays.asList("00012345", null), HIDDEN)).isEmpty();
    }
}
