import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/native-bootstrap";
import { initKeyboardAvoidance } from "./lib/keyboard-avoidance";

createRoot(document.getElementById("root")!).render(<App />);

initKeyboardAvoidance();
void initNative();
