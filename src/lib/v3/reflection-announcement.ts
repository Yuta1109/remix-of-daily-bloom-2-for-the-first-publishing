/**
 * Which Reflection the planning header should mention.
 * Status comes from the existing session clock. This does not complete
 * or start a reflection.
 */
import { deriveReflectionStatus } from "./reflection";
import type { ReflectionSession, ReflectionType } from "./types";

const APPROACHING_MS = 6 * 60 * 60 * 1000;

const TYPE_RANK: Record<ReflectionType, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  future: 3,
};

export interface ReflectionAnnouncement {
  tone: "overdue" | "available" | "approaching";
  type: ReflectionType;
  count: number;
  /** Session review when one target is clear. The hub otherwise. */
  to: string;
}

function prefer(sessions: ReflectionSession[]): ReflectionSession | undefined {
  return [...sessions].sort(
    (a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || (a.scheduledAt < b.scheduledAt ? -1 : 1),
  )[0];
}

export function pickReflectionAnnouncement(input: {
  sessions: ReflectionSession[];
  catchUpPending: number;
  now: Date;
}): ReflectionAnnouncement | null {
  const open = input.sessions.filter(
    (session) => session.status !== "completed" && session.status !== "skipped",
  );
  const overdue = open.filter((session) => deriveReflectionStatus(session, input.now) === "overdue");
  const due = open.filter((session) => deriveReflectionStatus(session, input.now) === "due");
  const unfinished = overdue.length + due.length + input.catchUpPending;
  if (overdue.length + input.catchUpPending > 0) {
    const only = overdue.length === 1 && due.length === 0 && input.catchUpPending === 0 ? overdue[0] : undefined;
    return {
      tone: "overdue",
      type: only?.type ?? prefer(overdue)?.type ?? "daily",
      count: unfinished,
      to: only ? `/plan/reflection/${only.id}` : "/plan/reflection",
    };
  }
  if (due.length > 0) {
    const chosen = prefer(due);
    if (!chosen) return null;
    return {
      tone: "available",
      type: chosen.type,
      count: due.length,
      to: `/plan/reflection/${chosen.id}`,
    };
  }
  const soon = open.filter((session) => {
    if (deriveReflectionStatus(session, input.now) !== "scheduled") return false;
    const delta = Date.parse(session.scheduledAt) - input.now.getTime();
    return delta > 0 && delta <= APPROACHING_MS;
  });
  const chosen = prefer(soon);
  if (!chosen) return null;
  return {
    tone: "approaching",
    type: chosen.type,
    count: soon.length,
    to: "/plan/reflection",
  };
}
