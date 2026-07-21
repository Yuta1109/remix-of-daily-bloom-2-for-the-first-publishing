/**
 * After `npx cap sync ios`:
 *  1. Normalize Windows backslashes in CapApp-SPM/Package.swift (macOS CI).
 *  2. Fail if both @capacitor/app and @capacitor-firebase/app are path deps
 *     (SwiftPM identity collision on basename "app").
 *  3. Fail if CapacitorFirebaseMessaging is missing.
 *
 * @capacitor-firebase/app must stay out of ios.includePlugins (see capacitor.config.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageSwiftPath = path.join(root, "ios", "App", "CapApp-SPM", "Package.swift");

if (!fs.existsSync(packageSwiftPath)) {
  throw new Error(`Missing ${packageSwiftPath}. Run npx cap sync ios first.`);
}

let text = fs.readFileSync(packageSwiftPath, "utf8");
text = text.replace(/\\\\/g, "/").replace(/\\/g, "/");
fs.writeFileSync(packageSwiftPath, text);

if (!text.includes("CapacitorFirebaseMessaging")) {
  throw new Error("Package.swift missing CapacitorFirebaseMessaging — FCM will not work");
}

const hasCapacitorApp = /node_modules\/@capacitor\/app"/.test(text);
const hasFirebaseApp = /node_modules\/@capacitor-firebase\/app"/.test(text);
if (hasCapacitorApp && hasFirebaseApp) {
  throw new Error(
    "SPM identity collision: Package.swift references both @capacitor/app and @capacitor-firebase/app. " +
      "Keep @capacitor-firebase/app out of ios.includePlugins in capacitor.config.ts.",
  );
}

if (hasFirebaseApp) {
  console.warn(
    "[spm] Package.swift still includes @capacitor-firebase/app; prefer excluding it via includePlugins",
  );
}

console.log("[spm] CapApp-SPM/Package.swift normalized; no app/app identity collision.");
