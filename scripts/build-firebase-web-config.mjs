#!/usr/bin/env node
/**
 * Produces VITE_FIREBASE_WEB_CONFIG for the Vite build.
 *
 * Priority:
 *   1. FIREBASE_WEB_CONFIG env (JSON string) if it parses and has required keys
 *   2. GoogleService-Info.plist at ios/App/App/GoogleService-Info.plist
 *
 * Usage:
 *   node scripts/build-firebase-web-config.mjs
 *   node scripts/build-firebase-web-config.mjs --write-env   # append to $GITHUB_ENV
 *
 * Prints the one-line JSON to stdout. Exits 1 if neither source works.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLIST_PATH = path.join(ROOT, "ios/App/App/GoogleService-Info.plist");
const REQUIRED = ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId"];

function plistString(xml, key) {
  const re = new RegExp(
    `<key>${key}</key>\\s*<string>([^<]*)</string>`,
    "i",
  );
  const m = xml.match(re);
  return m?.[1]?.trim() || "";
}

function fromPlist(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const xml = fs.readFileSync(filePath, "utf8");
  const apiKey = plistString(xml, "API_KEY");
  const projectId = plistString(xml, "PROJECT_ID");
  const messagingSenderId = plistString(xml, "GCM_SENDER_ID");
  const appId = plistString(xml, "GOOGLE_APP_ID");
  const storageBucket = plistString(xml, "STORAGE_BUCKET");
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || undefined,
    messagingSenderId,
    appId,
  };
}

function fromEnvJson(raw) {
  if (!raw?.trim()) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || !obj) return null;
    for (const k of REQUIRED) {
      if (!obj[k] || typeof obj[k] !== "string") return null;
    }
    return obj;
  } catch {
    return null;
  }
}

function assertConfig(cfg, source) {
  if (!cfg) return;
  for (const k of REQUIRED) {
    if (!cfg[k]) {
      console.error(`[firebase-web-config] missing ${k} from ${source}`);
      process.exit(1);
    }
  }
}

const writeEnv = process.argv.includes("--write-env");
const fromSecret = fromEnvJson(process.env.FIREBASE_WEB_CONFIG);
const fromFile = fromPlist(PLIST_PATH);

const config = fromSecret || fromFile;
const source = fromSecret ? "FIREBASE_WEB_CONFIG secret" : fromFile ? "GoogleService-Info.plist" : null;

if (!config || !source) {
  console.error(
    "[firebase-web-config] No usable Firebase web config.\n" +
      "  Set GitHub secret FIREBASE_WEB_CONFIG to a one-line JSON firebaseConfig, OR\n" +
      "  ensure ios/App/App/GoogleService-Info.plist exists before this step.",
  );
  process.exit(1);
}

assertConfig(config, source);

const json = JSON.stringify(config);
console.error(`[firebase-web-config] OK from ${source} (projectId=${config.projectId})`);
console.log(json);

if (writeEnv) {
  const envPath = process.env.GITHUB_ENV;
  if (!envPath) {
    console.error("[firebase-web-config] --write-env requires GITHUB_ENV");
    process.exit(1);
  }
  // Multiline-safe delimiter for GitHub Actions env files
  fs.appendFileSync(
    envPath,
    `VITE_FIREBASE_WEB_CONFIG<<EOF_FIREBASE_WEB\n${json}\nEOF_FIREBASE_WEB\n`,
  );
}
