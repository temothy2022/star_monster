const DATE_PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const existing = DATE_PARTS_FORMATTERS.get(timeZone);
  if (existing) return existing;

  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  DATE_PARTS_FORMATTERS.set(timeZone, created);
  return created;
}

export function businessDateAt(instant: Date, timeZone: string): Date {
  const parts = formatter(timeZone).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function businessMinuteOfDayAt(
  instant: Date,
  timeZone: string,
): number {
  let timeFormatter = TIME_PARTS_FORMATTERS.get(timeZone);
  if (!timeFormatter) {
    timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    TIME_PARTS_FORMATTERS.set(timeZone, timeFormatter);
  }
  const parts = timeFormatter.formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

export function businessDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function startOfBusinessWeek(date: Date): Date {
  const weekday = date.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addBusinessDays(date, -daysSinceMonday);
}

export function differenceInWholeSeconds(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 1000));
}
