package uz.medix.shared.text;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;

/** Server matnlari kalit + o'rinbosar bilan (T12-audit №20) — haqiqiy messages.properties ustida. */
class TextsTest {

    private static Texts texts() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        return new Texts(source);
    }

    @Test
    void formatsPlaceholdersWithoutLocaleGrouping() {
        Texts t = texts();
        assertThat(t.get("issue.order.insufficient", 3, "Parasetamol", 1500, 2000))
                .isEqualTo("3-qator: Parasetamol — qoldiq yetmaydi: mavjud 1500, kerak 2000.");
        assertThat(t.get("issue.order.overLimit", "10.000,00", t.get("approvalLevel.BRANCH")))
                .isEqualTo("Limitdan 10.000,00 soʻm oshadi — Filial rahbari tasdigʻi kerak.");
        assertThat(t.get("notification.order.approval.title", "BY-TSH-000355")).isEqualTo("Tasdiq kutmoqda: BY-TSH-000355");
    }

    @Test
    void userTextInArgumentIsNotParsed() {
        assertThat(texts().get("notification.order.rejected.body", "BY-1", "Narx {0} notoʻgʻri 'test'"))
                .isEqualTo("Narx {0} notoʻgʻri 'test'");
    }

    @Test
    void missingKeyFallsBackToKeyAndOptionalBodyIsEmpty() {
        Texts t = texts();
        assertThat(t.get("no.such.key")).isEqualTo("no.such.key");
        assertThat(t.find("notification.priceChange.approved.body", "NO-1")).isEmpty();
        assertThat(t.find("notification.receipt.accepted.body", "KR-1")).contains("Oʻtkazish kutmoqda");
    }

    /** Koddagi barcha kalitlar mavjud (yangi kalit qo'shilsa — shu ro'yxatga ham). */
    @Test
    void allKeysUsedInCodeExist() {
        Texts t = texts();
        List<String> notifications = List.of("order.approval", "order.approved", "order.rejected", "order.issue", "order.issueNote",
                "trip.returnGoods", "trip.returnCash", "cash.approval", "cash.approved", "cash.rejected", "ytpayment.approval",
                "ytpayment.returned", "priceChange.approval", "priceChange.approved", "priceChange.rejected", "receipt.dueSoon",
                "receipt.dueToday", "receipt.dueLate", "receipt.bonus", "receipt.bonusNoDate", "receipt.accepted");
        for (String n : notifications) {
            assertThat(t.find("notification." + n + ".title")).as(n).isPresent();
        }
        List<String> issues = List.of("customerInactive", "customerBlocked", "licenseExpired", "noLines", "productInactive", "duplicateLine",
                "noPrice", "insufficient", "belowMin", "aboveMax", "controlledLicense", "overLimit", "overdue", "priceChanged");
        for (String i : issues) {
            assertThat(t.find("issue.order." + i)).as(i).isPresent();
        }
        for (String r : List.of("NOT_FOUND", "SHORTAGE", "DAMAGED", "WRONG_BATCH", "EXPIRY", "CODE_UNREADABLE", "OTHER")) {
            assertThat(t.find("order.issueReason." + r)).as(r).isPresent();
        }
        assertThat(t.get("approvalLevel.DIRECTOR")).isEqualTo("Direktor");
    }
}
