package uz.medix.inventory.transfer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import uz.medix.shared.money.Money;

/**
 * FS (filiallararo savdo) qator summasi. Egasi qarori (07.11.2026, E2): narx = partiya tannarxi (QQSsiz baza),
 * QQS stavkasi ustiga qo'shiladi — soliq bazasi tannarxdan past bo'lmaydi; qabul qiluvchi filialda kirim QQSi hisobga olinadi.
 * QQS = baza × stavka / 100 (2 xona, HALF_UP); qator summasi = baza + QQS. Sof funksiya.
 */
public final class FsPricing {

    /** @param net QQSsiz baza (tannarx × miqdor), @param vat QQS, @param gross QQS bilan (qarzga yoziladigan summa) */
    public record Line(Money net, Money vat, Money gross) {}

    private FsPricing() {}

    public static Line line(BigDecimal unitCost, int qty, BigDecimal vatRate) {
        Money net = new Money(unitCost).times(qty);
        Money vat = new Money(net.amount().multiply(vatRate).divide(BigDecimal.valueOf(100), Money.SCALE, RoundingMode.HALF_UP));
        return new Line(net, vat, net.plus(vat));
    }
}
