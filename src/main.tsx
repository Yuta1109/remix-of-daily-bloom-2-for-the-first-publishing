import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hideNativeSplash, initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";
import { getThemeAccentId, initThemeAccent, THEME_ACCENT_HEX } from "./lib/theme-accent";

declare global {
  interface Window {
    __bootSplashReady?: Promise<void>;
    __bootSplashVisible?: Promise<void>;
    __startBootTypewriter?: () => void;
  }
}

function syncBootSplashAccent(): void {
  document.documentElement.style.setProperty(
    "--boot-accent",
    THEME_ACCENT_HEX[getThemeAccentId()],
  );
}

function dismissBootSplash(): void {
  const el = document.getElementById("boot-splash");
  if (!el) return;
  el.classList.add("boot-splash-hide");
  window.setTimeout(() => el.remove(), 280);
}

initThemeAccent();
syncBootSplashAccent();
createRoot(document.getElementById("root")!).render(<App />);
initKeyboardAvoidance();

// Native system launch: HQ icon only.
// Web: text-only branding. WKWebView / window background must be #fefefe
// (see capacitor ios.backgroundColor) or Dark Mode shows a black gap.
void (async () => {
  await (window.__bootSplashVisible ?? Promise.resolve());
  await hideNativeSplash();
  window.__startBootTypewriter?.();
})();

void initNative();

void (async () => {
  await (window.__bootSplashReady ?? Promise.resolve());
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 1000);
  });
  dismissBootSplash();
})();
