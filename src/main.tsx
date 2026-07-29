import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hideNativeSplash, initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";
import { initThemeAccent } from "./lib/theme-accent";

declare global {
  interface Window {
    __bootSplashReady?: Promise<void>;
    __bootSplashVisible?: Promise<void>;
    __startBootTypewriter?: () => void;
  }
}

function dismissBootSplash(): void {
  const el = document.getElementById("boot-splash");
  if (!el) return;
  el.classList.add("boot-splash-hide");
  window.setTimeout(() => el.remove(), 280);
}

initThemeAccent();
createRoot(document.getElementById("root")!).render(<App />);
initKeyboardAvoidance();

// Native = HQ centered logo only (same asset family as web).
// After web logo is painted, cut native overlay with fadeOutDuration 0,
// then type "crafted by Confast" under the logo in the screen center.
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
