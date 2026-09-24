import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { convertQuickMemoToEvent, getQuickMemo, RepositoryError } from "@/lib/v3/repository";
import { todayLocalDate, type LocalDate } from "@/lib/v3/local-date";
import type { CalendarEventItem } from "@/lib/v3/types";

export interface QuickMemoEventConvertRequest {
  quickMemoId: string;
}

interface Props {
  request: QuickMemoEventConvertRequest | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (event: CalendarEventItem) => void;
}

/**
 * Convert a Quick Memo into a V3 CalendarEventItem (canonical).
 * events-store loadEvents reads V3, so Calendar sees it without dual-write.
 */
export function QuickMemoEventConvertSheet({ request, onOpenChange, onSaved }: Props) {
  const { t } = useI18n();
  const open = !!request;
  const [active, setActive] = useState<QuickMemoEventConvertRequest | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState<LocalDate>(todayLocalDate());
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [titleError, setTitleError] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (request) setActive(request);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const memo = getQuickMemo(request.quickMemoId);
    const first = memo?.text.trim().split("\n")[0]?.trim() ?? "";
    setTitle(first.slice(0, 120));
    setNote(memo?.text ?? "");
    setDate(todayLocalDate());
    setAllDay(true);
    setStartTime("09:00");
    setEndTime("10:00");
    setTitleError(false);
    submittingRef.current = false;
  }, [request]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  if (!active) return null;

  const close = () => onOpenChange(false);

  const handleSave = () => {
    if (submittingRef.current) return;
    const trimmed = title.trim();
    if (!trimmed || !date) {
      setTitleError(true);
      return;
    }
    submittingRef.current = true;
    try {
      const { event } = convertQuickMemoToEvent(active.quickMemoId, {
        title: trimmed,
        note: note.trim() || undefined,
        date,
        allDay,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
      });
      onSaved(event);
      close();
    } catch (err) {
      submittingRef.current = false;
      if (err instanceof RepositoryError) setTitleError(true);
      else throw err;
    }
  };

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background outline-none"
          style={{ maxHeight: "88dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <div className="flex items-center justify-between px-4 py-2">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {t("notesConvertToEvent")}
            </DrawerPrimitive.Title>
            <button type="button" onClick={close} className="p-2 text-muted-foreground" aria-label={t("notesBack")}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 pb-6 space-y-3 overflow-y-auto">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="quick-memo-event-title"
              className="w-full rounded-xl bg-secondary/60 px-4 py-3 text-base outline-none"
            />
            {titleError ? (
              <p className="text-xs text-destructive">{t("notesConvertEventNeedDate")}</p>
            ) : null}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-[88px] rounded-xl bg-secondary/60 px-4 py-3 text-sm outline-none resize-none"
            />
            <label className="block text-xs text-muted-foreground">
              {t("notesConvertEventDate")}
              <input
                type="date"
                value={date}
                data-testid="quick-memo-event-date"
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl bg-secondary/60 px-4 py-3 text-sm"
              />
            </label>
            <label className="flex items-center justify-between min-h-11 text-sm">
              <span>{t("notesConvertEventAllDay")}</span>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                data-testid="quick-memo-event-all-day"
              />
            </label>
            {!allDay && (
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-muted-foreground">
                  {t("notesConvertEventStart")}
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-secondary/60 px-4 py-3 text-sm"
                  />
                </label>
                <label className="flex-1 text-xs text-muted-foreground">
                  {t("notesConvertEventEnd")}
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-secondary/60 px-4 py-3 text-sm"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              data-testid="quick-memo-event-save"
              onClick={handleSave}
              className="w-full min-h-11 rounded-xl bg-accent text-accent-foreground text-sm font-medium"
            >
              {t("notesConvertSave")}
            </button>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
