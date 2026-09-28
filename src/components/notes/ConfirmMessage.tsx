import { GlassControl } from "@/components/GlassControl";

interface Props {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  testId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered confirmation, in the shape of an iOS alert, with Liquid Glass. */
export function ConfirmMessage({
  open,
  message,
  confirmLabel,
  cancelLabel,
  testId = "confirm-message",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-8"
      data-testid={testId}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button type="button" className="absolute inset-0 bg-black/40" aria-label={cancelLabel} onClick={onCancel} />
      <div className="liquid-glass liquid-glass-surface relative z-10 w-full max-w-[270px] overflow-hidden text-center">
        <p className="px-4 pt-4 pb-3.5 text-[13px] leading-snug text-foreground">{message}</p>
        <div className="flex gap-2 px-3 pb-3">
          <GlassControl size="label" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </GlassControl>
          <GlassControl size="label" className="flex-1 text-red-500 font-semibold" data-testid={`${testId}-confirm`} onClick={onConfirm}>
            {confirmLabel}
          </GlassControl>
        </div>
      </div>
    </div>
  );
}
