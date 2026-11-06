package uz.medix.sales;

/** Buyurtma bekor qilindi (SPEC 5.2): sinxron hodisa, bekor qilish tranzaksiyasi ichida — reysdan chiqariladi (delivery). */
public record OrderCancelled(long orderId, String number, String reason) {}
