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

/** Scroll parent that currently has keyboard bottom padding. */
let paddedScroller: HTMLElement | null = null;
/** Overlay shell currently lifted (`[data-kb-shell]`). */
let liftedShell: HTMLElement | null = null;
/** Absolute px the current shell is lifted (for unshifted math). */
let shellShiftPx = 0;

function getRootShift(): number {
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
  }
  const amount = Math.max(0, Math.round(px));
  shellShiftPx = amount;
  if (!shell || amount <= 0) {
    if (shell) clearShellLift(shell);
    liftedShell = null;
    shellShiftPx = 0;
    return;
  }
  liftedShell = shell;
  const mode = shell.dataset.kbShell || "translate";
  shell.style.transition =
    "transform 0.2s ease-out, bottom 0.2s ease-out, max-height 0.2s ease-out";
  if (mode === "bottom") {
    // Bottom sheets (vaul): lift via `bottom` so we don't fight drawer's transform.
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
  scroller.style.paddingBottom = value > 0 ? `${value}px` : "";
}

function resetLifts() {
  applyRootShift(0);
  applyShellLift(null, 0);
  setScrollerPad(null, 0);
}

/** Nearest overflow-y scroller (need not already overflow — we may pad it). */
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

function keyboardPx(): number {
  if (keyboardHeight > 0) return keyboardHeight;
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

/**
 * Keep the focused field above the keyboard.
 * - In-page (#root): scroll inner scroller first, then lift #root.
 * - Overlay (`[data-kb-shell]`): never lift #root (avoids shifting the page behind).
 *   Pad the overlay scroller so it can scroll; lift the shell for the rest.
 */
function shouldIgnore(el: HTMLElement): boolean {
  return !!el.closest("[data-kb-ignore]");
}

function adjustForKeyboard() {
  if (!focused) {
    resetLifts();
    return;
  }

  // Event sheets opt out — keyboard lift was breaking their scroll.
  if (shouldIgnore(focused)) {
    resetLifts();
    return;
  }

  const kb = keyboardPx();
  if (kb <= 0) {
    resetLifts();
    return;
  }

  const viewH = window.innerHeight;
  const visibleBottom = viewH - kb - GAP;
  const visibleTop = GAP + (window.visualViewport?.offsetTop ?? 0);

  const shell = findShell(focused);
  const inRoot = isInsideRoot(focused);
  const scroller = findScrollParent(focused);

  // Overlay focus must never move the page behind the portal.
  if (shell || !inRoot) {
    applyRootShift(0);
  }

  // Make the scroller tall enough that the field can be scrolled above the keyboard.
  setScrollerPad(scroller, kb + GAP);

  const reveal = () => {
    if (!focused) return;

    // Convert to unshifted coordinates so repeated adjusts stay stable.
    const activeShift = shell ? shellShiftPx : inRoot ? getRootShift() : 0;
    let rect = focused.getBoundingClientRect();
    let unshiftedBottom = rect.bottom + activeShift;
    let unshiftedTop = rect.top + activeShift;
    let remaining = unshiftedBottom - visibleBottom;

    if (remaining > 0 && scroller) {
      const before = scroller.scrollTop;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
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
      const actual = prev - scroller.scrollTop;
      remaining += actual;
      unshiftedTop += actual;
      unshiftedBottom += actual;
    }

    // Visible with current scroll/lift — keep lift; don't yank the UI back down.
    if (remaining <= 0 && unshiftedTop >= visibleTop - 1) {
      return;
    }

    const lift = Math.max(0, remaining);
    if (shell) {
      applyRootShift(0);
      applyShellLift(shell, lift);
    } else if (inRoot) {
      applyShellLift(null, 0);
      applyRootShift(lift);
    } else {
      // Portal without data-kb-shell: last resort — do not lift #root.
      applyRootShift(0);
    }
  };

  // Padding changes layout; measure after paint.
  requestAnimationFrame(() => requestAnimationFrame(reveal));
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
  resetLifts();
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
      setTimeout(() => {
        if (!isInput(document.activeElement)) {
          focused = null;
          if (keyboardHeight <= 0) resetLifts();
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
