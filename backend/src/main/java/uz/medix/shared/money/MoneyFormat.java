package uz.medix.shared.money;

import java.math.BigDecimal;

/** MEDIX pul ko'rinishi: {@code 1.250.000,00} (dizayn tizimi, «Raqamlar, pul, sana»). */
public final class MoneyFormat {

    private MoneyFormat() {}

    public static String format(Money money) {
        BigDecimal abs = money.amount().abs();
        String plain = abs.toPlainString();
        int dot = plain.indexOf('.');
        String integer = dot < 0 ? plain : plain.substring(0, dot);
        String fraction = dot < 0 ? "00" : plain.substring(dot + 1);

        StringBuilder grouped = new StringBuilder();
        int len = integer.length();
        for (int i = 0; i < len; i++) {
            grouped.append(integer.charAt(i));
            int remaining = len - i - 1;
            if (remaining > 0 && remaining % 3 == 0) {
                grouped.append('.');
            }
        }
        String sign = money.isNegative() ? "-" : "";
        return sign + grouped + "," + fraction;
    }
}
