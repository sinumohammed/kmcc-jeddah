// KMCC's day, for "today", "this month" and the assistant's daily limits:
// KMCC_TIMEZONE (default Asia/Riyadh - Jeddah), not the server's UTC.
export const KMCC_TIMEZONE = process.env.KMCC_TIMEZONE || 'Asia/Riyadh';

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: KMCC_TIMEZONE });

// "2026-10-19" in KMCC's time zone.
export const dayOf = (date: Date) => dayFormatter.format(date);
export const today = () => dayOf(new Date());

// The moment a KMCC day ("2026-10-19") starts: its midnight in KMCC's time zone.
export function startOfDay(day: string): Date {
  const asUtc = Date.parse(`${day}T00:00:00Z`);
  // How far KMCC's wall clock is ahead of UTC at that moment.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: KMCC_TIMEZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(asUtc))
      .map((p) => [p.type, p.value])
  );
  const wall = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return new Date(asUtc - (wall - asUtc));
}

// The day after "2026-10-19".
export const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

// { year, month } (month 1-12) of a date in KMCC's time zone.
export function yearMonthOf(date: Date) {
  const [y, m] = dayOf(date).split('-').map(Number);
  return { year: y, month: m };
}
