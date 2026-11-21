package uz.yuzplus.shared.security;

/**
 * Amalni bajarayotgan xodim — modullar identity'ga bog'lanmasdan foydalanadi.
 *
 * @param branchId    asosiy filial ({@code null} — biriktirilmagan)
 * @param allBranches barcha filiallar ma'lumotini ko'radi (Direktor, Bosh administrator; Buxgalter — faqat Direktor bergan belgi bilan, E3)
 */
public record Actor(long employeeId, Long branchId, boolean allBranches) {

    /** Filial doirasi (SPEC 13): xodim faqat o'z filialini ko'radi. Server tomonida majburiy. */
    public boolean canAccessBranch(long branch) {
        return allBranches || (branchId != null && branchId == branch);
    }

    /**
     * F1: tepada tanlangan filial bilan toraytirilgan doira (faqat o'qish so'rovlari uchun).
     * {@code branch == null} — o'zi; ruxsat bo'lmasa — hech bir filialni ko'rmaydigan doira (bo'sh natija).
     */
    public Actor scopedTo(Long branch) {
        if (branch == null) {
            return this;
        }
        return canAccessBranch(branch) ? new Actor(employeeId, branch, false) : new Actor(employeeId, -1L, false);
    }
}
