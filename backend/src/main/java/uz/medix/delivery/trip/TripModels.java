package uz.medix.delivery.trip;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

final class TripModels {

    private TripModels() {}

    enum TripStatus { PLANNED, IN_TRANSIT, RETURN_WAIT, DONE, CANCELLED }

    record TripRequest(
            @NotNull(message = "{validation.required}") Long vehicleId,
            @NotNull(message = "{validation.required}") Long driverId,
            @NotNull(message = "{validation.required}") LocalDate tripDate,
            @NotNull(message = "{validation.required}") @Size(min = 1, max = 100) List<Long> orderIds,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record PickupRequest(@NotNull(message = "{validation.required}") Long orderId) {}

    /** Jo'natishga tayyor buyurtma (prototip Shipping «Tayyor»): hudud bo'yicha guruh, yetkazish sanasi, belgilar. */
    record ReadyOrder(long id, String number, long branchId, String customer, @Schema(nullable = true) String address, String delivery, int places,
            String total,
            @Schema(nullable = true, description = "Mijoz telefoni") String phone,
            @Schema(nullable = true, description = "Mijoz hududi") String region,
            @Schema(nullable = true) LocalDate deliveryDate,
            @Schema(description = "Qatorlar soni") int lines,
            @Schema(description = "Jami miqdor (dona)") int qty,
            @Schema(description = "Terish tugab «Hujjatlashtirilmoqda»ga o'tgan vaqt") Instant readyAt,
            @Schema(description = "Nazoratdagi preparat bor") boolean controlled,
            @Schema(description = "Yetishmagan miqdor (buyurtma − yig'ilgan)") int shortQty) {}

    /** Topshirilgan sotuv (prototip Shipping «Topshirilgan», so'nggi 30 kun). */
    record HandedSale(long id, String number, long orderId, String orderNumber, long customerId, String customer,
            @Schema(nullable = true) String region,
            @Schema(description = "PICKUP — o'zi olib ketdi, TRIP — reys bilan") String method,
            @Schema(nullable = true) String tripNumber, Instant at, String total, String by) {}

    record VehicleOption(long id, String plateNumber, String model, @Schema(description = "Muzlatkichi bor (faqat ma'lumot)") boolean hasRefrigerator,
            @Schema(description = "Faol reysdagi joylar (Rejalashtirilgan / Yo'lda)") int busyPlaces) {}

    record DriverOption(long id, String fullName, @Schema(nullable = true) String phone, @Schema(nullable = true) String activeTrip) {}

    record TripOptions(List<VehicleOption> vehicles, List<DriverOption> drivers) {}

    record TripStop(long id, int seq, long orderId, String orderNumber, @Schema(nullable = true) String waybillNumber, String customer,
            @Schema(nullable = true) String address, @Schema(nullable = true) String phone, String paymentType, int places, String total,
            @Schema(nullable = true) Instant loadedAt, @Schema(nullable = true, description = "DELIVERED, PARTIAL yoki UNDELIVERED") String outcome,
            @Schema(nullable = true) String outcomeReason, @Schema(nullable = true) String cashCollected, int photos,
            @Schema(nullable = true, description = "Qisman yetkazishda QM raqami") String returnNumber,
            @Schema(nullable = true, description = "QM summasi (QQS bilan)") String returnTotal,
            @Schema(description = "Mijoz imzosi olinganmi (ixtiyoriy)") boolean signed) {}

    record TripSummary(long id, String number, long branchId, LocalDate tripDate, TripStatus status, String vehicle,
            String driver, int orders, int places, String total, Instant createdAt,
            @Schema(nullable = true) String driverPhone,
            @Schema(description = "Davlat raqami") String plateNumber,
            @Schema(nullable = true, description = "Mashina modeli") String vehicleModel,
            @Schema(description = "Muzlatkichi bor (faqat ma'lumot)") boolean refrigerator,
            @Schema(description = "Yetkazilgan (to'liq yoki qisman) bekatlar") int delivered,
            @Schema(description = "Natijasi belgilangan bekatlar") int marked) {}

    record TripDetail(long id, String number, long branchId, LocalDate tripDate, TripStatus status, long vehicleId, String vehicle,
            long driverId, String driver, @Schema(nullable = true) String note, int places,
            String total, String createdBy, Instant createdAt, @Schema(nullable = true) Instant startedAt,
            @Schema(nullable = true) String cancelReason, List<TripStop> stops) {}

    /** Haydovchidagi pul (SPEC 5.4): Kassir qabul qilguncha. */
    record DriverCash(long stopId, long tripId, String tripNumber, String driver, String orderNumber, long customerId, String customer, String amount,
            Instant collectedAt, TripStatus tripStatus) {}

    /** Reys bo'yicha qabul natijasi: kutilgan, sanalgan, farq (sanalgan − kutilgan) va yozilgan MT raqamlari. */
    record TripCashAccepted(String expected, String received, String diff, List<String> payments) {}
}
