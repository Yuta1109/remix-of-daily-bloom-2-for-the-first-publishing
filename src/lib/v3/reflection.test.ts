import { describe, expect, it } from "vitest";
import {
  completeReflection,
  deriveReflectionStatus,
  isReflectionExecutable,
  isReflectionOverdue,
  isTerminalReflectionStatus,
  nextReflectionAnchor,
  reflectionPeriod,
  reflectionSchedule,
  skipReflection,
  startReflection,
  withDerivedStatus,
} from "@/lib/v3/reflection";
import { defaultReflectionSchedule } from "@/lib/v3/schema";
import type { ReflectionSession } from "@/lib/v3/types";

const SCHEDULED_AT = "2026-09-21T12:00:00.000Z";
const GRACE_UNTIL = "2026-09-22T12:00:00.000Z";

function session(overrides: Partial<ReflectionSession> = {}): ReflectionSession {
  return {
    id: "r1",
    type: "daily",
    targetPeriodStart: "2026-09-21",
    targetPeriodEnd: "2026-09-21",
    scheduledAt: SCHEDULED_AT,
    graceUntil: GRACE_UNTIL,
    status: "scheduled",
    createdAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("reflection status transitions", () => {
  it("is scheduled before the scheduled instant", () => {
    expect(deriveReflectionStatus(session(), new Date("2026-09-21T11:59:00.000Z"))).toBe(
      "scheduled",
    );
  });

  it("is due between scheduled and grace", () => {
    expect(deriveReflectionStatus(session(), new Date("2026-09-21T12:00:00.000Z"))).toBe("due");
    expect(deriveReflectionStatus(session(), new Date("2026-09-22T11:59:00.000Z"))).toBe("due");
    expect(deriveReflectionStatus(session(), new Date(GRACE_UNTIL))).toBe("due");
  });

  it("is overdue after grace", () => {
    const now = new Date("2026-09-25T00:00:00.000Z");
    expect(deriveReflectionStatus(session(), now)).toBe("overdue");
    expect(isReflectionOverdue(session(), now)).toBe(true);
  });

  it("never recomputes a terminal status from the clock", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    expect(deriveReflectionStatus(session({ status: "completed" }), now)).toBe("completed");
    expect(deriveReflectionStatus(session({ status: "skipped" }), now)).toBe("skipped");
    expect(isTerminalReflectionStatus("completed")).toBe(true);
    expect(isTerminalReflectionStatus("due")).toBe(false);
  });

  it("refreshes a stale stored status", () => {
    const stale = session({ status: "scheduled" });
    const refreshed = withDerivedStatus(stale, new Date("2026-09-30T00:00:00.000Z"));
    expect(refreshed.status).toBe("overdue");
    expect(refreshed).not.toBe(stale);
  });
});

describe("reflection is never a hard deadline", () => {
  it("stays executable once overdue", () => {
    const late = new Date("2026-12-01T00:00:00.000Z");
    const s = session();
    expect(isReflectionOverdue(s, late)).toBe(true);
    expect(isReflectionExecutable(s, late)).toBe(true);
  });

  it("can still be started and completed long after grace", () => {
    const late = new Date("2026-12-01T00:00:00.000Z");
    const started = startReflection(session(), late);
    expect(started.status).toBe("overdue");
    expect(started.startedAt).toBe(late.toISOString());

    const completed = completeReflection(started, late);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe(late.toISOString());
    expect(completed.startedAt).toBe(started.startedAt);
  });

  it("keeps the first startedAt on repeated starts", () => {
    const first = startReflection(session(), new Date("2026-09-21T12:30:00.000Z"));
    const second = startReflection(first, new Date("2026-09-21T18:00:00.000Z"));
    expect(second.startedAt).toBe(first.startedAt);
  });

  it("skips only from a non-terminal state", () => {
    const skipped = skipReflection(session(), new Date("2026-09-22T00:00:00.000Z"));
    expect(skipped.status).toBe("skipped");
    const completed = completeReflection(session());
    expect(skipReflection(completed).status).toBe("completed");
  });
});

describe("reflection periods and scheduling", () => {
  it("derives the review window per type", () => {
    expect(reflectionPeriod("daily", "2026-09-21")).toEqual({
      start: "2026-09-21",
      end: "2026-09-21",
    });
    expect(reflectionPeriod("weekly", "2026-09-23", 1)).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
    expect(reflectionPeriod("monthly", "2026-09-21")).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(reflectionPeriod("future", "2026-09-21")).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("derives scheduledAt / graceUntil from the user's rule", () => {
    const rule = { enabled: true, graceHours: 24, timeOfDay: "21:00" };
    const { scheduledAt, graceUntil } = reflectionSchedule(rule, "2026-09-21");
    const scheduled = new Date(scheduledAt);
    expect(scheduled.getHours()).toBe(21);
    expect(scheduled.getMinutes()).toBe(0);
    expect(Date.parse(graceUntil) - Date.parse(scheduledAt)).toBe(24 * 3_600_000);
  });

  it("advances the anchor per type", () => {
    const rules = defaultReflectionSchedule();
    expect(nextReflectionAnchor("daily", rules.daily, "2026-09-21")).toBe("2026-09-22");
    expect(nextReflectionAnchor("weekly", rules.weekly, "2026-09-21", 1)).toBe("2026-10-04");
    expect(nextReflectionAnchor("monthly", rules.monthly, "2026-09-21")).toBe("2026-10-01");
    expect(nextReflectionAnchor("future", rules.future, "2026-12-15")).toBe("2027-01-01");
  });
});
