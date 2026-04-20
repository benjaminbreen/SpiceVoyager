// Shared date math for the game clock.
// The game begins on 1 May 1612; dayCount=1 is that first day.

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toCalendar(dayCount: number): { day: number; month: number; year: number } {
  let month = 4; // May (0-indexed)
  let day = Math.max(1, dayCount);
  let year = 1612;
  while (day > DAYS_IN_MONTH[month]) {
    day -= DAYS_IN_MONTH[month];
    month++;
    if (month >= 12) { month = 0; year++; }
  }
  return { day, month, year };
}

/** Short form, e.g. "MAY 1, 1612". */
export function formatGameDateShort(dayCount: number): string {
  const { day, month, year } = toCalendar(dayCount);
  return `${MONTH_SHORT[month]} ${day}, ${year}`;
}

/** Long form, e.g. "1 May, 1612". */
export function formatGameDateLong(dayCount: number): string {
  const { day, month, year } = toCalendar(dayCount);
  return `${day} ${MONTH_LONG[month]}, ${year}`;
}

/** Long form with clock time, e.g. "1 May, 1612 — 8:00 AM". */
export function formatGameDateTime(dayCount: number, timeOfDay: number): string {
  const base = formatGameDateLong(dayCount);
  const hours = Math.floor(timeOfDay);
  const minutes = Math.floor((timeOfDay % 1) * 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${base} \u2014 ${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
