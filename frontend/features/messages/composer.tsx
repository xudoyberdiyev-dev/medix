"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, FileText, ImageIcon, Paperclip, Send, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { MAX_FILES, fileProblem, formatSize, uploadMessageFile, type MessageFile, type SendBody } from "./api";

/** Muddat maydoni (`datetime-local`) → ISO; boʻsh — null. */
export function dueToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Xabar yozish: matn (Enter — yuborish, Shift+Enter — yangi qator), fayl/rasm biriktirish (≤ 20 MB, koʻpi bilan 10 ta),
 * «Topshiriq sifatida yuborish» — sarlavha va muddat.
 */
export function Composer({
  onSend,
  pending,
  autoFocus,
}: {
  onSend: (body: SendBody) => Promise<unknown>;
  pending: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations("chat");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<MessageFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [asTask, setAsTask] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function pick(list: FileList | null) {
    if (!list) return;
    const chosen = Array.from(list);
    if (files.length + chosen.length > MAX_FILES) {
      toast({ tone: "warning", title: t("tooManyFiles", { n: MAX_FILES }) });
      return;
    }
    for (const f of chosen) {
      const problem = fileProblem(f);
      if (problem) {
        toast({ tone: "danger", title: t(problem === "size" ? "fileTooBig" : "fileEmpty", { name: f.name }), description: t("fileHint") });
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const up = await uploadMessageFile(f);
        setFiles((prev) => [...prev, up]);
      } catch {
        toast({ tone: "danger", title: t("uploadFailed", { name: f.name }), description: t("uploadRetry") });
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    setError(null);
    if (asTask && !title.trim()) {
      setError(t("taskTitleRequired"));
      return;
    }
    if (!asTask && !text.trim() && files.length === 0) return;
    const dueAt = asTask ? dueToIso(due) : null;
    if (asTask && dueAt && Date.parse(dueAt) < Date.now()) {
      setError(t("duePast"));
      return;
    }
    await onSend({
      kind: asTask ? "TASK" : "MESSAGE",
      body: text.trim() || undefined,
      taskTitle: asTask ? title.trim() : undefined,
      dueAt: dueAt ?? undefined,
      fileIds: files.map((f) => f.id),
    });
    setText("");
    setFiles([]);
    setTitle("");
    setDue("");
    setAsTask(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!pending && uploading === 0) void submit().catch(() => undefined);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-surface p-3">
      {asTask ? (
        <div className="grid gap-2 md:grid-cols-[1fr_14rem]">
          <TextField
            label={t("taskTitle")}
            value={title}
            onChange={setTitle}
            maxLength={200}
            error={error && !title.trim() ? error : undefined}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-due`} className="text-table text-text-secondary">
              {t("due")}
            </label>
            <input
              id={`${id}-due`}
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-control-md rounded-control border border-border bg-surface px-3 text-body focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            />
          </div>
        </div>
      ) : null}
      {error && (!asTask || title.trim()) ? (
        <p role="alert" className="text-table text-danger">
          {error}
        </p>
      ) : null}
      {files.length > 0 || uploading > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t("attachments")}>
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1 rounded-control border border-border bg-background py-1 pr-1 pl-2 text-table">
              {f.image ? <ImageIcon size={16} strokeWidth={1.5} aria-hidden /> : <FileText size={16} strokeWidth={1.5} aria-hidden />}
              <span className="max-w-48 truncate">{f.fileName}</span>
              <span className="text-text-secondary">{formatSize(f.sizeBytes)}</span>
              <button
                type="button"
                aria-label={t("removeFile", { name: f.fileName })}
                onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                className="rounded-control p-1 text-text-secondary hover:bg-surface hover:text-text-primary"
              >
                <X size={14} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          ))}
          {uploading > 0 ? <li className="py-1 text-table text-text-secondary">{t("uploading")}</li> : null}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => void pick(e.target.files)} data-testid="message-file" />
        <Button variant="icon" aria-label={t("attach")} title={t("attach")} icon={Paperclip} onClick={() => fileRef.current?.click()} />
        <button
          type="button"
          aria-pressed={asTask}
          title={t("asTask")}
          onClick={() => setAsTask((v) => !v)}
          className={cn(
            "flex h-control-md shrink-0 items-center gap-1 rounded-control px-2 text-table",
            asTask ? "bg-primary-soft text-primary-button" : "text-text-secondary hover:bg-background",
          )}
        >
          <ClipboardList size={18} strokeWidth={1.5} aria-hidden />
          <span className="max-md:hidden">{t("asTask")}</span>
        </button>
        <label htmlFor={`${id}-text`} className="sr-only">
          {asTask ? t("taskBody") : t("messagePlaceholder")}
        </label>
        <textarea
          id={`${id}-text`}
          rows={1}
          autoFocus={autoFocus}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={asTask ? t("taskBody") : t("messagePlaceholder")}
          className="max-h-40 min-h-control-md flex-1 resize-y rounded-control border border-border bg-surface px-3 py-2 text-body focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        />
        <Button icon={Send} loading={pending} disabled={uploading > 0} onClick={() => void submit().catch(() => undefined)}>
          {t("send")}
        </Button>
      </div>
    </div>
  );
}
