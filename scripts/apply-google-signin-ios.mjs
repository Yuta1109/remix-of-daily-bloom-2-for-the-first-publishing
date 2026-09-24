#!/usr/bin/env node
/**
 * Inject Google Sign-In iOS keys into Info.plist from the real
 * GoogleService-Info.plist. Never invents CLIENT_ID / REVERSED_CLIENT_ID.
 *
 * If the plist is missing, this is a no-op (exit 0) so local `cap:sync`
 * still works. CI writes the plist before this script.
 *
 * Updates:
 *   - GIDClientID (CLIENT_ID)
 *   - CFBundleURLTypes URL scheme (REVERSED_CLIENT_ID)
 * Does not remove the existing `essences` URL scheme.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyGoogleSignInKeys,
  plistString,
} from "./google-signin-plist.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOOGLE_PLIST = path.join(ROOT, "ios/App/App/GoogleService-Info.plist");
const INFO_PLIST = path.join(ROOT, "ios/App/App/Info.plist");

if (!fs.existsSync(GOOGLE_PLIST)) {
  console.log(
    "[google-signin-ios] GoogleService-Info.plist not found at ios/App/App/GoogleService-Info.plist — skipped (place the Firebase Console file there, App target).",
  );
  process.exit(0);
}

if (!fs.existsSync(INFO_PLIST)) {
  console.error(`[google-signin-ios] missing ${INFO_PLIST}`);
  process.exit(1);
}

const googleXml = fs.readFileSync(GOOGLE_PLIST, "utf8");
const clientId = plistString(googleXml, "CLIENT_ID");
const reversed = plistString(googleXml, "REVERSED_CLIENT_ID");

if (!clientId || !reversed) {
  console.error(
    "[google-signin-ios] GoogleService-Info.plist is missing CLIENT_ID or REVERSED_CLIENT_ID. Download a fresh iOS plist from Firebase Console (bundle com.confast.essences).",
  );
  process.exit(1);
}

let info = fs.readFileSync(INFO_PLIST, "utf8");
info = applyGoogleSignInKeys(info, clientId, reversed);
fs.writeFileSync(INFO_PLIST, info);
console.log("[google-signin-ios] Wrote GIDClientID and REVERSED_CLIENT_ID URL scheme into Info.plist");
