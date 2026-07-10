import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNative } from "./lib/native-bootstrap";

createRoot(document.getElementById("root")!).render(<App />);

void initNative();
