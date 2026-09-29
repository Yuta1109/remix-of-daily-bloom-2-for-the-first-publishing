import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * Boundary between the React page and native Liquid Glass.
 *
 * React keeps the page, the handlers, and the CSS material. On iOS 26 it
 * measures opted-in controls and the native overlay draws system glass on
 * those frames only. Taps come back here and run the existing DOM handler.
 * Everywhere else — web, older iOS, or a control that did not opt in — the
 * CSS `.liquid-glass` material stays visible.
 */

export type NativeGlassRole =
  | "button"
  | "back"
  | "close"
  | "check"
  | "icon"
  | "switch"
  | "search"
  | "tabBar"
  | "surface";

export interface NativeGlassTabSpec {
  id: string;
  label: string;
  symbol: string;
  selected: boolean;
}

export interface NativeGlassRegistration {
  id: string;
  role: NativeGlassRole;
  label?: string;
  symbol?: string;
  prominent?: boolean;
  enabled?: boolean;
  value?: string;
  tabs?: NativeGlassTabSpec[];
  /** Glass is drawn, and the web control keeps the tap. Used for pickers. */
  passThrough?: boolean;
}

export interface NativeGlassSlot extends NativeGlassRegistration {
  element: HTMLElement;
}

export interface NativeGlassSpec {
  id: string;
  role: NativeGlassRole;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  symbol: string;
  prominent: boolean;
  enabled: boolean;
  value: string;
  tabs: NativeGlassTabSpec[];
  /** Hidden while a popup is the top layer. Not drawn and not tappable. */
  suppressed: boolean;
  /** Extra space inside a tab bar, below the icons, so the bar can reach the screen edge. */
  insetBottom: number;
  /** Corner radius for a popup surface. Unused by buttons. */
  corner: number;
  /** Glass is drawn, and the web control keeps the tap. */
  passThrough: boolean;
}

interface NativeGlassPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  sync(options: { payload: string }): Promise<{ applied: boolean; count: number }>;
  clear(): Promise<void>;
  addListener(
    eventName: "tap",
    listener: (event: { id: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "change",
    listener: (event: { id: string; value?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeGlass = registerPlugin<NativeGlassPlugin>("NativeGlass");

const POPUP_SELECTOR = ".liquid-glass-sheet, .liquid-glass-surface";
const slots = new Map<string, NativeGlassSlot>();

let frame = 0;
let lastPayload = "";
let flushing = false;
let pending = false;
let availability: boolean | null = null;
let listenTask: Promise<void> | null = null;
let viewportListening = false;

export function nativeGlassSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function registerNativeGlass(slot: NativeGlassSlot): void {
  slots.set(slot.id, slot);
  ensureViewportListeners();
  scheduleSync();
}

export function unregisterNativeGlass(id: string): void {
  const slot = slots.get(id);
  slot?.element.removeAttribute("aria-hidden");
  slots.delete(id);
  flushNativeGlassSoon();
}

/** Drop a removed control in this turn. A deferred frame is how a closed popup leaves a glass button behind. */
function flushNativeGlassSoon(): void {
  if (typeof window === "undefined") return;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  void flushNativeGlass();
}

export function measureNativeGlassSlots(): NativeGlassSpec[] {
  const specs: NativeGlassSpec[] = [];
  for (const slot of slots.values()) {
    const measured = measureSlot(slot);
    if (measured) specs.push(measured);
  }
  specs.push(...measurePopupSurfaces());
  specs.sort((a, b) => a.id.localeCompare(b.id));
  return specs;
}

export function scheduleNativeGlassSync(): void {
  scheduleSync();
}

export function dispatchNativeGlassTap(id: string): boolean {
  const host = findNativeGlassElement(id);
  if (!host) return false;
  const el = activationTarget(host);
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  el.click();
  return true;
}

export function dispatchNativeGlassChange(id: string, value: string): boolean {
  const host = findNativeGlassElement(id);
  const el = fieldTarget(host);
  if (!el) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export async function flushNativeGlass(): Promise<void> {
  if (!nativeGlassSupported()) return;
  if (availability === false) return;
  if (document.documentElement.classList.contains("overlay-open")) scheduleSync();
  const controls = measureNativeGlassSlots();
  const payload = JSON.stringify(envelopeFor(controls));
  if (payload === lastPayload) {
    if (popupIsMoving()) scheduleSync();
    return;
  }
  if (flushing) {
    pending = true;
    return;
  }
  flushing = true;
  try {
    const ok = await available();
    if (!ok) {
      setNativeGlassActive(false);
      return;
    }
    await ensureListeners();
    let next = payload;
    let nextControls = controls;
    for (;;) {
      const result = await NativeGlass.sync({ payload: next });
      lastPayload = next;
      const applied = result.applied === true && nextControls.length > 0;
      setNativeGlassActive(applied);
      syncPopupHoles(applied ? nextControls.filter((spec) => spec.role === "surface") : []);
      if (!result.applied) lastPayload = "";
      if (!pending) break;
      pending = false;
      nextControls = measureNativeGlassSlots();
      next = JSON.stringify(envelopeFor(nextControls));
      if (next === lastPayload) break;
    }
  } catch {
    lastPayload = "";
    setNativeGlassActive(false);
    syncPopupHoles([]);
  } finally {
    flushing = false;
    if (popupIsMoving()) scheduleSync();
  }
}

function popupIsMoving(): boolean {
  if (typeof document === "undefined") return false;
  if (!document.documentElement.classList.contains("overlay-open")) return false;
  for (const node of document.querySelectorAll<HTMLElement>(POPUP_SELECTOR)) {
    const transform = getComputedStyle(node).transform;
    if (transform && transform !== "none") return true;
    if (typeof node.getAnimations === "function" && node.getAnimations().length > 0) return true;
  }
  return false;
}

export function resetNativeGlassForTests(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  slots.clear();
  lastPayload = "";
  pending = false;
  flushing = false;
  availability = null;
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("overlay-open");
    document.body.classList.remove("overlay-open");
    document.documentElement.removeAttribute("data-native-glass");
    document.documentElement.removeAttribute("data-native-glass-sheet");
    document.getElementById("native-glass-holes")?.remove();
  }
}

function envelopeFor(controls: NativeGlassSpec[]) {
  const root = document.documentElement;
  return {
    colorScheme: root.classList.contains("dark") ? "dark" : "light",
    accent: getComputedStyle(root).getPropertyValue("--accent").trim(),
    controls,
  };
}

function measureSlot(slot: NativeGlassSlot): NativeGlassSpec | null {
  const el = slot.element;
  if (!el.isConnected) return null;
  const raw = el.getBoundingClientRect();
  const box = clipFrame(el, raw);
  if (!box) return null;
  const x = box.left;
  let y = box.top;
  const width = box.width;
  let height = box.height;
  let insetBottom = 0;
  if (slot.role === "tabBar") {
    const buttons = [...el.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (buttons.length > 0) {
      const rects = buttons.map((button) => button.getBoundingClientRect());
      const buttonBottom = Math.max(...rects.map((rect) => rect.bottom));
      insetBottom = Math.max(0, box.bottom - buttonBottom);
      y = box.top;
      height = box.height;
    }
  }
  if (!(width > 0) || !(height > 0)) return null;
  return {
    id: slot.id,
    role: slot.role,
    x,
    y,
    width,
    height,
    label: slot.label ?? "",
    symbol: slot.symbol ?? "",
    prominent: slot.prominent ?? false,
    enabled: slot.enabled ?? true,
    value: slot.value ?? "",
    tabs: slot.tabs ?? [],
    suppressed: controlIsBehindModal(el),
    insetBottom,
    corner: 0,
    passThrough: slot.passThrough ?? false,
  };
}

function controlIsBehindModal(el: HTMLElement): boolean {
  const inPopup = el.closest(POPUP_SELECTOR) != null;
  if (!document.documentElement.classList.contains("overlay-open")) return inPopup;
  const top = topPopup();
  if (!top) return true;
  return !top.contains(el);
}

/** The last visible popup in document order. A confirmation nested in a sheet comes after that sheet. */
function topPopup(): HTMLElement | null {
  let top: HTMLElement | null = null;
  for (const node of document.querySelectorAll<HTMLElement>(POPUP_SELECTOR)) {
    const box = node.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) top = node;
  }
  return top;
}

/**
 * Native controls are drawn above the web view, so a scrolled button would
 * paint outside its popup. Keep only the part inside each clipping ancestor.
 */
function clipFrame(el: HTMLElement, box: DOMRect): DOMRect | null {
  const popup = el.closest<HTMLElement>(POPUP_SELECTOR);
  if (!popup || popup === el) return box;
  let left = box.left;
  let top = box.top;
  let right = box.right;
  let bottom = box.bottom;
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const clipsX = style.overflowX === "auto" || style.overflowX === "scroll" || style.overflowX === "hidden";
    const clipsY = style.overflowY === "auto" || style.overflowY === "scroll" || style.overflowY === "hidden";
    if (clipsX || clipsY) {
      const clip = node.getBoundingClientRect();
      if (clipsX) {
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      if (clipsY) {
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
    }
    if (node === popup) break;
    node = node.parentElement;
  }
  const width = right - left;
  const height = bottom - top;
  if (!(width >= 8) || !(height >= 8)) return null;
  if (left === box.left && top === box.top && width === box.width && height === box.height) return box;
  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function measurePopupSurfaces(): NativeGlassSpec[] {
  if (!document.documentElement.classList.contains("overlay-open")) return [];
  const nodes = [...document.querySelectorAll<HTMLElement>(POPUP_SELECTOR)];
  const specs: NativeGlassSpec[] = [];
  nodes.forEach((el, index) => {
    const box = el.getBoundingClientRect();
    if (!(box.width > 0) || !(box.height > 0)) return;
    const id = el.getAttribute("data-native-glass-surface-id") ?? `popup-surface-${index}`;
    el.setAttribute("data-native-glass-surface-id", id);
    const raw = getComputedStyle(el).borderTopLeftRadius;
    const parsed = Number.parseFloat(raw);
    specs.push({
      id,
      role: "surface",
      x: box.left,
      y: box.top,
      width: box.width,
      height: box.height,
      label: "",
      symbol: "",
      prominent: false,
      enabled: true,
      value: "",
      tabs: [],
      suppressed: false,
      insetBottom: 0,
      corner: Number.isFinite(parsed) && parsed > 0 ? parsed : 22,
      passThrough: false,
    });
  });
  return specs;
}

function syncPopupHoles(surfaces: NativeGlassSpec[]) {
  const root = document.documentElement;
  if (surfaces.length === 0) {
    root.removeAttribute("data-native-glass-sheet");
    document.getElementById("native-glass-holes")?.remove();
    return;
  }
  root.setAttribute("data-native-glass-sheet", "on");
  let layer = document.getElementById("native-glass-holes");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "native-glass-holes";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  layer.replaceChildren(
    ...surfaces.map((spec) => {
      const hole = document.createElement("div");
      hole.className = "native-glass-hole";
      hole.style.left = `${spec.x}px`;
      hole.style.top = `${spec.y}px`;
      hole.style.width = `${spec.width}px`;
      hole.style.height = `${spec.height}px`;
      hole.style.borderRadius = `${spec.corner}px`;
      return hole;
    }),
  );
}

function activationTarget(host: HTMLElement): HTMLElement {
  if (
    host instanceof HTMLButtonElement ||
    host instanceof HTMLInputElement ||
    host instanceof HTMLTextAreaElement
  ) {
    return host;
  }
  return host.querySelector("button, input, textarea") ?? host;
}

function fieldTarget(host: HTMLElement | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (!host) return null;
  if (host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement) return host;
  return host.querySelector("input, textarea");
}

function findNativeGlassElement(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id;
  return document.querySelector<HTMLElement>(`[data-native-glass-id="${escaped}"]`);
}

function setNativeGlassActive(active: boolean) {
  const root = document.documentElement;
  if (active) root.dataset.nativeGlass = "on";
  else root.removeAttribute("data-native-glass");
  for (const slot of slots.values()) {
    if (active) slot.element.setAttribute("aria-hidden", "true");
    else slot.element.removeAttribute("aria-hidden");
  }
}

function scheduleSync() {
  if (typeof window === "undefined") return;
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    void flushNativeGlass();
  });
}

function ensureViewportListeners() {
  if (viewportListening || typeof window === "undefined") return;
  viewportListening = true;
  const schedule = () => scheduleSync();
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  document.addEventListener("transitionrun", schedule, true);
  document.addEventListener("animationstart", schedule, true);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
}

async function available(): Promise<boolean> {
  if (!nativeGlassSupported()) return false;
  if (availability !== null) return availability;
  try {
    const result = await NativeGlass.isAvailable();
    availability = result.available === true;
  } catch {
    availability = false;
  }
  return availability;
}

function ensureListeners(): Promise<void> {
  if (!nativeGlassSupported()) return Promise.resolve();
  listenTask ??= NativeGlass.addListener("tap", (event) => {
    if (event?.id) dispatchNativeGlassTap(event.id);
  })
    .then(() =>
      NativeGlass.addListener("change", (event) => {
        if (event?.id) dispatchNativeGlassChange(event.id, event.value ?? "");
      }),
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      listenTask = null;
      throw error;
    });
  return listenTask;
}
