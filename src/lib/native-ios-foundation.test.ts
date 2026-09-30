import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nativeRoot = "ios/App/App/Native";

function swiftFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? swiftFiles(path) : entry.name.endsWith(".swift") ? [path] : [];
  });
}

describe("native iOS foundation", () => {
  it("starts the SwiftUI root without depending on the WebView glass bridge", () => {
    const delegate = readFileSync("ios/App/App/AppDelegate.swift", "utf8");
    const nativeSources = swiftFiles(nativeRoot).map((file) => readFileSync(file, "utf8")).join("\n");

    expect(delegate).toContain("UIHostingController(rootView: NativeAppRoot())");
    expect(nativeSources).not.toContain("CAPBridgeViewController");
    expect(nativeSources).not.toContain("NativeGlassPlugin");
  });

  it("keeps five configurable tabs with independent navigation state", () => {
    const tabs = readFileSync(`${nativeRoot}/Navigation/AppTab.swift`, "utf8");
    const state = readFileSync(`${nativeRoot}/App/AppState.swift`, "utf8");
    const shell = readFileSync(`${nativeRoot}/App/AppShell.swift`, "utf8");

    expect(tabs).toContain("[.planning, .today, .calendar, .progress, .notes]");
    expect(state).toContain("navigationByTab");
    expect(state).toContain("scrollPositions");
    expect(shell).toContain("NavigationStack(path: $navigation.path)");
    expect(shell).toContain(".tabItem");
    expect(shell).not.toContain("NativeFloatingTabBar");
    expect(shell).not.toContain(".toolbar(.hidden, for: .tabBar)");
  });

  it("uses official iOS 26 glass with an older-system fallback", () => {
    const glass = readFileSync(`${nativeRoot}/Components/Glass/NativeGlassComponents.swift`, "utf8");

    expect(glass).toContain("if #available(iOS 26.0, *)");
    expect(glass).toContain(".buttonStyle(.glass)");
    expect(glass).toContain(".thinMaterial");
    expect(glass).toContain("width: 30, height: 30");
    expect(glass).toContain("minWidth: 44, minHeight: 44");
  });

  it("keeps deployment and CI project integration stable", () => {
    const project = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
    const setup = readFileSync("ios/scripts/setup_widget.rb", "utf8");

    expect(project).toContain("IPHONEOS_DEPLOYMENT_TARGET = 17.2");
    expect(setup).toContain('App/Native');
    expect(setup).toContain('Dir.glob(File.join(native_root_path, "**", "*.swift"))');
  });
});
