package uz.medix.shared.security;

/**
 * Amalni bajarayotgan xodim — modullar identity'ga bog'lanmasdan foydalanadi.
 *
 * @param branchId    asosiy filial ({@code null} — biriktirilmagan)
 * @param allBranches barcha filiallar ma'lumotini ko'radi (Direktor, Bosh administrator, Buxgalter — SPEC 13)
 */
public record Actor(long employeeId, Long branchId, boolean allBranches) {

    /** Filial doirasi (SPEC 13): xodim faqat o'z filialini ko'radi. Server tomonida majburiy. */
    public boolean canAccessBranch(long branch) {
        return allBranches || (branchId != null && branchId == branch);
    }
}
