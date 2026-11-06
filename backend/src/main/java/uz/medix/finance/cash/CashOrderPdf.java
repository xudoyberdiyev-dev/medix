package uz.medix.finance.cash;

import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.cash.CashModels.CashOp;
import uz.medix.finance.cash.CashModels.Direction;
import uz.medix.finance.cash.CashModels.OpStatus;
import uz.medix.shared.money.Money;
import uz.medix.shared.money.MoneyWords;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** Kassa (bank, terminal) kirim / chiqim orderi — server PDF: summa so'z bilan, imzo joylari (frontend {@code /print/cash-op}). */
@Service
class CashOrderPdf {

    private static final Map<OpStatus, String> MARK = Map.of(
            OpStatus.PENDING, "TASDIQLANMAGAN — pul harakati hali yozilmagan",
            OpStatus.REJECTED, "RAD ETILGAN",
            OpStatus.CANCELLED, "BEKOR QILINGAN");

    private final CashOps ops;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    CashOrderPdf(CashOps ops, PdfRenderer pdf, JdbcClient jdbc) {
        this.ops = ops;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, long id) {
        CashOp o = ops.find(actor, id);
        Map<String, Object> org = jdbc.sql("SELECT legal_name, tin FROM branch WHERE id = :b").param("b", o.branchId()).query().singleRow();
        boolean incoming = o.direction() == Direction.IN;
        String prefix = switch (o.accountKind()) {
            case "CASH" -> "Kassa";
            case "BANK" -> "Bank";
            default -> "Terminal";
        };
        Money amount = Money.of(o.amount());
        String words = MoneyWords.of(amount);

        Map<String, Object> vars = new HashMap<>();
        vars.put("orgName", org.get("legal_name"));
        vars.put("orgTin", org.get("tin"));
        vars.put("title", prefix + (incoming ? " kirim" : " chiqim") + " orderi");
        vars.put("number", o.number());
        vars.put("date", PdfFormat.date(o.opDate()));
        vars.put("mark", MARK.get(o.status()));
        vars.put("partyLabel", incoming ? "Kimdan qabul qilindi" : "Kimga berildi");
        vars.put("party", PdfFormat.orDash(o.party()));
        vars.put("item", o.item());
        vars.put("account", o.account());
        vars.put("amount", amount.format() + " soʻm");
        vars.put("words", Character.toUpperCase(words.charAt(0)) + words.substring(1));
        vars.put("note", o.note());
        vars.put("createdBy", o.createdBy());
        vars.put("approvedBy", o.approvedBy());
        vars.put("lastSign", incoming ? "Topshirdi" : "Oldi");
        return new PdfDocument(o.number(), pdf.render("cash-order", vars));
    }
}
