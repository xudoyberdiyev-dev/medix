package uz.medix.shared.settings;

import java.math.BigDecimal;

/**
 * Tizim sozlamalari (prototip Settings). {@code section} — sahifadagi bo'lim, {@code scope} — kim o'zgartiradi:
 * {@code DIRECTOR} (settings.edit) yoki {@code SECURITY} (settings.security — Direktor va Bosh administrator).
 */
public enum SettingKey {
    expiryWarnDays(Section.WH, Kind.DAY, Scope.DIRECTOR),
    invRemindDays(Section.WH, Kind.DAY, Scope.DIRECTOR),
    orderLateDays(Section.SALES, Kind.DAY, Scope.DIRECTOR),
    limitBranchPct(Section.SALES, Kind.PCT, Scope.DIRECTOR),
    overdueDirDays(Section.SALES, Kind.DAY, Scope.DIRECTOR),
    priceWarnPct(Section.SALES, Kind.PCT, Scope.DIRECTOR),
    /** Mijozdan qaytarish muddati, kun (O8, egasi 13.11.2026): yetkazilgandan keyin; 0 — cheksiz. */
    returnDays(Section.SALES, Kind.RDAY, Scope.DIRECTOR),
    cashBranchApprove(Section.MONEY, Kind.SUM, Scope.DIRECTOR),
    hcDirApprove(Section.MONEY, Kind.SUM, Scope.DIRECTOR),
    ivDirApprove(Section.MONEY, Kind.SUM, Scope.DIRECTOR),
    pwMin(Section.SEC, Kind.LEN, Scope.SECURITY),
    sessionMin(Section.SEC, Kind.MIN, Scope.SECURITY),
    pinTries(Section.SEC, Kind.TRIES, Scope.SECURITY),
    pinLockMin(Section.SEC, Kind.LOCK, Scope.SECURITY);

    public enum Section { WH, SALES, MONEY, SEC }

    public enum Scope { DIRECTOR, SECURITY }

    /** Qiymat turi va ruxsat etilgan oraliq (prototip KIND). SUM — so'm (2 xona), qolganlari butun son. */
    public enum Kind {
        DAY(1, 365), PCT(0, 100), SUM(0, 0), LEN(6, 64), MIN(5, 480), TRIES(1, 10), LOCK(1, 120),
        /** Kun, 0 — cheksiz (qaytarish muddati). */
        RDAY(0, 365);

        private final long min;
        private final long max;

        Kind(long min, long max) {
            this.min = min;
            this.max = max;
        }

        public long min() {
            return min;
        }

        public long max() {
            return max;
        }

        /** Qiymat to'g'rimi: SUM — 0 dan katta, 2 xonagacha; boshqalari — butun son va oraliqda. */
        public boolean valid(BigDecimal v) {
            if (v == null) {
                return false;
            }
            if (this == SUM) {
                return v.signum() > 0 && v.stripTrailingZeros().scale() <= 2 && v.compareTo(new BigDecimal("1000000000000")) <= 0;
            }
            return v.stripTrailingZeros().scale() <= 0 && v.compareTo(BigDecimal.valueOf(min)) >= 0 && v.compareTo(BigDecimal.valueOf(max)) <= 0;
        }
    }

    private final Section section;
    private final Kind kind;
    private final Scope scope;

    SettingKey(Section section, Kind kind, Scope scope) {
        this.section = section;
        this.kind = kind;
        this.scope = scope;
    }

    public Section section() {
        return section;
    }

    public Kind kind() {
        return kind;
    }

    public Scope scope() {
        return scope;
    }
}
