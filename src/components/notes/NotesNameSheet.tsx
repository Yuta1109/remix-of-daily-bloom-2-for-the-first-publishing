import { useEffect, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";

interface Props {
  open: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
}

export function NotesNameSheet({
  open,
  title,
  placeholder,
  initialValue = "",
  confirmLabel,
  onOpenChange,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background outline-none px-4 pt-3"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          aria-describedby={undefined}
        >
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <DrawerPrimitive.Title className="text-base font-semibold mb-3">{title}</DrawerPrimitive.Title>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus={open}
            data-testid="notes-name-input"
            className="w-full rounded-xl bg-secondary/70 px-3 py-3 text-[17px] outline-none mb-3"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <div className="flex gap-2 pb-2">
            <button
              type="button"
              className="flex-1 min-h-11 rounded-xl text-[15px] text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              data-testid="notes-name-submit"
              className="flex-1 min-h-11 rounded-xl bg-accent text-accent-foreground text-[15px] font-medium disabled:opacity-40"
              disabled={!value.trim()}
              onClick={submit}
            >
              {confirmLabel ?? t("add")}
            </button>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
