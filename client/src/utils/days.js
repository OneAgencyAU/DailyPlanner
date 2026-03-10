export const DAY_THEMES = [
  { day: 'Monday', emoji: '\u{1F9E0}', theme: 'AI Research & News', focus: 'Read, learn, stay current on AI' },
  { day: 'Tuesday', emoji: '\u{1F6E0}\uFE0F', theme: 'Development', focus: 'Build client and internal projects' },
  { day: 'Wednesday', emoji: '\u{1F6E0}\uFE0F', theme: 'Development', focus: 'Build client and internal projects' },
  { day: 'Thursday', emoji: '\u{1F4E8}', theme: 'Outreach & Sales', focus: 'Find clients, follow up, send proposals' },
  { day: 'Friday', emoji: '\u{1F4CA}', theme: 'Market Research & Business Planning', focus: 'Strategy, research, planning ONE AGENCY' },
];

/**
 * Get the Monday of the week containing the given date.
 */
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get array of 5 weekday dates (Mon-Fri) for the week containing the given date.
 */
export function getWeekDates(date) {
  const monday = getMonday(date);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/**
 * Format date as YYYY-MM-DD.
 */
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get ISO week number.
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Check if two dates are the same calendar day.
 */
export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
