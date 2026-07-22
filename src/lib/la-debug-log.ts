/**
 * In-app diagnostic ring buffer for Live Activity / FCM token debugging.
 * Shown on Settings so TestFlight devices can report what failed without Xcode.
 */

export type LaDebugLevel = "info" | "warn" | "error" | "ok";

export type LaDebugEntry = {
  id: number;
  at: number;
  level: LaDebugLevel;
  source: string;
  message: string;
};

const MAX = 80;
let seq = 0;
const entries: LaDebugEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function laDebugLog(
  source: string,
  message: string,
  level: LaDebugLevel = "info",
): void {
  seq += 1;
  entries.push({ id: seq, at: Date.now(), level, source, message });
  while (entries.length > MAX) entries.shift();
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[la-debug:${source}] ${message}`,
  );
  notify();
}

export function getLaDebugLog(): readonly LaDebugEntry[] {
  return entries;
}

export function clearLaDebugLog(): void {
  entries.length = 0;
  notify();
}

export function subscribeLaDebugLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function formatLaDebugLogForCopy(): string {
  return entries
    .map((e) => {
      const t = new Date(e.at).toISOString().slice(11, 23);
      return `${t} [${e.level}] ${e.source}: ${e.message}`;
    })
    .join("\n");
}
