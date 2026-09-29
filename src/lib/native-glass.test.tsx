import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import { BottomNav } from "@/components/BottomNav";
import {
  dispatchNativeGlassChange,
  dispatchNativeGlassTap,
  flushNativeGlass,
  measureNativeGlassSlots,
  registerNativeGlass,
  resetNativeGlassForTests,
} from "@/lib/native-glass";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function place(el: HTMLElement, box: DOMRect) {
  el.getBoundingClientRect = () => box;
  document.body.appendChild(el);
}

describe("native Liquid Glass bridge", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetNativeGlassForTests();
  });

  it("measures a corner control from its web frame and drops empty frames", () => {
    const back = document.createElement("button");
    place(back, rect(16, 62, 44, 44));
    registerNativeGlass({ id: "settings-back", role: "back", element: back, label: "Back" });

    const hidden = document.createElement("button");
    place(hidden, rect(0, 0, 0, 0));
    registerNativeGlass({ id: "hidden-close", role: "close", element: hidden, label: "Close" });

    expect(measureNativeGlassSlots()).toEqual([
      {
        id: "settings-back",
        role: "back",
        x: 16,
        y: 62,
        width: 44,
        height: 44,
        label: "Back",
        symbol: "",
        prominent: false,
        enabled: true,
        value: "",
        tabs: [],
        suppressed: false,
        insetBottom: 0,
        corner: 0,
        passThrough: false,
      },
    ]);
  });

  it("extends the tab bar to the bottom of its bar and keeps each tab id", () => {
    const nav = document.createElement("nav");
    place(nav, rect(12, 700, 350, 90));
    const plan = document.createElement("button");
    plan.getBoundingClientRect = () => rect(80, 708, 64, 40);
    nav.appendChild(plan);
    registerNativeGlass({
      id: "main-tab-bar",
      role: "tabBar",
      element: nav,
      tabs: [{ id: "/plan", label: "Planning", symbol: "book", selected: true }],
    });

    const [spec] = measureNativeGlassSlots();
    expect(spec.x).toBe(12);
    expect(spec.width).toBe(350);
    expect(spec.y).toBe(700);
    expect(spec.height).toBe(90);
    expect(spec.insetBottom).toBe(42);
    expect(spec.suppressed).toBe(false);
    expect(spec.tabs).toEqual([{ id: "/plan", label: "Planning", symbol: "book", selected: true }]);
  });

  it("hides background controls and measures the popup while a modal is open", () => {
    document.documentElement.classList.add("overlay-open");
    const nav = document.createElement("nav");
    place(nav, rect(0, 700, 300, 80));
    registerNativeGlass({ id: "main-tab-bar", role: "tabBar", element: nav, tabs: [] });
    const sheet = document.createElement("div");
    sheet.className = "liquid-glass-sheet";
    sheet.setAttribute("role", "dialog");
    place(sheet, rect(0, 220, 390, 480));
    const close = document.createElement("button");
    close.getBoundingClientRect = () => rect(16, 232, 44, 44);
    sheet.appendChild(close);
    registerNativeGlass({ id: "sheet-close", role: "close", element: close, label: "Close" });

    const specs = measureNativeGlassSlots();
    expect(specs.find((spec) => spec.id === "main-tab-bar")?.suppressed).toBe(true);
    expect(specs.find((spec) => spec.id === "sheet-close")?.suppressed).toBe(false);
    const surface = specs.find((spec) => spec.role === "surface");
    expect(surface).toMatchObject({ x: 0, y: 220, width: 390, height: 480, suppressed: false });
    document.documentElement.classList.remove("overlay-open");
  });

  it("runs the existing web handler for a native tap and ignores a disabled control", () => {
    const back = document.createElement("button");
    back.setAttribute("data-native-glass-id", "settings-back");
    let taps = 0;
    back.addEventListener("click", () => {
      taps += 1;
    });
    document.body.appendChild(back);
    expect(dispatchNativeGlassTap("settings-back")).toBe(true);
    expect(taps).toBe(1);

    back.disabled = true;
    expect(dispatchNativeGlassTap("settings-back")).toBe(false);
    expect(taps).toBe(1);
    expect(dispatchNativeGlassTap("missing")).toBe(false);
  });

  it("writes a native search change into the React input", () => {
    const input = document.createElement("input");
    input.setAttribute("data-native-glass-id", "notes-search");
    document.body.appendChild(input);
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push(input.value));
    expect(dispatchNativeGlassChange("notes-search", "milk")).toBe(true);
    expect(input.value).toBe("milk");
    expect(seen).toEqual(["milk"]);

    const wrap = document.createElement("div");
    wrap.setAttribute("data-native-glass-id", "memo-search");
    const nested = document.createElement("input");
    wrap.appendChild(nested);
    document.body.appendChild(wrap);
    expect(dispatchNativeGlassChange("memo-search", "tea")).toBe(true);
    expect(nested.value).toBe("tea");
  });

  it("leaves the CSS material in place when native glass is not available", async () => {
    const back = document.createElement("button");
    place(back, rect(16, 62, 44, 44));
    registerNativeGlass({ id: "settings-back", role: "back", element: back, label: "Back" });
    await flushNativeGlass();
    expect(document.documentElement.hasAttribute("data-native-glass")).toBe(false);
  });

  it("keeps the shared roles, official glass APIs, and the iOS 17.2 deployment target", () => {
    const settings = readFileSync("src/pages/Settings.tsx", "utf8");
    const nav = readFileSync("src/components/BottomNav.tsx", "utf8");
    const css = readFileSync("src/index.css", "utf8");
    const views = readFileSync("ios/App/App/NativeGlass/NativeGlassViews.swift", "utf8");
    const plugin = readFileSync("ios/App/App/NativeGlass/NativeGlassPlugin.swift", "utf8");
    const project = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");

    expect(settings).toContain('nativeGlass={{ id: "settings-back", role: "back" }}');
    expect(settings).toContain('className="app-shell-header px-4 pb-2"');
    expect(nav).toContain('role: "tabBar"');
    expect(nav).toContain('symbol: "chart.bar"');
    expect(css).toContain(".liquid-glass");
    expect(css).toContain('html[data-native-glass="on"] [data-native-glass-host]');
    expect(css).toContain("--glass-size-regular: 44px");
    expect(views).toContain("struct NativeLiquidGlassBackButton");
    expect(views).toContain("struct NativeLiquidGlassCloseButton");
    expect(views).toContain("struct NativeLiquidGlassCheckButton");
    expect(views).toContain("struct NativeLiquidGlassIconButton");
    expect(views).toContain("struct NativeLiquidGlassSearchField");
    expect(views).toContain("struct NativeLiquidGlassTabBar");
    expect(views).toContain("struct NativeLiquidGlassSurface");
    expect(readFileSync("src/components/UserButton.tsx", "utf8")).toContain("person.crop.circle");
    expect(readFileSync("src/components/plan/CycleNav.tsx", "utf8")).toContain('role: "tabBar"');
    expect(readFileSync("src/components/plan/PlanLevelBar.tsx", "utf8")).toContain('role: "tabBar"');
    expect(readFileSync("src/components/PopupCornerControls.tsx", "utf8")).toContain('role: "close"');
    expect(readFileSync("src/components/PopupCornerControls.tsx", "utf8")).toContain('role: "check"');
    expect(readFileSync("ios/App/App/AppIcon.icon/icon.json", "utf8")).toContain('"glass": true');
    expect(readFileSync("ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json", "utf8")).toContain(
      "AppIcon-512@2x.png",
    );
    expect(views).toContain("struct NativeGlassLayer");
    expect(views).toContain("struct NativeGlassSurfaceLayer");
    expect(views).toContain("glassEffectID");
    expect(views).toContain("GlassEffectContainer");
    expect(views).toContain("DragGesture(minimumDistance: 10)");
    expect(readFileSync("ios/App/App/NativeGlass/NativeGlassPlugin.swift", "utf8")).toContain("NativeGlassShieldView");
    expect(views).toContain(".glassEffect(.regular.interactive()");
    expect(views).toContain(".buttonStyle(.glass)");
    expect(views).toContain(".buttonStyle(.glassProminent)");
    expect(views).toContain("chevron.backward");
    expect(views).toContain("xmark");
    expect(views).toContain("checkmark");
    expect(views).not.toMatch(/UIVisualEffectView\(/);
    expect(views).not.toContain(".ultraThinMaterial");
    expect(plugin).not.toMatch(/UIVisualEffectView\(/);
    expect(plugin).toContain("iOS 26.0");
    expect(plugin).toContain("call.resolve([\"available\": false])");
    expect(project).toContain("IPHONEOS_DEPLOYMENT_TARGET = 17.2;");
    expect(project).not.toContain("IPHONEOS_DEPLOYMENT_TARGET = 26");
  });

  it("connects the tab bar through the same bridge without removing its CSS fallback", () => {
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <I18nProvider>
          <BottomNav />
        </I18nProvider>
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation");
    expect(nav.className).toContain("liquid-glass-bar");
    expect(nav.hasAttribute("data-native-glass-host")).toBe(true);
    expect(nav.querySelector('[data-native-glass-id="/calendar"]')).toBeTruthy();
    fireEvent.click(nav.querySelector('[data-native-glass-id="/note"]') as HTMLButtonElement);
    expect(document.documentElement.hasAttribute("data-native-glass")).toBe(false);
  });
});
