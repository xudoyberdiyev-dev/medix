package uz.medix.sales;

import java.util.Collection;
import java.util.List;
import uz.medix.shared.security.Actor;

/**
 * Buyurtmani jo'natishga tayyorlash — sales modulining ochiq API'si (delivery moduli reys tuzishda chaqiradi). Holat mashinasi
 * sales ichida qoladi (SPEC 5.2 №7–8): «Hujjatlashtirilmoqda» → nakladnoy (NK) → «Yuklanmoqda»; reys bekor qilinsa — orqaga.
 * Barcha metodlar chaqiruvchining tranzaksiyasida ishlaydi.
 */
public interface OrderDispatch {

    enum Delivery { DELIVERY, PICKUP }

    record DispatchOrder(long id, String number, long branchId, String customer, String address, Delivery delivery, int places, String total) {}

    /** «Hujjatlashtirilmoqda» buyurtmalar (chaqiruvchiga ochiq filiallar; branchId berilsa — shu filial). */
    List<DispatchOrder> ready(Actor actor, Long branchId);

    /** Buyurtmalarni qulflaydi (FOR UPDATE, id tartibida): hammasi «Hujjatlashtirilmoqda», bir filialda va chaqiruvchiga ochiq. */
    List<DispatchOrder> lockDocumenting(Actor actor, Collection<Long> orderIds);

    /** Nakladnoy raqami (birinchi marta beriladi, keyin o'zgarmaydi) va «Yuklanmoqda». Qaytaradi: NK raqami. */
    String toLoading(Actor actor, long orderId);

    /** Reys bekor qilinganda: «Yuklanmoqda» → «Hujjatlashtirilmoqda» (NK raqami saqlanadi). */
    void backToDocumenting(Actor actor, long orderId, String reason);

    /**
     * Sotuv va hisob-faktura (SPEC 5.2 №9): «Yuklanmoqda» → «Yo'lda». Tovar Jo'natish zonasidan chiqadi, mijoz qarzi oshadi.
     * Qaytaradi: SV raqami. tripId — «O'zi olib ketadi» uchun null.
     */
    String ship(Actor actor, long orderId, Long tripId);

    /** «O'zi olib ketadi» buyurtmasi (yetkazish turi bo'yicha tekshiruv uchun). */
    boolean isPickup(long orderId);
}
