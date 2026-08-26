import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  message: string;
  kind?: "info" | "warning";
  onClose: () => void;
};

export function OcrResultSheet({ open, message, kind = "info", onClose }: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-black/30">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-result-message"
        className="w-full max-w-sm bg-card rounded-2xl shadow-float border border-border/60 px-5 py-5"
      >
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
    </div>,
    document.body,
  );
}
