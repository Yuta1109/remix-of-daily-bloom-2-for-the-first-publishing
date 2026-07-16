import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

const INPUT_SELECTOR = "input:not([type=hidden]), textarea, select";
const GAP = 16;
/** Ignore sub-pixel / animation jitter between adjust passes. */
const SHIFT_EPS = 3;

function isInput(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(INPUT_SELECTOR);
}

let focused: HTMLElement | null = null;
let keyboardHeight = 0;
let adjustTimer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;

let paddedScroller: HTMLElement | null = null;
let liftedShell: HTMLElement | null = null;
let shellShiftPx = 0;
let rootShiftPx = 0;

function applyRootShift(px: number) {
  const amount = Math.max(0, Math.round(px));
  // Always allow clearing to 0; skip only tiny non-zero jitter.
  if (amount > 0 && Math.abs(amount - rootShiftPx) < SHIFT_EPS) return;
  if (amount === 0 && rootShiftPx === 0) return;
  rootShiftPx = amount;
  document.documentElement.style.setProperty("--kb-shift", `${amount}px`);
}

function clearShellLift(shell: HTMLElement) {
  shell.style.bottom = "";
  shell.style.maxHeight = "";
  shell.style.transform = "";
  shell.style.transition = "";
}

function applyShellLift(shell: HTMLElement | null, px: number) {
  if (liftedShell && liftedShell !== shell) {
    clearShellLift(liftedShell);
    liftedShell = null;
    shellShiftPx = 0;
  }
  const amount = Math.max(0, Math.round(px));
  if (shell && amount > 0 && Math.abs(amount - shellShiftPx) < SHIFT_EPS) {
    return;
  }
  if (!shell || amount <= 0) {
    if (shell) clearShellLift(shell);
    else if (liftedShell) clearShellLift(liftedShell);
    liftedShell = null;
    shellShiftPx = 0;
    return;
  }
  liftedShell = shell;
  shellShiftPx = amount;
  const mode = shell.dataset.kbShell || "translate";
  // No CSS transition — animated overshoot was the “jump up then settle” bug.
  shell.style.transition = "none";
  if (mode === "bottom") {
    shell.style.bottom = `${amount}px`;
    shell.style.maxHeight = `${Math.max(160, window.innerHeight - amount)}px`;
    shell.style.transform = "";
  } else {
    shell.style.bottom = "";
    shell.style.maxHeight = "";
    shell.style.transform = `translateY(-${amount}px)`;
  }
}

function setScrollerPad(scroller: HTMLElement | null, pad: number) {
  if (paddedScroller && paddedScroller !== scroller) {
    paddedScroller.style.paddingBottom = "";
  }
  paddedScroller = scroller;
  if (!scroller) return;
  const value = Math.max(0, Math.round(pad));
  const next = value > 0 ? `${value}px` : "";
  if (scroller.style.paddingBottom === next) return;
  scroller.style.paddingBottom = next;
}

function resetLifts() {
  applyRootShift(0);
  applyShellLift(null, 0);
  setScrollerPad(null, 0);
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/auto|scroll|overlay/.test(style.overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findShell(el: HTMLElement): HTMLElement | null {
  return el.closest("[data-kb-shell]") as HTMLElement | null;
}

function isInsideRoot(el: HTMLElement): boolean {
  const root = document.getElementById("root");
  return !!(root && root.contains(el));
}

function shouldIgnore(el: HTMLElement): boolean {
  return !!el.closest("[data-kb-ignore]");
}

/**
 * Prefer Capacitor's keyboard height on native.
 * Do not fall back to visualViewport while the keyboard is opening — that
 * transient height caused a large lift followed by a correction (bounce).
 */
function keyboardPx(): number {
  if (keyboardHeight > 0) return keyboardHeight;
  if (Capacitor.isNativePlatform()) return 0;
  if (window.visualViewport) {
    return Math.max(
      0,
      window.innerHeight -
        window.visualViewport.height -
        window.visualViewport.offsetTop
    );
  }
  return 0;
}

function adjustForKeyboard() {
  if (!focused) {
    resetLifts();
    return;
  }
  if (shouldIgnore(focused)) {
    resetLifts();
    return;
  }

  const kb = keyboardPx();
  // Native: wait for keyboardWillShow before moving anything.
  if (kb <= 0) return;

  const viewH = window.innerHeight;
  const visibleBottom = viewH - kb - GAP;
  const visibleTop = GAP;

  const shell = findShell(focused);
  const inRoot = isInsideRoot(focused);
  const scroller = findScrollParent(focused);

  if (shell || !inRoot) {
    applyRootShift(0);
  }

  // Modest pad so inner lists can scroll the field up; avoid kb+GAP double-lift.
  setScrollerPad(scroller, Math.round(kb * 0.5));

  // Measure after pad is applied.
  const run = () => {
    if (!focused || shouldIgnore(focused)) return;

    const activeShift = shell ? shellShiftPx : inRoot ? rootShiftPx : 0;
    const rect = focused.getBoundingClientRect();
    let unshiftedBottom = rect.bottom + activeShift;
    let unshiftedTop = rect.top + activeShift;
    let remaining = unshiftedBottom - visibleBottom;

    if (remaining > 0 && scroller) {
      const before = scroller.scrollTop;
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const scrollBy = Math.min(remaining, Math.max(0, maxScroll - before));
      if (scrollBy > 0) {
        scroller.scrollTop = before + scrollBy;
        remaining -= scrollBy;
        unshiftedBottom -= scrollBy;
        unshiftedTop -= scrollBy;
      }
    }

    if (remaining <= 0 && unshiftedTop < visibleTop && scroller) {
      const back = visibleTop - unshiftedTop;
      const prev = scroller.scrollTop;
      scroller.scrollTop = Math.max(0, prev - back);
      remaining += prev - scroller.scrollTop;
    }

    if (remaining <= SHIFT_EPS) {
      // Already visible — keep current lift (do not yank down mid-frame).
      return;
    }

    if (shell) {
      applyRootShift(0);
      applyShellLift(shell, remaining);
    } else if (inRoot) {
      applyShellLift(null, 0);
      applyRootShift(remaining);
    } else {
      applyRootShift(0);
    }
  };

  requestAnimationFrame(run);
}

function scheduleAdjust(delay = 32) {
  clearTimeout(adjustTimer);
  adjustTimer = setTimeout(() => {
    requestAnimationFrame(adjustForKeyboard);
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
  resetLifts();
}

export function initKeyboardAvoidance(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  document.addEventListener(
    "focusin",
    (e) => {
      if (!isInput(e.target)) return;
      focused = e.target;
      if (shouldIgnore(focused)) {
        resetLifts();
        return;
      }
      // Native: wait for keyboardWillShow (avoids speculative overshoot).
      if (!Capacitor.isNativePlatform()) scheduleAdjust(60);
      else if (keyboardHeight > 0) scheduleAdjust(16);
    },
    true
  );

  document.addEventListener(
    "focusout",
    () => {
      setTimeout(() => {
        if (!isInput(document.activeElement)) {
          focused = null;
          if (keyboardHeight <= 0) resetLifts();
        }
      }, 80);
    },
    true
  );

  // Web only — on native, visualViewport flicker caused the bounce.
  if (!Capacitor.isNativePlatform() && window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => scheduleAdjust(30));
  }

  if (!Capacitor.isNativePlatform()) return;

  try {
    Keyboard.addListener("keyboardWillShow", (info) => {
      keyboardHeight = info.keyboardHeight ?? 0;
      scheduleAdjust(0);
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      const next = info.keyboardHeight ?? 0;
      if (Math.abs(next - keyboardHeight) >= SHIFT_EPS) {
        keyboardHeight = next;
        scheduleAdjust(0);
      }
    });
    Keyboard.addListener("keyboardWillHide", () => {
      keyboardHeight = 0;
      resetLifts();
    });
    Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeight = 0;
      resetLifts();
    });
  } catch {
    /* plugin unavailable */
  }
}

export function scrollInputAboveKeyboard(el: HTMLElement): void {
  focused = el;
  if (shouldIgnore(el)) {
    resetLifts();
    return;
  }
  if (!Capacitor.isNativePlatform()) scheduleAdjust(60);
  else if (keyboardHeight > 0) scheduleAdjust(16);
}

export function onDoneKey(
  e: ReactKeyboardEvent<HTMLElement>,
  extra?: () => void
): void {
  if (e.key !== "Enter") return;
  e.preventDefault();
  extra?.();
  void hideKeyboard();
}
