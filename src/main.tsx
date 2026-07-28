import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";
import { initThemeAccent } from "./lib/theme-accent";

declare global {
  interface Window {
    __bootSplashReady?: Promise<void>;
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
void (async () => {
  await initNative();
  await (window.__bootSplashReady ?? Promise.resolve());
  dismissBootSplash();
})();
