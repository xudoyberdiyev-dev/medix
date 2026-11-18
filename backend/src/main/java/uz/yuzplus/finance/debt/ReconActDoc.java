package uz.yuzplus.finance.debt;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.finance.PartyLedger.Side;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.money.Money;
import uz.yuzplus.shared.money.MoneyWords;
import uz.yuzplus.shared.pdf.PrintSettings;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.text.UzTranslit;

/**
 * Akt sverka egasi shablonida (O17, `docs/notes/akt-sverka-namuna-YB.xlsx`): ikki tomonlama (ko'zgu) jadval — «по данным» biz va
 * kontragent (Сумма документа, Дебет, Кредит), saldolar, aylanma, qarz so'z bilan, imzolar va (mijoz qarzdor bo'lsa) «Письмо о
 * признании суммы задолженности». Til: ru (standart), uz-Latn, uz-Cyrl. PDF va Excel shu modeldan chiziladi.
 *
 * <p>Mijoz bilan (biz sotuvchi): bizning Дебет — sotuvlar, Кредит — to'lovlar/qaytarishlar. Yetkazib beruvchi bilan (biz xaridor) —
 * aynan teskari. Kontragent ustunlari — bizning yozuvlarning ko'zgusi (bizning Дебет = ularning Кредит).
 */
@Service
class ReconActDoc {

    static final List<String> LANGS = List.of("ru", "uz-Latn", "uz-Cyrl");

    record Party(String name, String tin, String address, String requisites) {}

    /** Jadval qatori; summalar hujjat tilida formatlangan, bo'sh joy — «-». */
    record Row(String date, String doc, String currency, String amount, String ourDebit, String ourCredit, String theirDebit,
            String theirCredit) {}

    record Letter(String date, String to, String toName, String title, String body, String director, String sign, String fio, String stamp) {}

    record Doc(String lang, String title, String asOf, String between, String intro, String point1, String currencyLine, Map<String, String> l,
            Party us, Party them, Row opening, List<Row> rows, Row turnover, Row closing, String point2, String debtLine, String point3,
            String head, String accountant, Letter letter, String fileName) {}

    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    /** Matnlar: [uz-Latn, ru]; uz-Cyrl — uz-Latn transliteratsiyasi. {0}, {1} … — o'rinbosarlar. */
    private static final Map<String, String[]> T = new HashMap<>();

    static {
        t("title", "Oʻzaro hisob-kitoblarni solishtirish dalolatnomasi (akt sverka) № {0}, {1}", "Акт сверки взаимных расчетов № {0} от {1}");
        t("asOf", "{0} holatiga", "по состоянию на {0}");
        t("between", "{0} va {1} oʻrtasida", "между {0} и {1}");
        t("intro", "Biz, quyida imzo chekuvchilar, bir tomondan {0} va ikkinchi tomondan {1}, ushbu solishtirish dalolatnomasini tuzdik: "
                + "hisob maʼlumotlariga koʻra oʻzaro hisob-kitoblar holati quyidagicha:",
                "Мы, нижеподписавшиеся, {0}, с одной стороны, и {1}, с другой стороны, составили настоящий акт сверки в том, что состояние "
                        + "взаимных расчетов по данным учета следующее:");
        t("point1", "1. {0} holatiga", "1. По состоянию на {0}");
        t("currency", "UZS valyutasida", "в валюте UZS");
        t("colDate", "Sana", "Дата");
        t("colDoc", "Hujjat", "Документ");
        t("colCurrency", "Hujjat valyutasi", "Валюта документа");
        t("colByData", "{0} maʼlumotlari boʻyicha", "по данным {0}");
        t("colSum", "Hujjat summasi", "Сумма документа");
        t("colDebit", "Debet", "Дебет");
        t("colCredit", "Kredit", "Кредит");
        t("opening", "Boshlangʻich saldo", "Сальдо начальное");
        t("turnover", "Davr aylanmasi", "Обороты за период");
        t("closing", "Yakuniy saldo", "Сальдо конечное");
        t("point2", "2. Shunday qilib, {0} holatiga:", "2. Таким образом, на {0}:");
        t("debt", "{0}ning {1} oldidagi qarzi UZS valyutasida {2} ({3})", "долг {0} перед {1} в валюте UZS {2} ({3})");
        t("noDebt", "oʻzaro qarzdorlik yoʻq", "взаимная задолженность отсутствует");
        t("point3", "3. Solishtirish natijasida farqlar aniqlanmadi.", "3. По результатам сверки расхождений не выявлено.");
        t("point3Diff", "3. Solishtirish natijasida farqlar aniqlandi: {0}", "3. По результатам сверки выявлены расхождения: {0}");
        t("tin", "STIR", "ИНН");
        t("position", "lavozimi", "должность");
        t("sign", "imzo", "подпись");
        t("fio", "F.I.Sh.", "расшифровка");
        t("head", "Rahbar", "Руководитель");
        t("accountant", "Bosh buxgalter", "Главный бухгалтер");
        t("stamp", "M.Oʻ.", "М.П.");
        t("letterTo", "{0} direktoriga", "Директору {0}");
        t("letterTitle", "Qarzdorlikni tan olish xati", "Письмо о признании суммы задолженности");
        t("letterBody", "Soʻrovingizga javoban maʼlum qilamizki, {0}, STIR {1}, {2}, {3} holatiga {4} oldidagi {5} ({6}) miqdoridagi "
                + "qarzdorlikni tan oladi.",
                "В ответ на Ваш запрос сообщаем, {0}, ИНН {1}, {2}, признаёт задолженность перед {4} по состоянию на {3} в сумме {5} ({6}).");
        t("director", "Direktor", "Директор");
        t("signP", "(imzo)", "(подпись)");
        t("fioP", "(F.I.Sh.)", "(Ф.И.О.)");
        // Hujjatlar
        t("SV", "Sotuv №{0}, {1}", "Продажа №{0} от {1}");
        t("SV_HF", "Sotuv №{0}, {1} (Hisob-faktura №{2}, {3})", "Продажа №{0} от {1} (Счет-фактура №{2} от {3})");
        t("KR", "Kirim №{0}, {1}", "Поступление №{0} от {1}");
        t("KR_HF", "Kirim №{0}, {1} (Hisob-faktura №{2}, {3})", "Поступление №{0} от {1} (Счет-фактура №{2} от {3})");
        t("KK", "Yuk xati №{0}, {1} ({2})", "Товарная накладная №{0} от {1} ({2})");
        t("PAY_BANK", "Toʻlov topshiriqnomasi №{0}, {1}", "Платежное поручение №{0} от {1}");
        t("PAY_CASH_IN", "Kirim kassa orderi №{0}, {1}", "Приходный кассовый ордер №{0} от {1}");
        t("PAY_CASH_OUT", "Chiqim kassa orderi №{0}, {1}", "Расходный кассовый ордер №{0} от {1}");
        t("PAY_TERMINAL", "Terminal orqali toʻlov №{0}, {1}", "Оплата через терминал №{0} от {1}");
        t("QM", "Qaytarish №{0}, {1}", "Возврат №{0} от {1}");
        t("QY", "Yetkazib beruvchiga qaytarish №{0}, {1}", "Возврат поставщику №{0} от {1}");
        t("AH", "Oʻzaro hisob-kitob №{0}, {1}", "Взаимозачет №{0} от {1}");
        t("BQ", "Boshlangʻich qoldiq №{0}, {1}", "Начальный остаток №{0} от {1}");
        t("OTHER", "Tuzatish №{0}, {1}", "Корректировка №{0} от {1}");
    }

    private static void t(String key, String uz, String ru) {
        T.put(key, new String[] {uz, ru});
    }

    /** Hujjat tilidagi matn, o'rinbosarlar bilan (o'rinbosar qiymatlari transliteratsiya qilinmaydi). */
    static String tr(String lang, String key, Object... args) {
        String[] v = T.get(key);
        String s = "ru".equals(lang) ? v[1] : "uz-Cyrl".equals(lang) ? UzTranslit.toCyrl(v[0]) : v[0];
        for (int i = 0; i < args.length; i++) {
            s = s.replace("{" + i + "}", String.valueOf(args[i]));
        }
        return s;
    }

    /** Pul hujjat tilida: ru — «51 216 371,45», uz — «51.216.371,45». */
    static String money(String lang, Money m) {
        String f = (m.isNegative() ? Money.ZERO.minus(m) : m).format();
        return "ru".equals(lang) ? f.replace('.', ' ') : f;
    }

    private static String cell(String lang, Money m) {
        return m == null || m.isZero() ? "-" : money(lang, m);
    }

    private final Debts debts;
    private final JdbcClient jdbc;
    private final PrintSettings print;

    ReconActDoc(Debts debts, JdbcClient jdbc, PrintSettings print) {
        this.debts = debts;
        this.jdbc = jdbc;
        this.print = print;
    }

    static String lang(String lang) {
        if (lang == null || lang.isBlank()) {
            return "ru";
        }
        if (!LANGS.contains(lang)) {
            throw YuzplusException.badRequest("recon.langInvalid");
        }
        return lang;
    }

    /**
     * Akt modeli. number/date — akt sverka hujjati (bo'lmasa «—» va bugun); diffNote — «выявлены расхождения»; letter — qarzni tan
     * olish xati (faqat kontragent bizdan qarzdor bo'lsa).
     */
    @Transactional(readOnly = true)
    Doc build(Actor actor, Side side, long branchId, long counterpartyId, LocalDate from, LocalDate to, String langParam, String number,
            LocalDate date, String diffNote, boolean letter) {
        String lang = lang(langParam);
        Debts.Act a = debts.act(actor, side, branchId, counterpartyId, from, to);
        Party us = jdbc.sql("""
                SELECT coalesce(legal_name, name) AS name, tin, coalesce(address, actual_address) AS address FROM branch WHERE id = :b""")
                .param("b", a.branchId())
                .query((rs, n) -> party(lang, rs.getString("name"), rs.getString("tin"), rs.getString("address")))
                .single();
        Party them = jdbc.sql("SELECT coalesce(nullif(btrim(legal_name), ''), name) AS name, tin, address FROM counterparty WHERE id = :c")
                .param("c", counterpartyId)
                .query((rs, n) -> party(lang, rs.getString("name"), rs.getString("tin"), rs.getString("address")))
                .single();
        boolean customer = side == Side.CUSTOMER;
        LocalDate docDate = date == null ? a.to() : date;
        String num = number == null ? "—" : number;

        List<Row> rows = new ArrayList<>();
        Money ourDebitTotal = Money.ZERO;
        Money ourCreditTotal = Money.ZERO;
        for (Debts.ActLine l : a.lines()) {
            Money up = Money.of(l.debit());
            Money down = Money.of(l.credit());
            // Mijoz: qarz oshdi — bizning Дебет; yetkazib beruvchi: bizning qarzimiz oshdi — bizning Кредит
            Money ourDebit = customer ? up : down;
            Money ourCredit = customer ? down : up;
            ourDebitTotal = ourDebitTotal.plus(ourDebit);
            ourCreditTotal = ourCreditTotal.plus(ourCredit);
            Money amount = up.isZero() ? down : up;
            rows.add(new Row(DMY.format(l.date()), docText(lang, side, l), "UZS", money(lang, amount), cell(lang, ourDebit), cell(lang, ourCredit),
                    cell(lang, ourCredit), cell(lang, ourDebit)));
        }
        Money opening = Money.of(a.opening());
        Money closing = Money.of(a.closing());
        Row openingRow = saldo(lang, "opening", customer, opening);
        Row closingRow = saldo(lang, "closing", customer, closing);
        Row turnover = new Row("", tr(lang, "turnover"), "", "", cell(lang, ourDebitTotal), cell(lang, ourCreditTotal), cell(lang, ourCreditTotal),
                cell(lang, ourDebitTotal));

        // Kim qarzdor: mijoz — musbat qoldiq mijoz qarzi; yetkazib beruvchi — musbat qoldiq bizning qarzimiz
        boolean themOwe = customer ? closing.isPositive() : closing.isNegative();
        String debtLine;
        String words = MoneyWords.inLang(closing.isNegative() ? Money.ZERO.minus(closing) : closing, lang);
        if (closing.isZero()) {
            debtLine = tr(lang, "noDebt");
        } else {
            debtLine = tr(lang, "debt", themOwe ? them.name() : us.name(), themOwe ? us.name() : them.name(), money(lang, closing), words);
        }
        String point3 = diffNote == null || diffNote.isBlank() ? tr(lang, "point3") : tr(lang, "point3Diff", diffNote.strip());
        PrintSettings.Signers signers = print.signers(a.branchId());
        Letter l = null;
        if (letter && themOwe && !closing.isZero()) {
            l = new Letter(DMY.format(docDate), tr(lang, "letterTo", us.name()), signers.head() == null ? "" : signers.head(),
                    tr(lang, "letterTitle"),
                    tr(lang, "letterBody", them.name(), nz(them.tin()), nz(them.address()), DMY.format(a.to()), us.name(), money(lang, closing), words),
                    tr(lang, "director"), tr(lang, "signP"), tr(lang, "fioP"), tr(lang, "stamp"));
        }
        Map<String, String> labels = new HashMap<>();
        for (String k : List.of("colDate", "colDoc", "colCurrency", "colSum", "colDebit", "colCredit", "position", "sign", "fio", "head",
                "accountant", "stamp")) {
            labels.put(k, tr(lang, k));
        }
        labels.put("colByUs", tr(lang, "colByData", us.name()));
        labels.put("colByThem", tr(lang, "colByData", them.name()));
        String file = "Akt-sverka-" + (number == null ? "" : number + "-") + them.name().replaceAll("[^\\p{L}\\p{N}]+", "-") + "-" + a.to();
        return new Doc(lang, tr(lang, "title", num, DMY.format(docDate)), tr(lang, "asOf", DMY.format(a.to())),
                tr(lang, "between", us.name(), them.name()), tr(lang, "intro", us.name(), them.name()), tr(lang, "point1", DMY.format(a.to())),
                tr(lang, "currency"), labels, us, them, openingRow, rows, turnover, closingRow, tr(lang, "point2", DMY.format(a.to())), debtLine,
                point3, signers.head(), signers.accountant(), l, file);
    }

    /** Saldo qatori: mijoz — musbat Дебет (bizda), yetkazib beruvchi — musbat Кредит (bizda); kontragentda — teskari. */
    private static Row saldo(String lang, String key, boolean customer, Money v) {
        Money abs = v.isNegative() ? Money.ZERO.minus(v) : v;
        boolean ourDebit = customer ? v.isPositive() : v.isNegative();
        String d = v.isZero() || !ourDebit ? "-" : money(lang, abs);
        String c = v.isZero() || ourDebit ? "-" : money(lang, abs);
        return new Row("", tr(lang, key), "", "", d, c, c, d);
    }

    private static Party party(String lang, String name, String tin, String address) {
        String req = name + (tin == null || tin.isBlank() ? "" : ", " + tr(lang, "tin") + " " + tin) + (address == null || address.isBlank() ? ""
                : ", " + address);
        return new Party(name, tin, address, req);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** Hujjat matni shablondagidek: «Продажа №SV-… от … (Счет-фактура №HF-… от …)», «Платежное поручение №… от …» va h.k. */
    private String docText(String lang, Side side, Debts.ActLine l) {
        String n = l.docNumber();
        String d = DMY.format(l.date());
        switch (l.docType()) {
            case "SV" -> {
                Optional<String[]> hf = jdbc.sql("SELECT invoice_number, sale_date FROM sale WHERE id = :i").param("i", l.docId())
                        .query((rs, i) -> new String[] {rs.getString("invoice_number"),
                                rs.getDate("sale_date") == null ? d : DMY.format(rs.getDate("sale_date").toLocalDate())})
                        .optional();
                return hf.filter(x -> x[0] != null).map(x -> tr(lang, "SV_HF", n, x[1], x[0], x[1])).orElse(tr(lang, "SV", n, d));
            }
            case "KR" -> {
                Optional<String[]> inv = jdbc.sql("SELECT invoice_number, invoice_date FROM receipt WHERE id = :i").param("i", l.docId())
                        .query((rs, i) -> new String[] {rs.getString("invoice_number"),
                                rs.getDate("invoice_date") == null ? d : DMY.format(rs.getDate("invoice_date").toLocalDate())})
                        .optional();
                return inv.filter(x -> x[0] != null && !x[0].isBlank()).map(x -> tr(lang, "KR_HF", n, d, x[0], x[1])).orElse(tr(lang, "KR", n, d));
            }
            case "KK" -> {
                Optional<String[]> wb = jdbc.sql("SELECT waybill_number, waybill_date FROM expected_receipt WHERE id = :i").param("i", l.docId())
                        .query((rs, i) -> new String[] {rs.getString("waybill_number"), DMY.format(rs.getDate("waybill_date").toLocalDate())})
                        .optional();
                return wb.map(x -> tr(lang, "KK", x[0], x[1], n)).orElse(n);
            }
            case "MT", "YT" -> {
                String table = "MT".equals(l.docType()) ? "customer_payment" : "supplier_payment";
                String kind = jdbc.sql("SELECT a.kind FROM " + table + " p JOIN money_account a ON a.id = p.account_id WHERE p.id = :i")
                        .param("i", l.docId()).query(String.class).optional().orElse("BANK");
                String key = switch (kind) {
                    case "CASH" -> "MT".equals(l.docType()) ? "PAY_CASH_IN" : "PAY_CASH_OUT";
                    case "TERMINAL" -> "PAY_TERMINAL";
                    default -> "PAY_BANK";
                };
                return tr(lang, key, n, d);
            }
            case "QM", "QY", "AH", "BQ" -> {
                return tr(lang, l.docType(), n, d);
            }
            default -> {
                return tr(lang, "OTHER", n, d);
            }
        }
    }
}
