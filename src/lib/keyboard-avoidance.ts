const INPUT_SELECTOR = "input:not([type=hidden]), textarea, select";

function isInput(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(INPUT_SELECTOR);
}

let focused: HTMLElement | null = null;
let adjustTimer: ReturnType<typeof setTimeout> | undefined;

function resetRootShift() {
  document.documentElement.style.setProperty("--kb-shift", "0px");
}

function applyRootShift(px: number) {
  document.documentElement.style.setProperty("--kb-shift", `${Math.max(0, px)}px`);
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const scrollable =
      /auto|scroll|overlay/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1;
    if (scrollable) return node;
    node = node.parentElement;
  }
  return null;
}

function scrollParentBy(el: HTMLElement, delta: number) {
  const parent = findScrollParent(el);
  if (parent) parent.scrollTop += delta;
}

function adjustForKeyboard() {
  if (!focused || !window.visualViewport) {
    resetRootShift();
    return;
  }

  const vv = window.visualViewport;
  const gap = 16;
  const visibleBottom = vv.offsetTop + vv.height - gap;
  const visibleTop = vv.offsetTop + gap;
  const rect = focused.getBoundingClientRect();

  if (rect.bottom > visibleBottom) {
    const delta = rect.bottom - visibleBottom;
    scrollParentBy(focused, delta);
    const after = focused.getBoundingClientRect();
    const remaining = after.bottom - visibleBottom;
    applyRootShift(remaining > 0 ? remaining : 0);
    return;
  }

  if (rect.top < visibleTop) {
    scrollParentBy(focused, rect.top - visibleTop);
  }

  resetRootShift();
}

function scheduleAdjust() {
  clearTimeout(adjustTimer);
  adjustTimer = setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(adjustForKeyboard));
  }, 50);
}

let initialized = false;

/** Install global keyboard / visualViewport listeners once at startup. */
export function initKeyboardAvoidance(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  document.addEventListener(
    "focusin",
    (e) => {
      if (!isInput(e.target)) return;
      focused = e.target;
      scheduleAdjust();
    },
    true
  );

  document.addEventListener(
    "focusout",
    () => {
      focused = null;
      setTimeout(resetRootShift, 120);
    },
    true
  );

  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener("resize", scheduleAdjust);
  vv.addEventListener("scroll", scheduleAdjust);
}

/** Scroll/focus helper for explicit calls from inputs. */
export function scrollInputAboveKeyboard(el: HTMLElement): void {
  focused = el;
  scheduleAdjust();
}
