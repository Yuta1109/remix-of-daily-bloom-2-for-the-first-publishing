import { describe, expect, it } from "vitest";
import {
  CHALLENGE_CADENCE_EPOCH,
  CHALLENGE_DEFINITIONS,
  DAILY_CHALLENGE_COUNT,
  NORMAL_CHALLENGE_POINTS,
  SPECIAL_CHALLENGE_DEFINITIONS,
  challengeDefinition,
  isCadenceEligible,
  isDailyChallengeEligible,
  selectChallengesForDate,
} from "@/lib/v3/challenge-definitions";
import {
  assignmentIdsAreUnique,
  dailyChallengeIdsForDate,
  dateHasFrozenAssignments,
} from "@/lib/v3/challenge-engine";
import { addDays } from "@/lib/v3/local-date";

describe("challenge catalog", () => {
  it("is static predefined configuration with unique ids", () => {
    const ids = CHALLENGE_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CHALLENGE_DEFINITIONS.length).toBeGreaterThanOrEqual(DAILY_CHALLENGE_COUNT);
  });

  it("awards five points for every normal daily challenge", () => {
    expect(NORMAL_CHALLENGE_POINTS).toBe(5);
    for (const definition of CHALLENGE_DEFINITIONS) {
      expect(definition.points).toBe(NORMAL_CHALLENGE_POINTS);
      expect(definition.type).toBe("daily");
      expect(definition.active).toBe(true);
      expect(definition.titleKey).toBeTruthy();
      expect(definition.descriptionKey).toBeTruthy();
      expect(definition.category).toBeTruthy();
    }
  });

  it("keeps Special Challenge as a separate type outside the daily pool", () => {
    expect(SPECIAL_CHALLENGE_DEFINITIONS.length).toBeGreaterThan(0);
    for (const definition of SPECIAL_CHALLENGE_DEFINITIONS) {
      expect(definition.type).toBe("special");
      expect(isDailyChallengeEligible(definition, "2026-09-21")).toBe(false);
    }
    expect(selectChallengesForDate("2026-09-21").map((d) => d.id)).not.toContain(
      "special.coming_soon",
    );
  });

  it("looks a definition up by id", () => {
    expect(challengeDefinition("challenge.task_created")?.condition).toEqual({
      type: "activityCount",
      activity: "task_created",
      count: 1,
    });
    expect(challengeDefinition("special.coming_soon")?.type).toBe("special");
    expect(challengeDefinition("nope")).toBeUndefined();
  });
});

describe("reflection challenge cadence", () => {
  it("offers the daily reflection challenge every day", () => {
    const definition = challengeDefinition("challenge.reflection_daily");
    for (let i = 0; i < 7; i++) {
      expect(isCadenceEligible(definition, addDays(CHALLENGE_CADENCE_EPOCH, i))).toBe(true);
    }
  });

  it("offers the weekly reflection challenge every three days", () => {
    const definition = challengeDefinition("challenge.reflection_weekly");
    expect(isCadenceEligible(definition, CHALLENGE_CADENCE_EPOCH)).toBe(true);
    expect(isCadenceEligible(definition, addDays(CHALLENGE_CADENCE_EPOCH, 1))).toBe(false);
    expect(isCadenceEligible(definition, addDays(CHALLENGE_CADENCE_EPOCH, 2))).toBe(false);
    expect(isCadenceEligible(definition, addDays(CHALLENGE_CADENCE_EPOCH, 3))).toBe(true);
  });

  it("offers the monthly reflection challenge every week", () => {
    const definition = challengeDefinition("challenge.reflection_monthly");
    expect(isCadenceEligible(definition, CHALLENGE_CADENCE_EPOCH)).toBe(true);
    expect(isCadenceEligible(definition, addDays(CHALLENGE_CADENCE_EPOCH, 6))).toBe(false);
    expect(isCadenceEligible(definition, addDays(CHALLENGE_CADENCE_EPOCH, 7))).toBe(true);
  });

  it("offers the future reflection challenge once a month", () => {
    const definition = challengeDefinition("challenge.reflection_future");
    expect(isCadenceEligible(definition, "2026-09-01")).toBe(true);
    expect(isCadenceEligible(definition, "2026-09-02")).toBe(false);
    expect(isCadenceEligible(definition, "2026-10-01")).toBe(true);
  });
});

describe("daily selection", () => {
  it("1. picks ten challenges when the eligible pool is large enough", () => {
    const selected = selectChallengesForDate("2026-09-21");
    expect(selected).toHaveLength(DAILY_CHALLENGE_COUNT);
  });

  it("2. never assigns the same challenge twice on one date", () => {
    const ids = dailyChallengeIdsForDate("2026-09-21");
    expect(assignmentIdsAreUnique(ids)).toBe(true);
  });

  it("3. is stable for the same local date", () => {
    const first = selectChallengesForDate("2026-09-21");
    const second = selectChallengesForDate("2026-09-21");
    expect(first.map((d) => d.id)).toEqual(second.map((d) => d.id));
  });

  it("4. changes assignment when the local date changes", () => {
    const first = dailyChallengeIdsForDate("2026-09-01");
    const second = dailyChallengeIdsForDate("2026-09-02");
    expect(first).toContain("challenge.reflection_future");
    expect(second).not.toContain("challenge.reflection_future");
    expect(first).not.toEqual(second);
  });

  it("always includes the daily reflection challenge", () => {
    for (const date of ["2026-09-01", "2026-09-21", "2026-10-15"]) {
      expect(selectChallengesForDate(date).map((d) => d.id)).toContain(
        "challenge.reflection_daily",
      );
    }
  });

  it("8. only offers cadence-eligible active daily definitions", () => {
    const selected = selectChallengesForDate("2026-09-02");
    expect(selected.map((d) => d.id)).not.toContain("challenge.reflection_future");
    for (const definition of selected) {
      expect(isDailyChallengeEligible(definition, "2026-09-02")).toBe(true);
    }
    const inactive = {
      ...CHALLENGE_DEFINITIONS[0],
      id: "challenge.inactive",
      active: false,
    };
    expect(selectChallengesForDate("2026-09-21", [inactive])).toEqual([]);
  });

  it("freezes when assignments for the date already exist", () => {
    expect(
      dateHasFrozenAssignments(
        [{ id: "a", date: "2026-09-21", challengeDefinitionId: "x", status: "pending", pointsAwarded: 0 }],
        "2026-09-21",
      ),
    ).toBe(true);
    expect(dateHasFrozenAssignments([], "2026-09-21")).toBe(false);
  });
});
