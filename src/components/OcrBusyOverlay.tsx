import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

export function OcrBusyOverlay({ open }: { open: boolean }) {
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/25">
      <div className="bg-card rounded-2xl shadow-float px-6 py-5 text-sm font-medium">
        {t("ocrReading")}
      </div>
    </div>,
    document.body,
  );
}
