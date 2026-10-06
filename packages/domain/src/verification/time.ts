// Day boundaries use the user's own timezone (IANA name like "Asia/Kolkata").

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

export function isValidTimezone(tz: string): boolean {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

// "2026-03-08" style local calendar date for an instant.
export function localDate(iso: string | number, tz: string): string {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`bad time: ${iso}`);
  const p = parts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// The UTC instant when the wall clock in tz reads the given local date and time.
export function zonedToUtc(date: string, hour: number, minute: number, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = wall - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// A day settles at 06:00 local the next morning so an overnight sync still counts.
export function settleAt(date: string, tz: string, graceHour = 6): number {
  return zonedToUtc(addDays(date, 1), graceHour, 0, tz);
}

export const HOUR_MS = 3_600_000;
