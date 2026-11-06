package uz.medix.finance;

import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Mijozdan to'lov (MT) — finance modulining ochiq API'si. Haydovchidagi pul (SPEC 5.4): Kassir qabul qiladi → MT darhol
 * o'tkaziladi (eng eski qarzdan taqsimlanadi, ortig'i avans), mijoz qarzi kamayadi, pul kassaga tushadi. Chaqiruvchi tranzaksiyasida.
 */
public interface CustomerPayments {

    record Posted(long id, String number) {}

    Posted acceptDriverCash(Actor actor, long branchId, long customerId, long accountId, Money amount, String sourceRef, String note);
}
