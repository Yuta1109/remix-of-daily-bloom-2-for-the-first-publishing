import { X } from "lucide-react";
import { GlassControl } from "@/components/GlassControl";

interface Props {
  src: string;
  closeLabel: string;
  onClose: () => void;
}

export function ImagePreview({ src, closeLabel, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[90] bg-black flex items-center justify-center"
      data-testid="note-image-preview"
      role="dialog"
      aria-modal="true"
    >
      <GlassControl
        aria-label={closeLabel}
        data-testid="note-image-preview-close"
        onClick={onClose}
        className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 z-10 text-foreground"
      >
        <X className="w-5 h-5" aria-hidden="true" />
      </GlassControl>
      <img src={src} alt="" className="max-w-full max-h-full w-auto h-auto object-contain" />
    </div>
  );
}
