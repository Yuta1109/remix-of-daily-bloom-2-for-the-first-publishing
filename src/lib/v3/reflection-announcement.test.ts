import { describe, expect, it } from "vitest";
import { pickReflectionAnnouncement } from "@/lib/v3/reflection-announcement";
import type { ReflectionSession } from "@/lib/v3/types";

function session(partial: Partial<ReflectionSession> & Pick<ReflectionSession, "id" | "type" | "scheduledAt">): ReflectionSession {
  return {
    targetPeriodStart: "2026-09-26",
    targetPeriodEnd: "2026-09-26",
    graceUntil: "2026-09-27T17:00:00.000Z",
    status: "scheduled",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("Reflection announcement", () => {
  const now = new Date("2026-09-26T16:00:00.000Z");

  it("points at one overdue reflection", () => {
    const late = session({
      id: "late",
      type: "daily",
      scheduledAt: "2026-09-25T08:00:00.000Z",
      graceUntil: "2026-09-25T12:00:00.000Z",
      status: "overdue",
    });
    const picked = pickReflectionAnnouncement({ sessions: [late], catchUpPending: 0, now });
    expect(picked).toMatchObject({ tone: "overdue", count: 1, to: "/plan/reflection/late" });
  });

  it("opens today's available reflection when nothing is overdue", () => {
    const ready = session({
      id: "today",
      type: "daily",
      scheduledAt: "2026-09-26T15:00:00.000Z",
      graceUntil: "2026-09-27T15:00:00.000Z",
      status: "due",
    });
    const picked = pickReflectionAnnouncement({ sessions: [ready], catchUpPending: 0, now });
    expect(picked).toMatchObject({
      tone: "available",
      type: "daily",
      to: "/plan/reflection/today",
    });
  });

  it("sends an approaching reflection to the hub without opening the review", () => {
    const soon = session({
      id: "soon",
      type: "weekly",
      scheduledAt: "2026-09-26T18:00:00.000Z",
      graceUntil: "2026-09-27T18:00:00.000Z",
      status: "scheduled",
    });
    const picked = pickReflectionAnnouncement({ sessions: [soon], catchUpPending: 0, now });
    expect(picked).toMatchObject({ tone: "approaching", type: "weekly", to: "/plan/reflection" });
  });
});
