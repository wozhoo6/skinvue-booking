/**
 * Helpers for a clinic's opening hours as returned by get_place / nearby_places /
 * search_places (private.place_json in Supabase):
 *
 *   opening_hours = {
 *     Mon: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }],
 *     Fri: [{ open: '22:00', close: '02:00', close_day: 'Sat' }],   // runs past midnight
 *     Sun: [],                                                       // closed
 *     ...
 *   }
 *
 * Keys are Sun..Sat. "24:00" means the end of the day. `{}` (or null) means the
 * hours are UNKNOWN — Google had none — which is not the same as closed.
 */

export const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Display order for a week list (Monday first) with full names. */
export const WEEK_DAYS = [
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
  ['Sun', 'Sunday'],
];

export const SLOT_STEP_MINUTES = 30;

// Used for booking when a clinic's hours are unknown: weekdays, 8:00 AM to 6:00 PM.
const DEFAULT_OPEN_DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const DEFAULT_FIRST_MINUTE = 8 * 60;
const DEFAULT_LAST_MINUTE = 18 * 60;

function toMinutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToValue(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'HH:MM' -> '8:00 AM'. 24:00 reads as 12:00 AM. */
export function formatTime(hhmm) {
  const minutes = toMinutes(hhmm);
  if (minutes === null) return '';
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function periodsOf(openingHours, dayKey) {
  const periods = openingHours?.[dayKey];
  return Array.isArray(periods)
    ? periods.filter((p) => toMinutes(p?.open) !== null && toMinutes(p?.close) !== null)
    : [];
}

/**
 * True when the API gave usable hours: at least one day has an open period.
 * `{}`, null, and a week of nothing but empty days all count as "unknown".
 */
export function hasOpeningHours(openingHours) {
  if (!openingHours || typeof openingHours !== 'object') return false;
  return DAY_KEYS.some((key) => periodsOf(openingHours, key).length > 0);
}

/** One period as text: '8:00 AM – 12:00 PM', with the close day when it runs past midnight. */
export function formatPeriod(period) {
  const text = `${formatTime(period.open)} – ${formatTime(period.close)}`;
  return period.close_day ? `${text} (${period.close_day})` : text;
}

/**
 * One day as a list of strings, one per period. Empty array = closed.
 * Hours must be known (see hasOpeningHours) for "closed" to be a fair reading.
 */
export function formatDayPeriods(openingHours, dayKey) {
  return periodsOf(openingHours, dayKey).map(formatPeriod);
}

/** "Open today: 8:00 AM – 5:00 PM" / "Closed today", or null when hours are unknown. */
export function getTodayHoursLabel(openingHours, now = new Date()) {
  if (!hasOpeningHours(openingHours)) return null;
  const parts = formatDayPeriods(openingHours, DAY_KEYS[now.getDay()]);
  if (parts.length === 0) return 'Closed today';
  return `Open today: ${parts.join(', ')}`;
}

// A booking window must start and end on the same day (the server checks), so the latest
// end of the day is 11:30 PM even for a clinic open until midnight.
const LAST_END_MINUTE = 23 * 60 + 30;
// The server rejects windows longer than 12 hours.
const MAX_WINDOW_MINUTES = 12 * 60;

/**
 * The stretches of one day a visitor can book inside, as [startMinute, endMinute] pairs.
 *  - Known hours: each open period. One running past midnight ends at the end of that day.
 *  - Unknown hours: weekdays 8:00 AM - 6:00 PM, nothing on weekends.
 */
function bookableRanges(openingHours, dayKey) {
  if (hasOpeningHours(openingHours)) {
    return periodsOf(openingHours, dayKey).map((period) => {
      const open = toMinutes(period.open);
      const close = toMinutes(period.close);
      const end = close > open ? close : 24 * 60;
      return [open, Math.min(end, LAST_END_MINUTE)];
    });
  }
  return DEFAULT_OPEN_DAYS.has(dayKey) ? [[DEFAULT_FIRST_MINUTE, DEFAULT_LAST_MINUTE]] : [];
}

/** First 30-minute step at or after `minute`. */
const roundUpToStep = (minute) => Math.ceil(minute / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;

/**
 * Bookable START times for one day: [['08:00', '8:00 AM'], ...] in 30-minute steps.
 * Each start leaves room for at least one step before the clinic closes.
 * `minMinute` drops times earlier than that (used to hide times already past today).
 */
export function getBookableTimes(openingHours, dayKey, minMinute = 0) {
  const minutes = new Set();
  for (const [start, end] of bookableRanges(openingHours, dayKey)) {
    for (let t = roundUpToStep(start); t + SLOT_STEP_MINUTES <= end; t += SLOT_STEP_MINUTES) {
      minutes.add(t);
    }
  }
  return [...minutes]
    .filter((t) => t >= minMinute)
    .sort((a, b) => a - b)
    .map((t) => [minutesToValue(t), formatTime(minutesToValue(t))]);
}

/**
 * Bookable END times for a window starting at `fromValue` ('HH:MM') on one day.
 * The window must fit inside ONE open period (no spanning a lunch break) and last at most
 * 12 hours, in 30-minute steps. Empty until a valid start is given.
 */
export function getBookableEndTimes(openingHours, dayKey, fromValue) {
  const from = toMinutes(fromValue);
  if (from === null) return [];
  const range = bookableRanges(openingHours, dayKey).find(
    ([start, end]) => from >= start && from + SLOT_STEP_MINUTES <= end
  );
  if (!range) return [];
  const last = Math.min(range[1], from + MAX_WINDOW_MINUTES);
  const out = [];
  for (let t = from + SLOT_STEP_MINUTES; t <= last; t += SLOT_STEP_MINUTES) {
    out.push([minutesToValue(t), formatTime(minutesToValue(t))]);
  }
  return out;
}

/** 'YYYY-MM-DD' in the viewer's local time (what a date input uses). */
export function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The next `days` calendar days (starting today) that have at least one bookable time:
 * [{ value: 'YYYY-MM-DD', label: 'Mon, Nov 16', dayKey: 'Mon' }, ...].
 * Today only counts if a time later than now is still available.
 */
export function getBookableDates(openingHours, days = 60, now = new Date()) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayKey = DAY_KEYS[date.getDay()];
    const minMinute = i === 0 ? now.getHours() * 60 + now.getMinutes() + 1 : 0;
    if (getBookableTimes(openingHours, dayKey, minMinute).length === 0) continue;
    out.push({
      value: localDateString(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      dayKey,
    });
  }
  return out;
}

/** Times for a chosen 'YYYY-MM-DD' (empty until a date is picked or if it isn't bookable). */
export function getBookableTimesForDate(openingHours, dateString, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
  if (!match) return [];
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const isToday = localDateString(date) === localDateString(now);
  return getBookableTimes(
    openingHours,
    DAY_KEYS[date.getDay()],
    isToday ? now.getHours() * 60 + now.getMinutes() + 1 : 0
  );
}

/** End times for a chosen 'YYYY-MM-DD' day and start time. */
export function getBookableEndTimesForDate(openingHours, dateString, fromValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
  if (!match) return [];
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return getBookableEndTimes(openingHours, DAY_KEYS[date.getDay()], fromValue);
}

const WEEKDAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

/**
 * Why a picked 'YYYY-MM-DD' can't be booked, in words for the visitor, or null when it can
 * (or when nothing is picked yet). `windowDays` is how far ahead booking reaches.
 */
export function describeUnavailableDate(openingHours, dateString, windowDays = 60, now = new Date()) {
  if (!dateString) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return 'Choose a valid date.';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date < today) return 'Choose a date from today onward.';
  const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + windowDays - 1);
  if (date > last) return `Choose a date within the next ${windowDays} days.`;
  if (getBookableTimesForDate(openingHours, dateString, now).length > 0) return null;

  const dayKey = DAY_KEYS[date.getDay()];
  if (date.getTime() === today.getTime() && getBookableTimes(openingHours, dayKey).length > 0) {
    return 'No times are left today. Please choose another day.';
  }
  return hasOpeningHours(openingHours)
    ? `The clinic is closed on ${WEEKDAY_NAMES[dayKey]}s. Please choose another day.`
    : 'Weekends aren’t available. Please choose a weekday.';
}
