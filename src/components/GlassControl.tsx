import { useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNativeGlass } from "@/hooks/use-native-glass";
import type { NativeGlassRole } from "@/lib/native-glass";

export type GlassVariant = "regular" | "prominent" | "bar";

/** Roles a single button can hand to the shared native Liquid Glass overlay. */
export type NativeGlassButtonRole = Exclude<NativeGlassRole, "search" | "tabBar" | "surface">;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlassVariant;
  /** Circle diameter. Label is a shorter capsule for short text. */
  size?: "regular" | "prominent" | "label";
  /**
   * Opt this control into the shared native overlay.
   * iOS 26 draws system Liquid Glass on this button's frame and keeps the
   * React click handler. Other platforms keep the CSS material.
   */
  nativeGlass?: {
    /** Stable id when a control should morph. Omitted ids stay unique per instance. */
    id?: string;
    role: NativeGlassButtonRole;
    symbol?: string;
    /** Tints the native control without changing the CSS variant. */
    selected?: boolean;
  };
  children?: ReactNode;
}

/**
 * Shared control. CSS `.liquid-glass` is the material everywhere native glass
 * is unavailable. `nativeGlass` reuses the same role components on iOS 26.
 */
export function GlassControl({
  variant = "regular",
  size = "regular",
  nativeGlass,
  className,
  children,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  "aria-label": ariaLabel,
  ...props
}: Props) {
  const [pressed, setPressed] = useState(false);
  const [visibleLabel, setVisibleLabel] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const autoId = useId();
  const role: NativeGlassButtonRole =
    nativeGlass?.role ?? (size === "label" || variant === "bar" ? "button" : "icon");
  const symbol =
    nativeGlass?.symbol ??
    (role === "icon" && (variant === "prominent" || size === "prominent") ? "plus" : "");
  const prominent =
    role === "check" ||
    nativeGlass?.selected === true ||
    (variant === "prominent" && role !== "back" && role !== "close");
  useLayoutEffect(() => {
    const raw = buttonRef.current?.innerText ?? buttonRef.current?.textContent ?? "";
    const text = raw.replace(/\s+/g, " ").trim();
    setVisibleLabel((current) => (current === text ? current : text));
  }, [children]);
  useNativeGlass(buttonRef, {
    id: nativeGlass?.id ?? autoId,
    role,
    symbol,
    prominent,
    label: ariaLabel || visibleLabel,
    enabled: !disabled,
  });

  return (
    <button
      type="button"
      disabled={disabled}
      data-pressed={pressed && !disabled ? "true" : undefined}
      data-glass={variant}
      aria-label={ariaLabel}
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
      ref={buttonRef}
    >
      {children}
    </button>
  );
}
