package uz.medix.shared.settings;

import java.math.BigDecimal;

/**
 * Tizim sozlamasi kalitlari (prototip «Sozlamalar»). {@link #section} — sahifa bo'limi, {@link #scope} — kim o'zgartiradi.
 * Qiymat chegaralari prototipdagi bilan bir xil.
 */
public enum SettingKey {
    expiryWarnDays("wh", Kind.DAY, Scope.DIRECTOR),
    invRemindDays("wh", Kind.DAY, Scope.DIRECTOR),
    orderLateDays("sales", Kind.DAY, Scope.DIRECTOR),
    limitBranchPct("sales", Kind.PCT, Scope.DIRECTOR),
    overdueDirDays("sales", Kind.DAY, Scope.DIRECTOR),
    priceWarnPct("sales", Kind.PCT, Scope.DIRECTOR),
    cashBranchApprove("money", Kind.SUM, Scope.DIRECTOR),
    hcDirApprove("money", Kind.SUM, Scope.DIRECTOR),
    ivDirApprove("money", Kind.SUM, Scope.DIRECTOR),
    pwMin("sec", Kind.LEN, Scope.SECURITY),
    sessionMin("sec", Kind.MIN, Scope.SECURITY),
    pinTries("sec", Kind.TRIES, Scope.SECURITY),
    pinLockMin("sec", Kind.LOCK, Scope.SECURITY);

    /** Qiymat turi: o'lchov birligi va ruxsat etilgan oraliq. */
    public enum Kind {
        DAY(1, 365), PCT(0, 100), SUM(0, 0), LEN(6, 64), MIN(5, 480), TRIES(1, 10), LOCK(1, 120);

        public final long min;
        public final long max;

        Kind(long min, long max) {
            this.min = min;
            this.max = max;
        }
    }

    /** DIRECTOR — faqat Direktor; SECURITY — Direktor va Bosh administrator. */
    public enum Scope { DIRECTOR, SECURITY }

    public final String section;
    public final Kind kind;
    public final Scope scope;

    SettingKey(String section, Kind kind, Scope scope) {
        this.section = section;
        this.kind = kind;
        this.scope = scope;
    }

    /**
     * Qiymatni tekshiradi va saqlanadigan ko'rinishga keltiradi ({@code null} — noto'g'ri).
     * Summa: {@code 2.000.000,00}, {@code 2000000} yoki {@code 2000000.5} ko'rinishida qabul qilinadi.
     */
    public String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.replaceAll("\\s", "");
        if (kind == Kind.SUM) {
            String c = t.contains(",") ? t.replace(".", "").replace(',', '.') : t;
            if (!c.matches("^\\d{1,13}(\\.\\d{1,2})?$")) {
                return null;
            }
            BigDecimal v = new BigDecimal(c).setScale(2, java.math.RoundingMode.HALF_UP);
            return v.signum() > 0 ? v.toPlainString() : null;
        }
        if (!t.matches("^\\d{1,6}$")) {
            return null;
        }
        long n = Long.parseLong(t);
        return n < kind.min || n > kind.max ? null : Long.toString(n);
    }
}
