import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/events-store";
import {
  rescheduleAll,
  isNative,
  checkPermission,
  ensurePermission,
  getNotificationsUserEnabled,
  setNotificationsUserEnabled,
} from "@/lib/notifications";
import { refreshLiveActivities } from "@/lib/live-activity";
import { useI18n } from "@/lib/i18n";
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
  onSaved?: () => void;
  onDeleted?: () => void;
}

function makeInitial(target: EventSheetTarget | null): CalendarEvent | null {
  if (!target) return null;
  if (target.mode === "edit") {
    const existing = getEvent(target.id);
    if (existing) return existing;
    return null;
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
    reminder: "none",
    repeat: "none",
    location: "",
    notes: "",
    liveActivity: false,
    liveActivityLead: "1h",
  };
}

const REMINDERS: { key: ReminderOffset; tk: string }[] = [
  { key: "none", tk: "reminderNone" },
  { key: "at", tk: "reminderAt" },
  { key: "5m", tk: "reminder5m" },
  { key: "15m", tk: "reminder15m" },
  { key: "30m", tk: "reminder30m" },
  { key: "1h", tk: "reminder1h" },
  { key: "1d", tk: "reminder1d" },
];

const REPEATS: { key: RepeatFreq; tk: string }[] = [
  { key: "none", tk: "repeatNone" },
  { key: "daily", tk: "repeatDaily" },
  { key: "weekly", tk: "repeatWeekly" },
  { key: "monthly", tk: "repeatMonthly" },
  { key: "yearly", tk: "repeatYearly" },
];

const LIVE_ACTIVITY_LEADS: { key: LiveActivityLead; tk: string }[] = [
  { key: "24h", tk: "la24h" },
  { key: "12h", tk: "la12h" },
  { key: "8h", tk: "la8h" },
  { key: "6h", tk: "la6h" },
  { key: "4h", tk: "la4h" },
  { key: "3h", tk: "la3h" },
  { key: "2h", tk: "la2h" },
  { key: "1h", tk: "la1h" },
  { key: "30m", tk: "la30m" },
  { key: "20m", tk: "la20m" },
  { key: "10m", tk: "la10m" },
  { key: "5m", tk: "la5m" },
];

export function EventSheet({ open, onOpenChange, target, onSaved, onDeleted }: Props) {
  const { t } = useI18n();
  const initial = useMemo(() => makeInitial(target), [target, open]);
  const [form, setForm] = useState<CalendarEvent | null>(initial);
  const [notifBlocked, setNotifBlocked] = useState(false);
  const isNew = target?.mode === "new";

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  useEffect(() => {
    if (!open || !isNative()) return;
    void checkPermission().then((perm) => {
      setNotifBlocked(perm !== "granted" || !getNotificationsUserEnabled());
    });
  }, [open]);

  if (!form) {
    return (
      <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <></>
      </DrawerPrimitive.Root>
    );
  }

  const patch = (p: Partial<CalendarEvent>) =>
    setForm((f) => (f ? { ...f, ...p } : f));

  const syncSchedules = () => {
    // Fire-and-forget; these are no-ops on web.
    void rescheduleAll();
    void refreshLiveActivities();
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
    if (isNew) {
      onOpenChange(false);
      return;
    }
    if (confirm(t("confirmDelete"))) {
      deleteEvent(form.id);
      syncSchedules();
      onDeleted?.();
      onOpenChange(false);
    }
  };

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background",
            "max-h-[85vh] outline-none"
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-2 pb-3">
            <button
              onClick={() => onOpenChange(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t("cancel")}
            </button>
            <DrawerPrimitive.Title className="text-base font-semibold">
              {isNew ? t("newEvent") : t("editEvent")}
            </DrawerPrimitive.Title>
            <button
              onClick={save}
              disabled={!form.title.trim()}
              className="text-sm font-semibold text-accent disabled:opacity-40"
            >
              {t("save")}
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
            {/* Title + color */}
            <div className="bg-card rounded-2xl p-4 shadow-soft">
              <input
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder={t("eventTitle")}
                className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/40"
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

            {/* Date & Time */}
            <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <CalIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t("allDay")}</span>
                </div>
                <Switch
                  checked={!!form.allDay}
                  onCheckedChange={(v) => patch({ allDay: v })}
                />
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm">{t("startDate")}</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => patch({ date: e.target.value })}
                  className="bg-secondary/60 rounded-lg px-3 py-1.5 text-sm outline-none"
                />
              </div>
              {!form.allDay && (
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm">{t("startTime")}</span>
                  <input
                    type="time"
                    value={form.startTime ?? ""}
                    onChange={(e) => patch({ startTime: e.target.value })}
                    className="bg-secondary/60 rounded-lg px-3 py-1.5 text-sm outline-none"
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
                  className="bg-secondary/60 rounded-lg px-3 py-1.5 text-sm outline-none"
                />
              </div>
              {!form.allDay && (
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm">{t("endTime")}</span>
                  <input
                    type="time"
                    value={form.endTime ?? ""}
                    onChange={(e) => patch({ endTime: e.target.value })}
                    className="bg-secondary/60 rounded-lg px-3 py-1.5 text-sm outline-none"
                  />
                </div>
              )}
            </div>

            {/* Reminder & Repeat */}
            <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
              {notifBlocked && isNative() && (
                <div className="px-4 py-3 flex items-start gap-2 bg-amber-50/60 dark:bg-amber-900/20 rounded-t-2xl">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {t("notifDisabledInApp")}
                    </p>
                    <button
                      className="text-xs font-semibold text-accent mt-1 underline underline-offset-2"
                      onClick={async () => {
                        const granted = await ensurePermission();
                        if (granted) {
                          setNotificationsUserEnabled(true);
                          void rescheduleAll();
                          setNotifBlocked(false);
                        }
                      }}
                    >
                      {t("enableNotifications")}
                    </button>
                  </div>
                </div>
              )}
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{t("reminder")}</span>
                </div>
                <Select
                  value={form.reminder ?? "none"}
                  onValueChange={(v) => patch({ reminder: v as ReminderOffset })}
                >
                  <SelectTrigger className="w-[170px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDERS.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {t(r.tk as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{t("repeat")}</span>
                </div>
                <Select
                  value={form.repeat ?? "none"}
                  onValueChange={(v) => patch({ repeat: v as RepeatFreq })}
                >
                  <SelectTrigger className="w-[170px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEATS.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {t(r.tk as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Live Activity */}
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
                    value={form.liveActivityLead ?? "1h"}
                    onValueChange={(v) =>
                      patch({ liveActivityLead: v as LiveActivityLead })
                    }
                  >
                    <SelectTrigger className="w-[170px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                <div className="px-4 py-2.5">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t("liveActivityHint")}
                  </p>
                </div>
              )}
            </div>

            {/* Location & Notes */}
            <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/50">
              <div className="px-4 py-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  value={form.location ?? ""}
                  onChange={(e) => patch({ location: e.target.value })}
                  placeholder={t("location")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="px-4 py-3 flex items-start gap-2">
                <AlignLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder={t("notes")}
                  rows={3}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 resize-none"
                />
              </div>
            </div>

            {!isNew && (
              <button
                onClick={remove}
                className="w-full bg-card rounded-2xl shadow-soft px-4 py-3 text-sm font-semibold text-destructive flex items-center justify-center gap-2 hover:bg-destructive/5 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t("deleteEvent")}
              </button>
            )}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
