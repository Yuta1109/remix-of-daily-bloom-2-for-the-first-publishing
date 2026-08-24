/**
 * OCR / Firebase callable diagnostics for TestFlight (Settings → copy log).
 */

export type OcrDebugLevel = "info" | "warn" | "error" | "ok";

export type OcrDebugEntry = {
  id: number;
  at: number;
  level: OcrDebugLevel;
  source: string;
  message: string;
};

const MAX = 500;
const STORAGE_KEY = "essences-ocr-debug-log-v1";
let seq = 0;
const entries: OcrDebugEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ seq, entries: entries.slice(-MAX) }),
    );
  } catch {
    /* ignore */
  }
}

function hydrate(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { seq?: number; entries?: OcrDebugEntry[] };
    if (!Array.isArray(parsed.entries)) return;
    entries.length = 0;
    for (const e of parsed.entries.slice(-MAX)) {
      if (!e || typeof e.message !== "string") continue;
      entries.push({
        id: Number(e.id) || ++seq,
        at: Number(e.at) || Date.now(),
        level: (e.level as OcrDebugLevel) || "info",
        source: String(e.source || "log"),
        message: e.message,
      });
    }
    seq = Math.max(Number(parsed.seq) || 0, ...entries.map((e) => e.id), 0);
  } catch {
    /* ignore */
  }
}

hydrate();

export function ocrDebugLog(
  source: string,
  message: string,
  level: OcrDebugLevel = "info",
): void {
  seq += 1;
  entries.push({ id: seq, at: Date.now(), level, source, message });
  while (entries.length > MAX) entries.shift();
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[ocr-debug:${source}] ${message}`,
  );
  persist();
  notify();
}

export function getOcrDebugLog(): readonly OcrDebugEntry[] {
  return entries;
}

export function clearOcrDebugLog(): void {
  entries.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function subscribeOcrDebugLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function formatOcrDebugLogForCopy(extraHeader?: string): string {
  const lines = entries.map((e) => {
    const t = new Date(e.at).toISOString();
    return `${t} [${e.level}] ${e.source}: ${e.message}`;
  });
  const header = extraHeader?.trim() ? `${extraHeader.trim()}\n\n` : "";
  return header + (lines.length ? lines.join("\n") : "(no OCR log entries yet)");
}
