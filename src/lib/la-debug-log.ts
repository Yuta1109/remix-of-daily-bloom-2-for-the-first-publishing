/**
 * In-app diagnostic ring buffer for Live Activity / FCM token debugging.
 * Shown on Settings so TestFlight devices can report what failed without Xcode.
 * Persisted so event deletes / remounts do not wipe a full test session.
 */

export type LaDebugLevel = "info" | "warn" | "error" | "ok";

export type LaDebugEntry = {
  id: number;
  at: number;
  level: LaDebugLevel;
  source: string;
  message: string;
};

const MAX = 400;
const STORAGE_KEY = "essences-la-debug-log-v1";
let seq = 0;
const entries: LaDebugEntry[] = [];
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
    /* ignore quota */
  }
}

function hydrate(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      seq?: number;
      entries?: LaDebugEntry[];
    };
    if (!Array.isArray(parsed.entries)) return;
    entries.length = 0;
    for (const e of parsed.entries.slice(-MAX)) {
      if (!e || typeof e.message !== "string") continue;
      entries.push({
        id: Number(e.id) || ++seq,
        at: Number(e.at) || Date.now(),
        level: (e.level as LaDebugLevel) || "info",
        source: String(e.source || "log"),
        message: e.message,
      });
    }
    seq = Math.max(
      Number(parsed.seq) || 0,
      ...entries.map((e) => e.id),
      0,
    );
  } catch {
    /* ignore */
  }
}

hydrate();

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
  persist();
  notify();
}

export function getLaDebugLog(): readonly LaDebugEntry[] {
  return entries;
}

export function clearLaDebugLog(): void {
  entries.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
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
