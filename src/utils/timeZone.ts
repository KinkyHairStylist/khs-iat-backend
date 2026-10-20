// Wall-clock time in an IANA time zone, without a date library.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The date and hour it is at `instantMs` in `timeZone`: { date: "2026-10-20", hour: 14 }. */
export function zonedNow(timeZone: string, instantMs = Date.now()): { date: string; hour: number } {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Wall-clock ms (as if UTC) at `instantMs` in `timeZone`. */
function wallMsAt(timeZone: string, instantMs: number): number {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

/** The real instant a wall-clock time (ms as if UTC, see wallClockMs) happens in `timeZone`. */
export function instantOfWallClock(wallMs: number, timeZone: string): number {
  // Two passes settle the offset, including on daylight-saving change days.
  let instant = wallMs - (wallMsAt(timeZone, wallMs) - wallMs);
  instant = wallMs - (wallMsAt(timeZone, instant) - instant);
  return instant;
}

export function isTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}
