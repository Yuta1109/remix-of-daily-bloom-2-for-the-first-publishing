/** Japanese public holidays (祝日法 + 振替休日 + 国民の休日). */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function nthMonday(year: number, month: number, n: number) {
  const first = new Date(year, month - 1, 1);
  const offset = (8 - first.getDay()) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

/** ハッピーマンデー制度の祝日（n = その月の第 n 月曜日） */
const HAPPY_MONDAY = {
  seijin: { month: 1, nth: 2, name: "成人の日" },
  marine: { month: 7, nth: 3, name: "海の日" },
  respectAged: { month: 9, nth: 3, name: "敬老の日" },
  sports: { month: 10, nth: 2, name: "スポーツの日" },
} as const;

function addHappyMonday(
  add: (d: Date, name: string) => void,
  year: number,
  spec: (typeof HAPPY_MONDAY)[keyof typeof HAPPY_MONDAY],
) {
  add(nthMonday(year, spec.month, spec.nth), spec.name);
}

/** 国立天文台の近似式（1980–2099年向け。官報公表日と一致する想定） */
function vernalEquinoxDay(year: number) {
  const d = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return new Date(year, 2, d);
}

function autumnalEquinoxDay(year: number) {
  const d = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return new Date(year, 8, d);
}

function addEmperorBirthday(add: (d: Date, name: string) => void, year: number) {
  if (year >= 2020) {
    add(new Date(year, 1, 23), "天皇誕生日");
  } else if (year >= 1989 && year <= 2018) {
    add(new Date(year, 11, 23), "天皇誕生日");
  }
}

function addOneOffHolidays(add: (d: Date, name: string) => void, year: number) {
  if (year === 2019) {
    add(new Date(2019, 4, 1), "天皇の即位の日");
  }
  if (year === 2020) {
    add(new Date(2020, 6, 23), "海の日");
    add(new Date(2020, 6, 24), "スポーツの日");
    add(new Date(2020, 7, 10), "山の日");
  }
  if (year === 2021) {
    add(new Date(2021, 6, 22), "海の日");
    add(new Date(2021, 6, 23), "スポーツの日");
    add(new Date(2021, 7, 8), "山の日");
  }
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toKey(d: Date) {
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const cache = new Map<number, Map<string, string>>();

function holidaysForYear(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const map = new Map<string, string>();
  const add = (d: Date, name: string) => map.set(toKey(d), name);

  add(new Date(year, 0, 1), "元日");
  addHappyMonday(add, year, HAPPY_MONDAY.seijin);
  add(new Date(year, 1, 11), "建国記念の日");
  addEmperorBirthday(add, year);
  add(vernalEquinoxDay(year), "春分の日");
  add(new Date(year, 3, 29), "昭和の日");
  add(new Date(year, 4, 3), "憲法記念日");
  add(new Date(year, 4, 4), "みどりの日");
  add(new Date(year, 4, 5), "こどもの日");
  if (year !== 2020 && year !== 2021) {
    addHappyMonday(add, year, HAPPY_MONDAY.marine);
  }
  if (year !== 2020 && year !== 2021) {
    add(new Date(year, 7, 11), "山の日");
  }
  addHappyMonday(add, year, HAPPY_MONDAY.respectAged);
  add(autumnalEquinoxDay(year), "秋分の日");
  if (year >= 2022) {
    addHappyMonday(add, year, HAPPY_MONDAY.sports);
  }
  add(new Date(year, 10, 3), "文化の日");
  add(new Date(year, 10, 23), "勤労感謝の日");

  addOneOffHolidays(add, year);

  // 振替休日
  for (const [key, name] of [...map.entries()]) {
    if (name === "振替休日" || name === "国民の休日") continue;
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() !== 0) continue;
    let next = addDays(dt, 1);
    while (map.has(toKey(next))) next = addDays(next, 1);
    map.set(toKey(next), "振替休日");
  }

  // 国民の休日: weekday sandwiched by holidays
  for (let month = 1; month <= 12; month++) {
    const last = new Date(year, month, 0).getDate();
    for (let day = 1; day <= last; day++) {
      const cur = new Date(year, month - 1, day);
      if (cur.getDay() === 0 || cur.getDay() === 6) continue;
      const k = toKey(cur);
      if (map.has(k)) continue;
      if (map.has(toKey(addDays(cur, -1))) && map.has(toKey(addDays(cur, 1)))) {
        map.set(k, "国民の休日");
      }
    }
  }

  cache.set(year, map);
  return map;
}

export function getJapaneseHolidayName(dateYmd: string): string | null {
  const y = Number(dateYmd.slice(0, 4));
  if (!y) return null;
  return holidaysForYear(y).get(dateYmd) ?? null;
}

export function isJapaneseHoliday(dateYmd: string): boolean {
  return getJapaneseHolidayName(dateYmd) !== null;
}
