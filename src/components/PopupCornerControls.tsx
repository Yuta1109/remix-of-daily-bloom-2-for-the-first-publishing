import { useId, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { GlassControl } from "@/components/GlassControl";

interface Props {
  onClose: () => void;
  closeLabel: string;
  /** Centered in this fixed row. Stays out of the scrolling content. */
  title?: ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  closeTestId?: string;
  confirmTestId?: string;
}

/**
 * Fixed popup header. Close stays at the leading edge, the title stays in
 * the center column, and confirm stays at the trailing edge.
 */
export function PopupCornerControls({
  onClose,
  closeLabel,
  title,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  closeTestId,
  confirmTestId,
}: Props) {
  const id = useId();
  return (
    <div data-popup-header="" className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center px-4 pt-3 pb-1">
      <GlassControl
        nativeGlass={{ id: `${id}-close`, role: "close" }}
        onClick={onClose}
        aria-label={closeLabel}
        data-testid={closeTestId}
        className="justify-self-start"
      >
        <X className="w-5 h-5" aria-hidden="true" />
      </GlassControl>
      <div className="min-w-0 text-center">{title}</div>
      {onConfirm ? (
        <GlassControl
          nativeGlass={{ id: `${id}-check`, role: "check" }}
          onClick={onConfirm}
          disabled={confirmDisabled}
          aria-label={confirmLabel}
          data-testid={confirmTestId}
          className="justify-self-end"
        >
          <Check className="w-5 h-5" aria-hidden="true" />
        </GlassControl>
      ) : (
        <span className="inline-block h-11 w-11 justify-self-end" aria-hidden="true" />
      )}
    </div>
  );
}
