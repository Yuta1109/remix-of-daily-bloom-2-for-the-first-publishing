import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { PopupCornerControls } from "@/components/PopupCornerControls";

interface Props {
  open: boolean;
  onPhotos: () => void;
  onCamera: () => void;
  onCancel: () => void;
  /** Overrides the default recognition help. Notes attach uses a photo-only line. */
  help?: string;
}

export function ImagePickSheet({ open, onPhotos, onCamera, onCancel, help }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onCancel} aria-label={t("cancel")} />
      <div
        className="liquid-glass liquid-glass-sheet relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <PopupCornerControls
          onClose={onCancel}
          closeLabel={t("cancel")}
          title={<p className="truncate text-sm font-semibold">{t("ocrAddImage")}</p>}
        />
        <div className="px-4">
        <p className="text-xs text-muted-foreground text-center leading-relaxed mb-1 px-1">
          {help ?? t("ocrHelp")}
        </p>
        <button
          type="button"
          onClick={onPhotos}
          className="w-full rounded-xl bg-secondary py-3 text-sm font-medium mb-2"
        >
          {t("ocrPickPhotos")}
        </button>
        <button
          type="button"
          onClick={onCamera}
          className="w-full rounded-xl bg-secondary py-3 text-sm font-medium mb-2"
        >
          {t("ocrTakePhoto")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-xl py-3 text-sm text-muted-foreground"
        >
          {t("cancel")}
        </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
