import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  Trash2,
  Bell,
  Repeat,
  MapPin,
  AlignLeft,
  Palette,
  Calendar as CalIcon,
  Activity,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  getEvent,
  upsertEvent,
  deleteEvent,
  EVENT_COLORS,
  type CalendarEvent,
  type ReminderOffset,
  type RepeatFreq,
  type LiveActivityLead,
  LIVE_ACTIVITY_MAX_ACTIVE_MINUTES,
  liveActivityLeadMinutes,
} from "@/lib/events-store";
import {
  rescheduleAll,
  isNative,
  checkPermission,
  ensurePermission,
  getNotificationsUserEnabled,
  setNotificationsUserEnabled,
} from "@/lib/notifications";
import { refreshLiveActivities, isLiveActivitySupported } from "@/lib/live-activity";
import { syncLiveActivitySchedulesRemote } from "@/lib/la-remote";
import { useI18n } from "@/lib/i18n";
import { hideKeyboard, onDoneKey } from "@/lib/keyboard-avoidance";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EventSheetTarget =
  | { mode: "new"; date: string }
  | { mode: "edit"; id: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EventSheetTarget | null;
  /** "drawer" = bottom sheet (default). "modal" = centered popup. */
  variant?: "drawer" | "modal";
  onSaved?: () => void;
  onDeleted?: () => void;
}

/* ─── Reminder options ──────────────────────────────────────────────────── */

const ALL_REMINDERS: { key: ReminderOffset; tk: string }[] = [
  { key: "at",   tk: "reminderAt" },
  { key: "5m",   tk: "reminder5m" },
  { key: "10m",  tk: "reminder10m" },
  { key: "20m",  tk: "reminder20m" },
  { key: "30m",  tk: "reminder30m" },
  { key: "1h",   tk: "reminder1h" },
  { key: "2h",   tk: "reminder2h" },
  { key: "3h",   tk: "reminder3h" },
  { key: "4h",   tk: "reminder4h" },
  { key: "6h",   tk: "reminder6h" },
  { key: "8h",   tk: "reminder8h" },
  { key: "12h",  tk: "reminder12h" },
  { key: "24h",  tk: "reminder24h" },
];

const REPEATS: { key: RepeatFreq; tk: string }[] = [
  { key: "none",    tk: "repeatNone" },
  { key: "daily",   tk: "repeatDaily" },
  { key: "weekly",  tk: "repeatWeekly" },
  { key: "monthly", tk: "repeatMonthly" },
  { key: "yearly",  tk: "repeatYearly" },
];

/** Max lead is 8h — Apple's active Live Activity ceiling (see events-store). */
const LIVE_ACTIVITY_LEADS: { key: LiveActivityLead; tk: string }[] = [
  { key: "8h",  tk: "la8h" },
  { key: "6h",  tk: "la6h" },
  { key: "4h",  tk: "la4h" },
  { key: "3h",  tk: "la3h" },
  { key: "2h",  tk: "la2h" },
  { key: "1h",  tk: "la1h" },
  { key: "30m", tk: "la30m" },
  { key: "20m", tk: "la20m" },
  { key: "10m", tk: "la10m" },
  { key: "5m",  tk: "la5m" },
];

function clampLiveActivityLead(l?: LiveActivityLead): LiveActivityLead {
  if (!l) return "1h";
  if (liveActivityLeadMinutes(l) > LIVE_ACTIVITY_MAX_ACTIVE_MINUTES) return "8h";
  return l;
}

/* ─── Form helpers ──────────────────────────────────────────────────────── */

function makeInitial(target: EventSheetTarget | null): CalendarEvent | null {
  if (!target) return null;
  if (target.mode === "edit") {
    const existing = getEvent(target.id);
    return existing ?? null;
  }
  return {
    id: crypto.randomUUID(),
    title: "",
    date: target.date,
    endDate: target.date,
    allDay: false,
    startTime: "09:00",
    endTime: "10:00",
    color: "blue",
    reminders: [],
    repeat: "none",
    location: "",
    notes: "",
    liveActivity: false,
    liveActivityLead: "1h",
  };
}

/* ─── Form body (shared between drawer & modal) ─────────────────────────── */

interface FormBodyProps {
  form: CalendarEvent;
  isNew: boolean;
  notifBlocked: boolean;
  patch: (p: Partial<CalendarEvent>) => void;
  onSave: () => void;
  onRemove: () => void;
  onClose: () => void;
  onEnableNotif: () => void;
}

const selectMenuClass = "z-[100]";

function FormBody({
  form,
  isNew,
  notifBlocked,
  patch,
  onSave,
  onRemove,
  onClose,
  onEnableNotif,
}: FormBodyProps) {
  const { t } = useI18n();

  const selectedReminders: ReminderOffset[] = form.reminders ?? [];

  const toggleReminder = (key: ReminderOffset) => {
    const current = selectedReminders;
    const next = current.includes(key)
      ? current.filter((r) => r !== key)
      : [...current, key];
    patch({ reminders: next });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" data-kb-ignore>
      {/* Fixed header — does not scroll */}
      <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0 border-b border-border/40">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("cancel")}
        </button>
        <h2 className="text-base font-semibold">
          {isNew ? t("newEvent") : t("editEvent")}
        </h2>
        <button
          type="button"
          onClick={() => {
            void hideKeyboard();
            onSave();
          }}
          disabled={!form.title.trim()}
          className="text-sm font-semibold text-accent disabled:opacity-40"
        >
          {t("save")}
        </button>
      </div>

      {/* Native overflow scroll (pre–scrollbar-inset experiments; scrolling worked here). */}
      <div
        className="event-sheet-scroll min-h-0 overflow-y-scroll overscroll-contain px-4 pt-3 pb-6 space-y-3"
        style={{ flex: "1 1 0%" }}
        data-vaul-no-drag=""
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Title + color */}
        <div className="bg-card rounded-2xl p-4 shadow-soft">
          <input
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            enterKeyHint="done"
            onKeyDown={(e) => onDoneKey(e)}
            placeholder={t("eventTitle")}
            className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40"
          />
          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border/50">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => patch({ color: c.key })}
                  aria-label={c.label}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-transform",
                    form.color === c.key
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: `hsl(${c.hsl})` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Location & Notes (directly under title so they stay reachable) */}
        <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
          <div className="px-4 py-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              value={form.location ?? ""}
              onChange={(e) => patch({ location: e.target.value })}
              enterKeyHint="done"
              onKeyDown={(e) => onDoneKey(e)}
              placeholder={t("location")}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="px-4 py-3 flex items-start gap-2">
            <AlignLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder={t("notes")}
              rows={3}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/50 resize-none"
            />
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <CalIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("allDay")}</span>
            </div>
            <Switch
              checked={!!form.allDay}
              onCheckedChange={(v) =>
                patch(v ? { allDay: true, liveActivity: false } : { allDay: false })
              }
            />
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm">{t("startDate")}</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => patch({ date: e.target.value })}
              className="bg-secondary/60 rounded-lg px-3 py-1.5 text-base outline-none"
            />
          </div>
          {!form.allDay && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm">{t("startTime")}</span>
              <input
                type="time"
                value={form.startTime ?? ""}
                onChange={(e) => patch({ startTime: e.target.value })}
                className="bg-secondary/60 rounded-lg px-3 py-1.5 text-base outline-none"
              />
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm">{t("endDate")}</span>
            <input
              type="date"
              value={form.endDate ?? form.date}
              min={form.date}
              onChange={(e) => patch({ endDate: e.target.value })}
              className="bg-secondary/60 rounded-lg px-3 py-1.5 text-base outline-none"
            />
          </div>
          {!form.allDay && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm">{t("endTime")}</span>
              <input
                type="time"
                value={form.endTime ?? ""}
                onChange={(e) => patch({ endTime: e.target.value })}
                className="bg-secondary/60 rounded-lg px-3 py-1.5 text-base outline-none"
              />
            </div>
          )}
        </div>

        {/* Reminders (multi-select chips) */}
        <div className="bg-card rounded-2xl shadow-soft">
          {/* Notification blocked warning */}
          {notifBlocked && isNative() && (
            <div className="px-4 py-3 flex items-start gap-2 bg-amber-50/60 dark:bg-amber-900/20 rounded-t-2xl border-b border-border/50">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
                  {t("notifDisabledInApp")}
                </p>
                <button
                  className="text-xs font-semibold text-accent mt-1"
                  onClick={onEnableNotif}
                >
                  {t("enableNotifications")}
                </button>
              </div>
            </div>
          )}

          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("reminders")}</span>
              {selectedReminders.length > 0 && (
                <span className="text-xs bg-accent/15 text-accent rounded-full px-2 py-0.5">
                  {selectedReminders.length}
                </span>
              )}
            </div>

            {/* Chip grid */}
            <div className="flex flex-wrap gap-1.5">
              {ALL_REMINDERS.map(({ key, tk }) => {
                const active = selectedReminders.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleReminder(key)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                      active
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-secondary/60 text-foreground border-transparent"
                    )}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {t(tk as never)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Repeat */}
        <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{t("repeat")}</span>
            </div>
            <Select
              value={form.repeat ?? "none"}
              onValueChange={(v) => patch({ repeat: v as RepeatFreq })}
            >
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectMenuClass}>
                {REPEATS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {t(r.tk as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Live Activity (iOS only) */}
        {isLiveActivitySupported() && (
        <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{t("liveActivity")}</span>
            </div>
            <Switch
              checked={!!form.liveActivity}
              onCheckedChange={(v) => patch({ liveActivity: v })}
              disabled={!!form.allDay}
            />
          </div>
          {form.liveActivity && !form.allDay && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {t("liveActivityShow")}
              </span>
              <Select
                value={clampLiveActivityLead(form.liveActivityLead)}
                onValueChange={(v) =>
                  patch({ liveActivityLead: v as LiveActivityLead })
                }
              >
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectMenuClass}>
                  {LIVE_ACTIVITY_LEADS.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {t(r.tk as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.liveActivity && (
            <div className="px-4 py-2.5 space-y-1">
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t("liveActivityHint")}
              </p>
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                {t("liveActivityForegroundNote")}
              </p>
            </div>
          )}
        </div>
        )}

        {/* Delete */}
        {!isNew && (
          <button
            type="button"
            onClick={onRemove}
            className="w-full bg-card rounded-2xl shadow-soft px-4 py-3 text-sm font-semibold text-destructive flex items-center justify-center gap-2 hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t("deleteEvent")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main EventSheet component ─────────────────────────────────────────── */

export function EventSheet({ open, onOpenChange, target, variant = "drawer", onSaved, onDeleted }: Props) {
  const { t } = useI18n();
  const targetKey =
    target == null
      ? null
      : target.mode === "edit"
        ? target.id
        : `new:${target.date}`;

  const [form, setForm] = useState<CalendarEvent | null>(null);
  const [notifBlocked, setNotifBlocked] = useState(false);
  const isNew = target?.mode === "new";
  const lastInitKey = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      lastInitKey.current = null;
      return;
    }
    if (!target || targetKey == null) return;
    if (lastInitKey.current === targetKey) return;
    lastInitKey.current = targetKey;
    setForm(makeInitial(target));
  }, [open, targetKey, target]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [variant, open]);

  useEffect(() => {
    if (!open || !isNative()) return;
    void checkPermission().then((perm) => {
      setNotifBlocked(perm !== "granted" || !getNotificationsUserEnabled());
    });
  }, [open]);

  if (!form) {
    if (variant === "modal") return null;
    return (
      <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <></>
      </DrawerPrimitive.Root>
    );
  }

  const patch = (p: Partial<CalendarEvent>) =>
    setForm((f) => (f ? { ...f, ...p } : f));

  const syncSchedules = () => {
    void rescheduleAll();
    void refreshLiveActivities();
    void syncLiveActivitySchedulesRemote();
  };

  const save = () => {
    if (!form.title.trim()) return;
    const endDate =
      !form.endDate || form.endDate < form.date ? form.date : form.endDate;
    upsertEvent({
      ...form,
      title: form.title.trim(),
      endDate,
      location: form.location?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      startTime: form.allDay ? undefined : form.startTime,
      endTime: form.allDay ? undefined : form.endTime,
    });
    syncSchedules();
    onSaved?.();
    onOpenChange(false);
  };

  const remove = () => {
    if (isNew) { onOpenChange(false); return; }
    if (confirm(t("confirmDelete"))) {
      deleteEvent(form.id);
      syncSchedules();
      onDeleted?.();
      onOpenChange(false);
    }
  };

  const handleEnableNotif = async () => {
    const granted = await ensurePermission();
    if (granted) {
      setNotificationsUserEnabled(true);
      void rescheduleAll();
      setNotifBlocked(false);
    }
  };

  const formBodyProps: FormBodyProps = {
    form,
    isNew,
    notifBlocked,
    patch,
    onSave: save,
    onRemove: remove,
    onClose: () => onOpenChange(false),
    onEnableNotif: handleEnableNotif,
  };

  /* ── Modal variant ──────────────────────────────────────────────────── */
  if (variant === "modal") {
    if (!open) return null;
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={() => onOpenChange(false)}
        />
        <div
          className="relative bg-background rounded-3xl w-full max-w-md min-h-0 flex flex-col overflow-hidden shadow-float z-10"
          style={{ maxHeight: "88dvh" }}
        >
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <FormBody {...formBodyProps} />
        </div>
      </div>,
      document.body
    );
  }

  /* ── Drawer variant ─────────────────────────────────────────────────── */
  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      // Drag-to-dismiss from the handle area only — body scroll must not fight the sheet.
      dismissible
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background",
            "min-h-0 overflow-hidden outline-none"
          )}
          style={{ maxHeight: "88dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Drag handle — sheet resize / dismiss gesture lives here */}
          <div className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />
          <FormBody {...formBodyProps} />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
