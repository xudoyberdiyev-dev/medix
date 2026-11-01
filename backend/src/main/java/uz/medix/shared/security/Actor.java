package uz.medix.shared.security;

/**
 * Amalni bajarayotgan xodim — modullar identity'ga bog'lanmasdan foydalanadi.
 *
 * @param branchId asosiy filial ({@code null} — biriktirilmagan)
 */
public record Actor(long employeeId, Long branchId) {}
