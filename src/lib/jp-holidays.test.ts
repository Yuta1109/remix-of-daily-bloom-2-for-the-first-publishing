import { describe, expect, it } from "vitest";
import { getJapaneseHolidayName, isJapaneseHoliday } from "./jp-holidays";

function parseYmd(dateYmd: string) {
  const [y, m, d] = dateYmd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isMonday(dateYmd: string) {
  return parseYmd(dateYmd).getDay() === 1;
}

function isSunday(dateYmd: string) {
  return parseYmd(dateYmd).getDay() === 0;
}

/** 内閣府公表の2026年祝日（振替休日・国民の休日含む） */
const OFFICIAL_2026: Array<[string, string]> = [
  ["2026-01-01", "元日"],
  ["2026-01-12", "成人の日"],
  ["2026-02-11", "建国記念の日"],
  ["2026-02-23", "天皇誕生日"],
  ["2026-03-20", "春分の日"],
  ["2026-04-29", "昭和の日"],
  ["2026-05-03", "憲法記念日"],
  ["2026-05-04", "みどりの日"],
  ["2026-05-05", "こどもの日"],
  ["2026-05-06", "振替休日"],
  ["2026-07-20", "海の日"],
  ["2026-08-11", "山の日"],
  ["2026-09-21", "敬老の日"],
  ["2026-09-22", "国民の休日"],
  ["2026-09-23", "秋分の日"],
  ["2026-10-12", "スポーツの日"],
  ["2026-11-03", "文化の日"],
  ["2026-11-23", "勤労感謝の日"],
];

/** 内閣府公表の2027年祝日 */
const OFFICIAL_2027: Array<[string, string]> = [
  ["2027-01-01", "元日"],
  ["2027-01-11", "成人の日"],
  ["2027-02-11", "建国記念の日"],
  ["2027-02-23", "天皇誕生日"],
  ["2027-03-21", "春分の日"],
  ["2027-03-22", "振替休日"],
  ["2027-04-29", "昭和の日"],
  ["2027-05-03", "憲法記念日"],
  ["2027-05-04", "みどりの日"],
  ["2027-05-05", "こどもの日"],
  ["2027-07-19", "海の日"],
  ["2027-08-11", "山の日"],
  ["2027-09-20", "敬老の日"],
  ["2027-09-23", "秋分の日"],
  ["2027-10-11", "スポーツの日"],
  ["2027-11-03", "文化の日"],
  ["2027-11-23", "勤労感謝の日"],
];

/** うるう年2024年（振替休日が多い年） */
const OFFICIAL_2024: Array<[string, string]> = [
  ["2024-01-01", "元日"],
  ["2024-01-08", "成人の日"],
  ["2024-02-11", "建国記念の日"],
  ["2024-02-12", "振替休日"],
  ["2024-02-23", "天皇誕生日"],
  ["2024-03-20", "春分の日"],
  ["2024-04-29", "昭和の日"],
  ["2024-05-03", "憲法記念日"],
  ["2024-05-04", "みどりの日"],
  ["2024-05-05", "こどもの日"],
  ["2024-05-06", "振替休日"],
  ["2024-07-15", "海の日"],
  ["2024-08-11", "山の日"],
  ["2024-08-12", "振替休日"],
  ["2024-09-16", "敬老の日"],
  ["2024-09-22", "秋分の日"],
  ["2024-09-23", "振替休日"],
  ["2024-10-14", "スポーツの日"],
  ["2024-11-03", "文化の日"],
  ["2024-11-04", "振替休日"],
  ["2024-11-23", "勤労感謝の日"],
];

describe("japanese holidays", () => {
  it.each(OFFICIAL_2026)("matches cabinet 2026 schedule for %s", (date, name) => {
    expect(getJapaneseHolidayName(date)).toBe(name);
    expect(isJapaneseHoliday(date)).toBe(true);
  });

  it.each(OFFICIAL_2027)("matches cabinet 2027 schedule for %s", (date, name) => {
    expect(getJapaneseHolidayName(date)).toBe(name);
  });

  it.each(OFFICIAL_2024)("matches cabinet 2024 leap-year schedule for %s", (date, name) => {
    expect(getJapaneseHolidayName(date)).toBe(name);
  });

  it("does not place 敬老の日 on the wrong Monday in 2026", () => {
    expect(getJapaneseHolidayName("2026-09-14")).toBeNull();
    expect(getJapaneseHolidayName("2026-09-21")).toBe("敬老の日");
  });

  it("places 敬老の日 on the 3rd Monday of September across years", () => {
    const expected = ["2024-09-16", "2025-09-15", "2026-09-21", "2027-09-20", "2028-09-18"];
    for (const date of expected) {
      expect(getJapaneseHolidayName(date)).toBe("敬老の日");
      expect(isMonday(date)).toBe(true);
    }
  });

  it("places happy-monday holidays on Mondays", () => {
    for (const date of ["2026-01-12", "2026-07-20", "2026-09-21", "2026-10-12"]) {
      expect(isMonday(date)).toBe(true);
      expect(getJapaneseHolidayName(date)).not.toBeNull();
    }
  });

  it("matches equinox dates on leap and non-leap years (NAOJ approximation)", () => {
    expect(getJapaneseHolidayName("2024-03-20")).toBe("春分の日");
    expect(getJapaneseHolidayName("2024-09-22")).toBe("秋分の日");
    expect(getJapaneseHolidayName("2027-03-21")).toBe("春分の日");
    expect(isSunday("2027-03-21")).toBe(true);
    expect(getJapaneseHolidayName("2027-03-22")).toBe("振替休日");
    expect(getJapaneseHolidayName("2028-03-20")).toBe("春分の日");
    expect(getJapaneseHolidayName("2028-09-22")).toBe("秋分の日");
  });

  it("does not treat Feb 29 as a holiday in leap years", () => {
    expect(getJapaneseHolidayName("2024-02-29")).toBeNull();
    expect(getJapaneseHolidayName("2028-02-29")).toBeNull();
  });

  it("includes スポーツの日 from 2022 onward", () => {
    expect(getJapaneseHolidayName("2022-10-10")).toBe("スポーツの日");
    expect(getJapaneseHolidayName("2021-10-11")).toBeNull();
  });

  it("uses Tokyo 2020/2021 special dates without duplicating regular holidays", () => {
    expect(getJapaneseHolidayName("2020-07-20")).toBeNull();
    expect(getJapaneseHolidayName("2020-07-23")).toBe("海の日");
    expect(getJapaneseHolidayName("2020-07-24")).toBe("スポーツの日");
    expect(getJapaneseHolidayName("2020-08-11")).toBeNull();
    expect(getJapaneseHolidayName("2020-08-10")).toBe("山の日");

    expect(getJapaneseHolidayName("2021-07-19")).toBeNull();
    expect(getJapaneseHolidayName("2021-07-22")).toBe("海の日");
    expect(getJapaneseHolidayName("2021-07-23")).toBe("スポーツの日");
    expect(getJapaneseHolidayName("2021-08-11")).toBeNull();
    expect(getJapaneseHolidayName("2021-08-08")).toBe("山の日");
    expect(getJapaneseHolidayName("2021-08-09")).toBe("振替休日");
  });

  it("handles Reiwa inauguration and emperor birthday era changes", () => {
    expect(getJapaneseHolidayName("2018-12-23")).toBe("天皇誕生日");
    expect(getJapaneseHolidayName("2019-02-23")).toBeNull();
    expect(getJapaneseHolidayName("2019-04-30")).toBe("国民の休日");
    expect(getJapaneseHolidayName("2019-05-01")).toBe("天皇の即位の日");
    expect(getJapaneseHolidayName("2019-05-02")).toBe("国民の休日");
    expect(getJapaneseHolidayName("2019-12-23")).toBeNull();
    expect(getJapaneseHolidayName("2020-02-23")).toBe("天皇誕生日");
  });

  it("creates 国民の休日 between 敬老の日 and 秋分の日 in 2015", () => {
    expect(getJapaneseHolidayName("2015-09-21")).toBe("敬老の日");
    expect(getJapaneseHolidayName("2015-09-22")).toBe("国民の休日");
    expect(getJapaneseHolidayName("2015-09-23")).toBe("秋分の日");
  });
});
