import { useId } from "react";
import { Check, X } from "lucide-react";
import { GlassControl } from "@/components/GlassControl";

interface Props {
  onClose: () => void;
  closeLabel: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  closeTestId?: string;
  confirmTestId?: string;
}

/**
 * Popup chrome: close at the popup's top-left, confirm at the top-right.
 * The title stays outside this row so the two controls never share a slot
 * and never sit in a centered header.
 */
export function PopupCornerControls({
  onClose,
  closeLabel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  closeTestId,
  confirmTestId,
}: Props) {
  const id = useId();
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <GlassControl
        nativeGlass={{ id: `${id}-close`, role: "close" }}
        onClick={onClose}
        aria-label={closeLabel}
        data-testid={closeTestId}
      >
        <X className="w-5 h-5" aria-hidden="true" />
      </GlassControl>
      {onConfirm ? (
        <GlassControl
          nativeGlass={{ id: `${id}-check`, role: "check" }}
          onClick={onConfirm}
          disabled={confirmDisabled}
          aria-label={confirmLabel}
          data-testid={confirmTestId}
        >
          <Check className="w-5 h-5" aria-hidden="true" />
        </GlassControl>
      ) : null}
    </div>
  );
}
