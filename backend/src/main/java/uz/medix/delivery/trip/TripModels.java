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

    record ReadyOrder(long id, String number, long branchId, String customer, @Schema(nullable = true) String address, String delivery, int places,
            String total) {}

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
            String driver, int orders, int places, String total, Instant createdAt) {}

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
