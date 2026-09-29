import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { PopupCornerControls } from "@/components/PopupCornerControls";

type Props = {
  open: boolean;
  message: string;
  kind?: "info" | "warning";
  onClose: () => void;
};

export function OcrResultSheet({ open, message, kind = "info", onClose }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-result-message"
        className="liquid-glass-surface w-full max-w-sm overflow-hidden rounded-2xl border border-border/60"
      >
        <PopupCornerControls onClose={onClose} closeLabel={t("cancel")} />
        <div className="px-5 pb-5">
        <p
          id="ocr-result-message"
          className={cn(
            "text-sm leading-relaxed",
            kind === "warning" ? "text-foreground" : "text-foreground/90",
          )}
        >
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
        >
          {t("ocrAcknowledge")}
        </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
