import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";
import { getThemeAccentId, initThemeAccent, THEME_ACCENT_HEX } from "./lib/theme-accent";

function syncBootSplashAccent(): void {
  const el = document.getElementById("boot-confast");
  if (!el) return;
  el.style.color = THEME_ACCENT_HEX[getThemeAccentId()];
}

function dismissBootSplash(): void {
  const el = document.getElementById("boot-splash");
  if (!el) return;
  window.setTimeout(() => {
    el.classList.add("boot-splash-hide");
    window.setTimeout(() => el.remove(), 400);
  }, 520);
}

initThemeAccent();
syncBootSplashAccent();
createRoot(document.getElementById("root")!).render(<App />);

initKeyboardAvoidance();
void initNative().finally(() => {
  dismissBootSplash();
});
