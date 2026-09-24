import { useEffect, type ReactNode } from "react";
import { CalendarClock, CircleDot, ListTodo, ScanLine } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";

export type TodoAddKind = "task" | "routine" | "repeat";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: TodoAddKind) => void;
  onScan?: () => void;
}

/**
 * Distinguishes Task / Routine / Repeat Task. None of the three is labeled
 * as a generic "Task" for all options.
 */
export function TodoAddMenu({ open, onOpenChange, onPick, onScan }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  const pick = (kind: TodoAddKind) => {
    onOpenChange(false);
    onPick(kind);
  };

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background outline-none"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <DrawerPrimitive.Title className="px-5 pt-2 pb-3 text-base font-semibold">
            {t("todoAddMenuTitle")}
          </DrawerPrimitive.Title>

          <div className="px-3 pb-2 space-y-1">
            <AddRow
              icon={<ListTodo className="w-5 h-5" aria-hidden="true" />}
              title={t("todoAddTask")}
              hint={t("todoAddTaskHint")}
              onClick={() => pick("task")}
            />
            <AddRow
              icon={<CircleDot className="w-5 h-5" aria-hidden="true" />}
              title={t("todoAddRoutine")}
              hint={t("todoAddRoutineHint")}
              onClick={() => pick("routine")}
            />
            <AddRow
              icon={<CalendarClock className="w-5 h-5" aria-hidden="true" />}
              title={t("todoAddRepeat")}
              hint={t("todoAddRepeatHint")}
              onClick={() => pick("repeat")}
            />
            {onScan ? (
              <AddRow
                icon={<ScanLine className="w-5 h-5" aria-hidden="true" />}
                title={t("todoOcrScan")}
                hint={t("todoOcrScanHint")}
                onClick={() => {
                  onOpenChange(false);
                  onScan();
                }}
              />
            ) : null}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

function AddRow({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-secondary/60"
    >
      <span className="mt-0.5 text-foreground/70">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </button>
  );
}
