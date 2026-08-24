import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onPhotos: () => void;
  onCamera: () => void;
  onCancel: () => void;
}

export function ImagePickSheet({ open, onPhotos, onCamera, onCancel }: Props) {
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div
        className="relative z-10 w-full max-w-md rounded-t-3xl bg-background border shadow-float px-4 pt-4 pb-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm font-semibold text-center mb-2">{t("ocrAddImage")}</p>
        <p className="text-xs text-muted-foreground text-center leading-relaxed mb-3 px-1">
          {t("ocrHelp")}
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
    </div>,
    document.body,
  );
}
