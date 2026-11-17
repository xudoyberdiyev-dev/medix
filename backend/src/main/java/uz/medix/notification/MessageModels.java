package uz.medix.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** O12: ichki xabarlar va topshiriqlar — API modellari. */
final class MessageModels {

    private MessageModels() {}

    enum ThreadKind { DIRECT, GROUP }

    /** Kimga: bitta xodim, tanlangan xodimlar, butun rol, butun filial. */
    enum Audience { PERSON, PEOPLE, ROLE, BRANCH }

    enum MessageKind { MESSAGE, TASK }

    enum TaskStatus { NEW, IN_PROGRESS, DONE, CANCELLED }

    /** Topshiriqlar yorlig'i: menga berilgan / men bergan. */
    enum TaskScope { MINE, GIVEN }

    record Person(long id, String fullName, @Schema(nullable = true) String roleCode, @Schema(nullable = true) String roleName,
            @Schema(nullable = true) Long branchId, @Schema(nullable = true) String branchName) {}

    record ThreadSummary(
            long id,
            ThreadKind kind,
            Audience audience,
            @Schema(nullable = true, description = "ROLE — rol kodi") String audienceRole,
            @Schema(nullable = true, description = "ROLE — rol nomi") String audienceRoleName,
            @Schema(nullable = true, description = "ROLE/BRANCH — filial (ROLE da null — barcha filiallar)") String audienceBranchName,
            @Schema(description = "Qatnashchilar (o'zidan tashqari), ko'pi bilan 5 ta") List<Person> others,
            int participantCount,
            @Schema(nullable = true) String lastText,
            @Schema(nullable = true) MessageKind lastKind,
            @Schema(nullable = true) String lastSenderName,
            Instant lastMessageAt,
            long unread) {}

    record ThreadList(List<ThreadSummary> items, long unreadTotal) {}

    record FileInfo(long id, String fileName, String contentType, int sizeBytes, boolean image) {}

    record Assignee(long employeeId, String fullName, TaskStatus status, Instant updatedAt, @Schema(nullable = true) Instant doneAt) {}

    record MessageItem(
            long id,
            long threadId,
            long senderId,
            String senderName,
            MessageKind kind,
            @Schema(nullable = true, description = "O'chirilgan xabarda null") String body,
            @Schema(nullable = true) String taskTitle,
            @Schema(nullable = true) Instant dueAt,
            Instant createdAt,
            @Schema(nullable = true) Instant editedAt,
            @Schema(nullable = true) Instant deletedAt,
            List<FileInfo> files,
            @Schema(description = "Topshiriq ijrochilari (xabarda bo'sh)") List<Assignee> assignees,
            @Schema(description = "O'qigan qatnashchilar soni (yuboruvchidan tashqari)") int readCount,
            @Schema(description = "Qabul qiluvchilar soni (yuboruvchidan tashqari)") int recipientCount,
            @Schema(description = "Joriy xodim tahrirlashi/o'chirishi mumkin (o'ziniki, 15 daqiqa ichida)") boolean editable) {}

    record ThreadDetail(ThreadSummary thread, List<Person> participants, List<MessageItem> messages, boolean hasMore) {}

    record ReadReceipt(long employeeId, String fullName, boolean read) {}

    record NewThreadRequest(
            @NotNull Audience audience,
            @Schema(nullable = true, description = "PERSON/PEOPLE — xodimlar") List<Long> employeeIds,
            @Schema(nullable = true, description = "ROLE — rol kodi") String roleCode,
            @Schema(nullable = true, description = "ROLE/BRANCH — filial; ROLE da null — barcha filiallar (faqat barcha filiallar doirasi)") Long branchId,
            @NotNull SendRequest message) {}

    record SendRequest(
            @NotNull MessageKind kind,
            @Schema(nullable = true) @Size(max = 4000) String body,
            @Schema(nullable = true) @Size(max = 200) String taskTitle,
            @Schema(nullable = true) Instant dueAt,
            @Schema(nullable = true, description = "Oldin yuklangan fayllar") List<Long> fileIds) {}

    record EditRequest(@Size(max = 4000) String body) {}

    record StatusRequest(@NotNull TaskStatus status) {}

    record Created(long threadId, long messageId) {}

    record MessageFile(long id, String fileName, String contentType, int sizeBytes, boolean image) {}

    record TaskItem(
            long messageId,
            long threadId,
            String title,
            @Schema(nullable = true) String body,
            @Schema(nullable = true) Instant dueAt,
            Instant createdAt,
            long senderId,
            String senderName,
            @Schema(description = "MINE — mening holatim; GIVEN — umumiy (hammasi bajarilgan → DONE, hammasi bekor → CANCELLED, aks holda eng orqadagi)")
            TaskStatus status,
            boolean overdue,
            List<Assignee> assignees) {}

    record FileData(String fileName, String contentType, byte[] data) {}

    record Recipients(List<Person> people, List<RoleOption> roles, List<BranchOption> branches, boolean canBroadcast) {}

    record RoleOption(String code, String name) {}

    record BranchOption(long id, String name) {}
}
