package uz.medix.finance.debt;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** Akt sverka — server PDF: davr boshi + oshdi − kamaydi = davr oxiri, ikki tomon imzosi. */
@Service
class DebtActPdf {

    private final Debts debts;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    DebtActPdf(Debts debts, PdfRenderer pdf, JdbcClient jdbc) {
        this.debts = debts;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, Side side, long branchId, long counterpartyId, LocalDate from, LocalDate to) {
        Debts.Act a = debts.act(actor, side, branchId, counterpartyId, from, to);
        Map<String, Object> org = jdbc.sql("SELECT legal_name, tin FROM branch WHERE id = :b").param("b", a.branchId()).query().singleRow();
        boolean customer = side == Side.CUSTOMER;
        Money closing = Money.of(a.closing());

        Map<String, Object> vars = new HashMap<>();
        vars.put("period", PdfFormat.date(a.from()) + " – " + PdfFormat.date(a.to()));
        vars.put("orgName", org.get("legal_name"));
        vars.put("orgTin", org.get("tin"));
        vars.put("branch", a.branch());
        vars.put("partyName", a.name());
        vars.put("partyTin", PdfFormat.orDash(a.tin()));
        vars.put("partyRole", customer ? "Mijoz" : "Yetkazib beruvchi");
        vars.put("debitTitle", customer ? "Qarz oshdi" : "Qarzimiz oshdi");
        vars.put("opening", PdfFormat.money(a.opening()));
        vars.put("openingLabel", "Davr boshi (" + PdfFormat.date(a.from()) + ")");
        vars.put("debitTotal", PdfFormat.money(a.debitTotal()));
        vars.put("creditTotal", PdfFormat.money(a.creditTotal()));
        vars.put("closing", closing.format());
        vars.put("closingLabel", "Davr oxiri (" + PdfFormat.date(a.to()) + ")");
        vars.put("lines", a.lines().stream().map(DebtActPdf::row).toList());
        vars.put("summary", summary(customer, closing, (String) org.get("legal_name"), a.name()));
        String name = "Akt-sverka-" + a.name().replaceAll("[^\\p{L}\\p{N}]+", "-") + "-" + a.to();
        return new PdfDocument(name, pdf.render("debt-act", vars));
    }

    private static Map<String, Object> row(Debts.ActLine l) {
        Map<String, Object> m = new HashMap<>();
        m.put("date", PdfFormat.date(l.date()));
        m.put("doc", l.docNumber());
        m.put("note", l.note() == null ? "" : l.note());
        m.put("debit", nonZero(l.debit()));
        m.put("credit", nonZero(l.credit()));
        m.put("balance", PdfFormat.money(l.balance()));
        return m;
    }

    private static String nonZero(String amount) {
        return amount == null || Money.of(amount).isZero() ? "" : Money.of(amount).format();
    }

    /** Yakuniy jumla: kim kimga qarzdor (musbat — mijoz / kompaniya qarzdor; manfiy — avans). */
    static String summary(boolean customer, Money closing, String org, String party) {
        if (closing.isZero()) {
            return "Davr oxirida oʻzaro qarz yoʻq.";
        }
        String sum = (closing.isNegative() ? Money.ZERO.minus(closing) : closing).format() + " soʻm";
        boolean partyOwes = customer != closing.isNegative();
        return partyOwes ? "Davr oxirida " + party + " " + org + " oldida " + sum + " qarzdor."
                : "Davr oxirida " + org + " " + party + " oldida " + sum + " qarzdor.";
    }
}
