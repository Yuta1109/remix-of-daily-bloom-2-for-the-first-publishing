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

function vernalEquinoxDay(year: number) {
  const d = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return new Date(year, 2, d);
}

function autumnalEquinoxDay(year: number) {
  const d = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return new Date(year, 8, d);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toKey(d: Date) {
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const cache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const dates: Date[] = [
    new Date(year, 0, 1),
    nthMonday(year, 1, 2),
    new Date(year, 1, 11),
    new Date(year, 1, 23),
    vernalEquinoxDay(year),
    new Date(year, 3, 29),
    new Date(year, 4, 3),
    new Date(year, 4, 4),
    new Date(year, 4, 5),
    nthMonday(year, 7, 3),
    new Date(year, 7, 11),
    nthMonday(year, 9, 2),
    autumnalEquinoxDay(year),
    new Date(year, 10, 3),
    new Date(year, 10, 23),
  ];
  if (year === 2020) {
    dates.push(new Date(2020, 6, 23), new Date(2020, 6, 24));
  }
  if (year === 2021) {
    dates.push(new Date(2021, 6, 22), new Date(2021, 6, 23));
  }

  const set = new Set(dates.map(toKey));

  // 振替休日
  for (const key of [...set]) {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() !== 0) continue;
    let next = addDays(dt, 1);
    while (set.has(toKey(next))) next = addDays(next, 1);
    set.add(toKey(next));
  }

  // 国民の休日: weekday sandwiched by holidays
  for (let month = 1; month <= 12; month++) {
    const last = new Date(year, month, 0).getDate();
    for (let day = 1; day <= last; day++) {
      const cur = new Date(year, month - 1, day);
      if (cur.getDay() === 0 || cur.getDay() === 6) continue;
      const k = toKey(cur);
      if (set.has(k)) continue;
      if (set.has(toKey(addDays(cur, -1))) && set.has(toKey(addDays(cur, 1)))) {
        set.add(k);
      }
    }
  }

  cache.set(year, set);
  return set;
}

export function isJapaneseHoliday(dateYmd: string): boolean {
  const y = Number(dateYmd.slice(0, 4));
  if (!y) return false;
  return holidaysForYear(y).has(dateYmd);
}
