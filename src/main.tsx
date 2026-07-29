import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hideNativeSplash, initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";
import { initThemeAccent } from "./lib/theme-accent";

declare global {
  interface Window {
    __bootSplashReady?: Promise<void>;
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

// Splash timeline (must not wait on FCM / Live Activity init):
// 1) Native launch = logo only → hide as soon as web boot splash is up
// 2) Typewriter starts
// 3) ~1s after typing finishes → fade boot splash
// Heavy native work runs in parallel and must not hold the splash.
void (async () => {
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
