/**
 * Helpers for the admin's manual-hours editor: convert between the periods the
 * database stores and the per-day form the editor shows, and validate before saving.
 *
 * Database side (admin_get_place().manual.hours / admin_set_place_hours):
 *   { day_of_week: 1, open_time: '08:00', close_day_of_week: 1, close_time: '17:00' }
 *   0 = Sunday; '24:00' = end of day; a closed day has no entry.
 * Editor side: { Mon: [{ open: '08:00', close: '17:00' }, ...], ..., Sun: [] }
 *   An empty list = closed. A lunch break is two periods.
 */
import { formatTime } from './clinicHours';

/** Editor order (Monday first): [key, database day number, label]. */
export const EDITOR_DAYS = [
  ['Mon', 1, 'Monday'],
  ['Tue', 2, 'Tuesday'],
  ['Wed', 3, 'Wednesday'],
  ['Thu', 4, 'Thursday'],
  ['Fri', 5, 'Friday'],
  ['Sat', 6, 'Saturday'],
  ['Sun', 0, 'Sunday'],
];

export const DEFAULT_PERIOD = { open: '09:00', close: '17:00' };
export const ALL_DAY_PERIOD = { open: '00:00', close: '24:00' };

const KEY_BY_NUMBER = Object.fromEntries(EDITOR_DAYS.map(([key, num]) => [num, key]));

function toMinutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const pad = (n) => String(n).padStart(2, '0');
const stepValue = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** An empty week: every day closed. */
export function emptyWeek() {
  return Object.fromEntries(EDITOR_DAYS.map(([key]) => [key, []]));
}

/**
 * Database periods -> editor days. `clipped` is true when a period ran past midnight:
 * the editor can't show those, so they are shortened to end at midnight.
 */
export function periodsToEditorDays(manualHours) {
  const days = emptyWeek();
  let clipped = false;
  for (const row of Array.isArray(manualHours) ? manualHours : []) {
    const key = KEY_BY_NUMBER[row.day_of_week];
    if (!key) continue;
    const overnight = row.close_day_of_week != null && row.close_day_of_week !== row.day_of_week;
    if (overnight) clipped = true;
    days[key].push({ open: row.open_time, close: overnight ? '24:00' : row.close_time });
  }
  for (const key of Object.keys(days)) {
    days[key].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
  }
  return { days, clipped };
}

/** Editor days -> the periods admin_set_place_hours takes. */
export function editorDaysToPeriods(days) {
  return EDITOR_DAYS.flatMap(([key, num]) =>
    (days[key] || []).map((p) => ({ day_of_week: num, open_time: p.open, close_time: p.close }))
  );
}

/** A readable problem with the editor's hours, or null when they can be saved. */
export function validateEditorDays(days) {
  for (const [key, , label] of EDITOR_DAYS) {
    const periods = (days[key] || [])
      .map((p) => ({ open: toMinutes(p.open), close: toMinutes(p.close) }))
      .sort((a, b) => a.open - b.open);
    for (let i = 0; i < periods.length; i += 1) {
      const { open, close } = periods[i];
      if (open === null || close === null) return `${label}: choose an opening and a closing time.`;
      if (close <= open) return `${label}: closing time must be after opening time.`;
      if (i > 0 && open < periods[i - 1].close) return `${label}: the opening hours overlap.`;
    }
  }
  return null;
}

/** True when two weeks hold the same periods (order within a day ignored). */
export function sameWeek(a, b) {
  const norm = (days) =>
    JSON.stringify(
      EDITOR_DAYS.map(([key]) =>
        [...(days[key] || [])].sort((x, y) => toMinutes(x.open) - toMinutes(y.open)).map((p) => [p.open, p.close])
      )
    );
  return norm(a) === norm(b);
}

function optionList(fromMinute, toMinute, extraValue) {
  const values = [];
  for (let t = fromMinute; t <= toMinute; t += 30) values.push(stepValue(t));
  // A time saved some other way (off the 30-minute grid) must still be selectable.
  if (extraValue && !values.includes(extraValue) && toMinutes(extraValue) !== null) {
    values.push(extraValue);
    values.sort((x, y) => toMinutes(x) - toMinutes(y));
  }
  return values.map((value) => [value, value === '24:00' ? '12:00 AM (midnight)' : formatTime(value)]);
}

/** Opening-time choices, 12:00 AM to 11:30 PM. */
export const startOptions = (currentValue) => optionList(0, 23 * 60 + 30, currentValue);

/** Closing-time choices, 12:30 AM to midnight. */
export const endOptions = (currentValue) => optionList(30, 24 * 60, currentValue);
