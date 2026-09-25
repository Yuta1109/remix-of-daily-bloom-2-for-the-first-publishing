interface Props {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  testId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

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
    <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-6" data-testid={testId}>
      <button type="button" className="absolute inset-0 bg-black/30" aria-label={cancelLabel} onClick={onCancel} />
      <div className="liquid-glass relative z-10 w-full max-w-md rounded-2xl p-4">
        <p className="text-[16px] mb-4">{message}</p>
        <div className="flex gap-2">
          <button type="button" className="flex-1 min-h-11 rounded-xl bg-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid={`${testId}-confirm`}
            className="flex-1 min-h-11 rounded-xl bg-accent text-accent-foreground"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
