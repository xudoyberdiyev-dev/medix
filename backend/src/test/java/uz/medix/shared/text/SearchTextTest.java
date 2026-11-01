package uz.medix.shared.text;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SearchTextTest {

    @Test
    void cyrillicAndLatinMatch() {
        assertThat(SearchText.normalize("Парацетамол")).isEqualTo(SearchText.normalize("Paracetamol"));
        assertThat(SearchText.normalize("Ципрофлоксацин")).isEqualTo(SearchText.normalize("Ciprofloxacin"));
        assertThat(SearchText.normalize("Ўзбекистон")).isEqualTo(SearchText.normalize("Oʻzbekiston"));
        assertThat(SearchText.normalize("Хоразм")).isEqualTo(SearchText.normalize("Xorazm"));
    }

    @Test
    void joinsAndEscapes() {
        assertThat(SearchText.of("Nimesil", null, " ", "Berlin-Chemie")).isEqualTo("nimesil berlin-chemie");
        assertThat(SearchText.likeEscape("50%_a")).isEqualTo("50\\%\\_a");
    }
}
