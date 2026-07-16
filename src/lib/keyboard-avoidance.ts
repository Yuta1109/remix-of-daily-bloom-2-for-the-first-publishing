import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

const INPUT_SELECTOR = "input:not([type=hidden]), textarea, select";
const GAP = 20;

function isInput(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(INPUT_SELECTOR);
}

let focused: HTMLElement | null = null;
let keyboardHeight = 0;
let adjustTimer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;

function getShift(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--kb-shift")
    .trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function applyRootShift(px: number) {
  document.documentElement.style.setProperty(
    "--kb-shift",
    `${Math.max(0, Math.round(px))}px`
  );
}

function resetRootShift() {
  applyRootShift(0);
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const scrollable =
      /auto|scroll|overlay/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1;
    if (scrollable) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Lift the whole app (#root) so the focused field sits above the keyboard.
 * Prefer scrolling an inner scroller first; use remaining delta as root shift.
 * With Capacitor Keyboard resize:"none", the WebView stays full-height.
 */
function adjustForKeyboard() {
  if (!focused) {
    resetRootShift();
    return;
  }

  const currentShift = getShift();
  const rect = focused.getBoundingClientRect();
  // Undo current shift to work in "unshifted" space.
  const unshiftedBottom = rect.bottom + currentShift;
  const unshiftedTop = rect.top + currentShift;

  const viewH = window.innerHeight;
  const kb = keyboardHeight > 0
    ? keyboardHeight
    : window.visualViewport
      ? Math.max(0, viewH - window.visualViewport.height - window.visualViewport.offsetTop)
      : 0;

  if (kb <= 0) {
    resetRootShift();
    return;
  }

  const visibleBottom = viewH - kb - GAP;
  const visibleTop = GAP + (window.visualViewport?.offsetTop ?? 0);

  let remaining = unshiftedBottom - visibleBottom;

  if (remaining > 0) {
    const parent = findScrollParent(focused);
    if (parent) {
      const before = parent.scrollTop;
      const maxScroll = parent.scrollHeight - parent.clientHeight;
      const scrollBy = Math.min(remaining, Math.max(0, maxScroll - before));
      if (scrollBy > 0) {
        parent.scrollTop = before + scrollBy;
        remaining -= scrollBy;
      }
    }
  }

  // If field is above the visible top after scroll, scroll back a bit.
  if (remaining <= 0) {
    const afterRect = focused.getBoundingClientRect();
    const afterTop = afterRect.top + getShift();
    if (afterTop < visibleTop) {
      const parent = findScrollParent(focused);
      if (parent) {
        parent.scrollTop = Math.max(0, parent.scrollTop - (visibleTop - afterTop));
      }
    }
    // Still need root shift if bottom is clipped
    const finalRect = focused.getBoundingClientRect();
    const need = finalRect.bottom + getShift() - visibleBottom;
    applyRootShift(Math.max(0, need));
    return;
  }

  applyRootShift(remaining);
}

function scheduleAdjust(delay = 40) {
  clearTimeout(adjustTimer);
  adjustTimer = setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(adjustForKeyboard));
  }, delay);
}

export async function hideKeyboard(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Keyboard.hide();
    }
  } catch {
    /* ignore */
  }
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
  focused = null;
  keyboardHeight = 0;
  resetRootShift();
}

/** Install global keyboard / visualViewport listeners once at startup. */
export function initKeyboardAvoidance(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  document.addEventListener(
    "focusin",
    (e) => {
      if (!isInput(e.target)) return;
      focused = e.target;
      scheduleAdjust(60);
    },
    true
  );

  document.addEventListener(
    "focusout",
    () => {
      // Delay: focus may move to another input.
      setTimeout(() => {
        if (!isInput(document.activeElement)) {
          focused = null;
          if (keyboardHeight <= 0) resetRootShift();
        }
      }, 80);
    },
    true
  );

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", () => scheduleAdjust(30));
    vv.addEventListener("scroll", () => scheduleAdjust(30));
  }

  if (!Capacitor.isNativePlatform()) return;

  try {
    Keyboard.addListener("keyboardWillShow", (info) => {
      keyboardHeight = info.keyboardHeight ?? 0;
      scheduleAdjust(16);
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      keyboardHeight = info.keyboardHeight ?? 0;
      scheduleAdjust(16);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      keyboardHeight = 0;
      resetRootShift();
    });
    Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeight = 0;
      resetRootShift();
    });
  } catch {
    /* plugin unavailable */
  }
}

/** Explicit call from inputs onFocus. */
export function scrollInputAboveKeyboard(el: HTMLElement): void {
  focused = el;
  scheduleAdjust(60);
}

/** For single-line fields: Enter dismisses the keyboard. */
export function onDoneKey(
  e: ReactKeyboardEvent<HTMLElement>,
  extra?: () => void
): void {
  if (e.key !== "Enter") return;
  e.preventDefault();
  extra?.();
  void hideKeyboard();
}
