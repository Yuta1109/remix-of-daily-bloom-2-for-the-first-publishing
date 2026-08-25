import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

export function OcrBusyOverlay({ open }: { open: boolean }) {
  const { t } = useI18n();
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!open) return;
    setDots(1);
    const id = window.setInterval(() => {
      setDots((n) => (n % 3) + 1);
    }, 420);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/25">
      <div className="bg-card rounded-2xl shadow-float px-6 py-5 text-sm font-medium tabular-nums">
        {t("ocrReading")}
        {".".repeat(dots)}
      </div>
    </div>,
    document.body,
  );
}
