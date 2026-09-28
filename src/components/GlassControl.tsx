import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GlassVariant = "regular" | "prominent" | "bar";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlassVariant;
  /** Circle diameter. Label is a 36px-tall capsule for short text. */
  size?: "regular" | "prominent" | "label";
  children?: ReactNode;
}

/**
 * Shared WebView Liquid Glass control. Variants are modifiers on `.liquid-glass`,
 * not a second material.
 */
export function GlassControl({
  variant = "regular",
  size = "regular",
  className,
  children,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: Props) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      data-pressed={pressed && !disabled ? "true" : undefined}
      data-glass={variant}
      className={cn(
        "liquid-glass inline-flex items-center justify-center relative",
        variant === "regular" && size !== "label" && "liquid-glass-regular",
        variant === "prominent" && "liquid-glass-accent",
        variant === "bar" && "liquid-glass-bar",
        size === "prominent" && "liquid-glass-prominent-size",
        size === "label" && "liquid-glass-label",
        className,
      )}
      onPointerDown={(event) => {
        if (!disabled) {
          event.currentTarget.dataset.pressed = "true";
          setPressed(true);
        }
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        delete event.currentTarget.dataset.pressed;
        setPressed(false);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        delete event.currentTarget.dataset.pressed;
        setPressed(false);
        onPointerCancel?.(event);
      }}
      onPointerLeave={(event) => {
        delete event.currentTarget.dataset.pressed;
        setPressed(false);
        onPointerLeave?.(event);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
