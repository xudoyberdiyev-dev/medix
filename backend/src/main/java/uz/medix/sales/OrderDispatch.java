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

    /** «Yetkazildi»: «Yo'lda» → «Yetkazildi». */
    void delivered(Actor actor, long orderId);

    /**
     * «Yetkazilmadi» (sabab majburiy): sotuv bekor, mijoz qarzi teskari yoziladi, kodlar bo'shaydi, tovar «Qaytmoqda»
     * (Ombor mudiri sanab Karantinga qabul qiladi). Buyurtma «Yetkazilmadi».
     */
    void undelivered(Actor actor, long orderId, String reason);

    /** Buyurtma summasi (QQS bilan) — naqd pul chegarasi uchun. */
    String total(long orderId);

    /** Sotuv qatori (partiya bo'yicha) — haydovchi qisman yetkazishda qaytariladigan miqdorni tanlaydi. */
    record SaleLine(long id, String product, String batch, int qty, String price, String amount, boolean marked) {}

    /** «Yo'lda» buyurtmaning sotuv qatorlari. */
    List<SaleLine> saleLines(long orderId);

    record PartialResult(String returnNumber, String returnTotal, String netTotal) {}

    /**
     * Qisman yetkazish (SPEC 5.4): qabul qilinmagan qism asl sotuv narxida QM bo'lib yoziladi — mijoz qarzi kamayadi, tovar
     * «Qaytmoqda», buyurtma «Yetkazildi». returned: sotuv qatori id → qaytgan miqdor (kamida bitta, hammasi emas).
     */
    PartialResult partiallyDelivered(Actor actor, long orderId, Long tripId, String reason, java.util.Map<Long, Integer> returned);
}
