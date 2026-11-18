package uz.yuzplus.notification;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.yuzplus.notification.MessageModels.Created;
import uz.yuzplus.notification.MessageModels.EditRequest;
import uz.yuzplus.notification.MessageModels.FileData;
import uz.yuzplus.notification.MessageModels.NewThreadRequest;
import uz.yuzplus.notification.MessageModels.ReadReceipt;
import uz.yuzplus.notification.MessageModels.Recipients;
import uz.yuzplus.notification.MessageModels.SendRequest;
import uz.yuzplus.notification.MessageModels.StatusRequest;
import uz.yuzplus.notification.MessageModels.TaskItem;
import uz.yuzplus.notification.MessageModels.TaskScope;
import uz.yuzplus.notification.MessageModels.TaskStatus;
import uz.yuzplus.notification.MessageModels.ThreadDetail;
import uz.yuzplus.notification.MessageModels.ThreadList;
import uz.yuzplus.notification.MessageModels.MessageFile;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.security.Authorities;
import uz.yuzplus.shared.security.CurrentActor;

/** O12: ichki xabarlar va topshiriqlar. Real vaqt signali — {@code /api/notifications/stream} dagi «messages» hodisasi. */
@RestController
@RequestMapping("/api/messages")
@Tag(name = "messages", description = "Ichki xabarlar va topshiriqlar")
class MessageController {

    record UnreadCounts(long messages, long openTasks) {}

    record MarkReadRequest(long upToMessageId) {}

    private final Messages messages;
    private final CurrentActor currentActor;

    MessageController(Messages messages, CurrentActor currentActor) {
        this.messages = messages;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> YuzplusException.unauthorized("auth.unauthorized"));
    }

    private static boolean canBroadcast() {
        return Authorities.has("messages.broadcast");
    }

    @GetMapping("/recipients")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Kimga yozish mumkin", description = "Xodimlar (filial doirasida), rol va filiallar (faqat messages.broadcast bilan).")
    Recipients recipients() {
        return messages.recipients(actor(), canBroadcast());
    }

    @GetMapping("/unread")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "O'qilmagan xabarlar va ochiq topshiriqlar soni (topbar)")
    UnreadCounts unread() {
        long me = actor().employeeId();
        return new UnreadCounts(messages.unreadTotal(me), messages.openTasks(me));
    }

    @GetMapping("/threads")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Suhbatlar ro'yxati", description = "Oxirgi xabar bo'yicha; qidiruv — xodim, matn, rol yoki filial nomi.")
    ThreadList threads(@RequestParam(required = false) String q) {
        return messages.threads(actor(), q);
    }

    @PostMapping("/threads")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Yangi xabar", description = "Bitta xodimga — mavjud shaxsiy suhbatga qo'shiladi; bir nechta xodim, rol yoki filialga — yangi guruh suhbati.")
    Created start(@Valid @RequestBody NewThreadRequest r) {
        return messages.start(actor(), r, canBroadcast());
    }

    @GetMapping("/threads/{id}")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Suhbat", description = "Oxirgi 50 ta xabar; oldingilari — before=<eng eski xabar id>.")
    ThreadDetail thread(@PathVariable long id, @RequestParam(required = false) Long before) {
        return messages.thread(actor(), id, before);
    }

    @PostMapping("/threads/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Suhbatga xabar yoki topshiriq yuborish")
    Created send(@PathVariable long id, @Valid @RequestBody SendRequest r) {
        return new Created(id, messages.send(actor(), id, r));
    }

    @PostMapping("/threads/{id}/read")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "O'qildi deb belgilash (shu xabargacha)")
    void read(@PathVariable long id, @RequestBody MarkReadRequest r) {
        messages.markRead(actor(), id, r.upToMessageId());
    }

    @PatchMapping("/{messageId}")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Xabarni tahrirlash", description = "Faqat o'ziniki, yuborilgandan 15 daqiqa ichida.")
    void edit(@PathVariable long messageId, @Valid @RequestBody EditRequest r) {
        messages.edit(actor(), messageId, r.body());
    }

    @DeleteMapping("/{messageId}")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Xabarni o'chirish", description = "Faqat o'ziniki, 15 daqiqa ichida; «o'chirildi» izi qoladi. Topshiriq — «Bekor qilish».")
    void delete(@PathVariable long messageId) {
        messages.delete(actor(), messageId);
    }

    @GetMapping("/{messageId}/reads")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Kim o'qidi (guruh xabari)")
    List<ReadReceipt> reads(@PathVariable long messageId) {
        return messages.reads(actor(), messageId);
    }

    @PostMapping("/{messageId}/status")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Topshiriq holati", description = "Ijrochi: IN_PROGRESS, DONE (o'z holati). Yuboruvchi: NEW — «Qayta ochish», CANCELLED — «Bekor qilish».")
    void status(@PathVariable long messageId, @Valid @RequestBody StatusRequest r) {
        messages.setStatus(actor(), messageId, r.status());
    }

    @GetMapping("/tasks")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Topshiriqlar", description = "MINE — menga berilgan, GIVEN — men bergan; holat va «muddati o'tgan» filtri.")
    List<TaskItem> tasks(@RequestParam(defaultValue = "MINE") TaskScope scope, @RequestParam(required = false) TaskStatus status,
            @RequestParam(defaultValue = "false") boolean overdue) {
        return messages.tasks(actor(), scope, status, overdue);
    }

    @PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Biriktirma yuklash", description = "Istalgan fayl (rasm, PDF, Excel, Word …) ≤ 20 MB; yuborishda fileIds bilan biriktiriladi.")
    MessageFile upload(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.getSize() > Messages.MAX_FILE_BYTES) {
            throw YuzplusException.badRequest("messages.fileSize");
        }
        return messages.upload(actor(), file.getOriginalFilename(), file.getContentType(), file.getBytes());
    }

    @GetMapping("/files/{fileId}")
    @PreAuthorize("hasAuthority('messages.use')")
    @Operation(summary = "Biriktirmani yuklab olish", description = "Faqat suhbat qatnashchilariga. inline=true — rasmni ko'rish oynasi uchun.")
    ResponseEntity<byte[]> file(@PathVariable long fileId, @RequestParam(defaultValue = "false") boolean inline) {
        FileData f = messages.file(actor(), fileId);
        String encoded = URLEncoder.encode(f.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        boolean showInline = inline && Messages.isImage(f.contentType());
        MediaType type = showInline ? MediaType.parseMediaType(f.contentType()) : safeType(f.contentType());
        return ResponseEntity.ok()
                .contentType(type)
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, (showInline ? "inline" : "attachment") + "; filename*=UTF-8''" + encoded)
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "sandbox; default-src 'none'")
                .body(f.data());
    }

    private static MediaType safeType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (RuntimeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
