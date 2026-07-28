import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";
import { getThemeAccentId, initThemeAccent, THEME_ACCENT_HEX } from "./lib/theme-accent";

declare global {
  interface Window {
    __bootSplashReady?: Promise<void>;
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
  window.setTimeout(() => el.remove(), 400);
}

initThemeAccent();
syncBootSplashAccent();
createRoot(document.getElementById("root")!).render(<App />);

initKeyboardAvoidance();
void (async () => {
  // Hide the static native launch screen as soon as the matching web splash is up.
  // Branding + accent color live only on the web splash (avoids default-orange flash).
  await initNative();
  await (window.__bootSplashReady ?? Promise.resolve());
  window.setTimeout(dismissBootSplash, 420);
})();
