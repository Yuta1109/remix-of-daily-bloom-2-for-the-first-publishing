/**
 * Builds docs/GEMINI_LA_TOKEN_DEBUG_PACK.md — full source dump for external review.
 * Run: node scripts/build-la-gemini-pack.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "docs", "GEMINI_LA_TOKEN_DEBUG_PACK.md");

const files = [
  "docs/LIVE_ACTIVITY_DESIGN_AND_ISSUES.md",
  "src/lib/fcm.ts",
  "src/lib/la-remote.ts",
  "src/lib/la-debug-log.ts",
  "src/lib/live-activity.ts",
  "src/lib/live-activity-window.ts",
  "src/lib/native-bootstrap.ts",
  "src/pages/Settings.tsx",
  "ios/App/App/AppDelegate.swift",
  "ios/App/App/LiveActivities/APNsDeviceTokenCache.swift",
  "ios/App/App/LiveActivities/LiveActivityPushTokenCenter.swift",
  "ios/App/App/LiveActivities/LiveActivityRefreshCenter.swift",
  "ios/App/App/LiveActivities/LiveActivitiesPlugin.swift",
  "ios/App/App/LiveActivities/EssentialsAttributes.swift",
  "ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift",
  "ios/App/App/App.entitlements",
  "ios/App/CapApp-SPM/Package.swift",
  "capacitor.config.ts",
  "scripts/ensure-spm-firebase-app-link.mjs",
  "ios/scripts/setup_widget.rb",
  "patches/@capacitor-firebase+messaging+8.3.0.patch",
  "functions/index.js",
];

const header = `# Essences Live Activity / FCM — Gemini debug pack

Generated: ${new Date().toISOString()}

## Symptom (device)
- Settings: Firestore connected, but \`FCM ✗ · pushToStart ✗ · updateToken ✗\`
- Error: \`FCM: The operation couldn't be completed. No APNS token specified before fetching FCM Token\`
- Notifications toggle is ON; local LA window may show as started.

## Ask for Gemini
1. Why does APNs device token never reach Firebase Messaging (\`Messaging.apnsToken\`)?
2. Is the AppDelegate cache + rebroadcast + Messaging patch sufficient, or is something else required (entitlements, provisioning, plist)?
3. Concrete code/config changes to make FCM✓ then pushToStart✓ on a real device.

## Constraints
Do NOT revert:
- \`EventSheet.tsx\` / \`select.tsx\` confirm UX
- \`EssentialsWidgetLiveActivity.swift\` relative labels (\`X時間Y分後\`)

---

`;

let body = header;
for (const rel of files) {
  const abs = path.join(root, rel);
  body += `\n\n========== FILE: ${rel} ==========\n\n`;
  if (!fs.existsSync(abs)) {
    body += `\`\`\`\n/* MISSING: ${rel} */\n\`\`\`\n`;
    continue;
  }
  const text = fs.readFileSync(abs, "utf8");
  const ext = path.extname(rel).slice(1) || "text";
  const lang =
    ext === "tsx" || ext === "ts"
      ? "typescript"
      : ext === "swift"
        ? "swift"
        : ext === "rb"
          ? "ruby"
          : ext === "mjs" || ext === "js"
            ? "javascript"
            : ext === "md"
              ? "markdown"
              : ext === "patch"
                ? "diff"
                : ext === "plist" || rel.endsWith(".entitlements")
                  ? "xml"
                  : "";
  body += `\`\`\`${lang}\n${text}\n\`\`\`\n`;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`Wrote ${outPath} (${body.length} chars, ${files.length} files)`);
