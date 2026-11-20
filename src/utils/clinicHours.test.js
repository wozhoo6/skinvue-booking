import { describe, expect, it } from 'vitest';
import {
  describeUnavailableDate,
  formatDayPeriods,
  getBookableDates,
  getBookableEndTimes,
  getBookableEndTimesForDate,
  getBookableTimes,
  getBookableTimesForDate,
  getTodayHoursLabel,
  hasOpeningHours,
} from './clinicHours';

const weekdays9to5 = {
  Sun: [],
  Mon: [{ open: '09:00', close: '17:00' }],
  Tue: [{ open: '09:00', close: '17:00' }],
  Wed: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '15:00' }],
  Thu: [{ open: '09:00', close: '17:00' }],
  Fri: [{ open: '22:00', close: '02:00', close_day: 'Sat' }],
  Sat: [{ open: '08:15', close: '09:30' }],
};

// 2026-11-11 is a Wednesday.
const wednesdayNoon = new Date(2026, 10, 11, 12, 0);

describe('hasOpeningHours', () => {
  it('treats {}, null and an all-closed week as unknown', () => {
    expect(hasOpeningHours({})).toBe(false);
    expect(hasOpeningHours(null)).toBe(false);
    expect(hasOpeningHours(undefined)).toBe(false);
    expect(hasOpeningHours({ Mon: [], Tue: [] })).toBe(false);
  });
  it('is true when any day has a period', () => {
    expect(hasOpeningHours(weekdays9to5)).toBe(true);
  });
});

describe('getTodayHoursLabel', () => {
  it('formats split shifts', () => {
    expect(getTodayHoursLabel(weekdays9to5, wednesdayNoon)).toBe(
      'Open today: 9:00 AM – 12:00 PM, 1:00 PM – 3:00 PM'
    );
  });
  it('says closed for an empty day and null for unknown hours', () => {
    expect(getTodayHoursLabel(weekdays9to5, new Date(2026, 10, 15))).toBe('Closed today'); // Sunday
    expect(getTodayHoursLabel({}, wednesdayNoon)).toBeNull();
  });
});

describe('formatDayPeriods', () => {
  it('adds the close day for overnight periods', () => {
    expect(formatDayPeriods(weekdays9to5, 'Fri')).toEqual(['10:00 PM – 2:00 AM (Sat)']);
  });
});

describe('getBookableTimes', () => {
  it('stops one step before closing', () => {
    const times = getBookableTimes(weekdays9to5, 'Mon').map(([v]) => v);
    expect(times[0]).toBe('09:00');
    expect(times[times.length - 1]).toBe('16:30');
  });
  it('skips the lunch gap in split shifts', () => {
    const times = getBookableTimes(weekdays9to5, 'Wed').map(([v]) => v);
    expect(times).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30']);
  });
  it('rounds an off-grid opening time up and ends overnight periods before midnight', () => {
    expect(getBookableTimes(weekdays9to5, 'Sat')[0][0]).toBe('08:30');
    const fri = getBookableTimes(weekdays9to5, 'Fri').map(([v]) => v);
    expect(fri[0]).toBe('22:00');
    // A window can't cross midnight, so the last start leaves room for a 11:30 PM end.
    expect(fri[fri.length - 1]).toBe('23:00');
  });
  it('offers nothing on a closed day', () => {
    expect(getBookableTimes(weekdays9to5, 'Sun')).toEqual([]);
  });
  it('unknown hours: weekdays 8 AM to 6 PM, no weekends', () => {
    const mon = getBookableTimes({}, 'Mon').map(([v]) => v);
    expect(mon[0]).toBe('08:00');
    expect(mon[mon.length - 1]).toBe('17:30'); // the last start still has a 6:00 PM end
    expect(getBookableTimes({}, 'Sat')).toEqual([]);
    expect(getBookableTimes(null, 'Sun')).toEqual([]);
  });
  it('minMinute hides times already past', () => {
    const times = getBookableTimes(weekdays9to5, 'Mon', 16 * 60).map(([v]) => v);
    expect(times).toEqual(['16:00', '16:30']);
  });
});

describe('getBookableDates', () => {
  it('only lists days the clinic is open', () => {
    const dates = getBookableDates({ Mon: [{ open: '09:00', close: '17:00' }] }, 21, wednesdayNoon);
    expect(dates.length).toBe(3);
    expect(dates.every((d) => d.dayKey === 'Mon')).toBe(true);
  });
  it('unknown hours: no weekends', () => {
    const dates = getBookableDates({}, 30, wednesdayNoon);
    expect(dates.some((d) => d.dayKey === 'Sat' || d.dayKey === 'Sun')).toBe(false);
    expect(dates.length).toBeGreaterThan(15);
  });
  it('drops today when every time has passed', () => {
    const lateWednesday = new Date(2026, 10, 11, 23, 0);
    const dates = getBookableDates({}, 3, lateWednesday);
    expect(dates[0].value).toBe('2026-11-12');
  });
});

describe('getBookableTimesForDate', () => {
  it('returns [] for no date and follows the weekday of a date', () => {
    expect(getBookableTimesForDate(weekdays9to5, '', wednesdayNoon)).toEqual([]);
    expect(getBookableTimesForDate(weekdays9to5, '2026-11-16', wednesdayNoon)[0][0]).toBe('09:00'); // Monday
  });
});

describe('getBookableEndTimes', () => {
  it('lists times after the start, up to closing', () => {
    const ends = getBookableEndTimes(weekdays9to5, 'Mon', '16:00').map(([v]) => v);
    expect(ends).toEqual(['16:30', '17:00']);
  });
  it('never reaches past the open period that contains the start (lunch gap)', () => {
    const ends = getBookableEndTimes(weekdays9to5, 'Wed', '11:00').map(([v]) => v);
    expect(ends).toEqual(['11:30', '12:00']);
  });
  it('caps a window at 12 hours', () => {
    const allDay = { Mon: [{ open: '00:00', close: '24:00' }] };
    const ends = getBookableEndTimes(allDay, 'Mon', '06:00').map(([v]) => v);
    expect(ends[ends.length - 1]).toBe('18:00');
  });
  it('ends at 11:30 PM at the latest, even for a clinic open until midnight', () => {
    const allDay = { Mon: [{ open: '00:00', close: '24:00' }] };
    const ends = getBookableEndTimes(allDay, 'Mon', '23:00').map(([v]) => v);
    expect(ends).toEqual(['23:30']);
    expect(getBookableEndTimes(allDay, 'Mon', '23:30')).toEqual([]);
  });
  it('unknown hours: up to 6:00 PM on weekdays, nothing on weekends', () => {
    const ends = getBookableEndTimes({}, 'Tue', '17:00').map(([v]) => v);
    expect(ends).toEqual(['17:30', '18:00']);
    expect(getBookableEndTimes({}, 'Sat', '10:00')).toEqual([]);
  });
  it('is empty for a start that is not bookable or missing', () => {
    expect(getBookableEndTimes(weekdays9to5, 'Mon', '')).toEqual([]);
    expect(getBookableEndTimes(weekdays9to5, 'Mon', '08:00')).toEqual([]);
    expect(getBookableEndTimes(weekdays9to5, 'Mon', '17:00')).toEqual([]);
  });
  it('follows the weekday of a date', () => {
    expect(getBookableEndTimesForDate(weekdays9to5, '2026-11-16', '16:30').map(([v]) => v)).toEqual(['17:00']); // Monday
    expect(getBookableEndTimesForDate(weekdays9to5, '', '16:30')).toEqual([]);
  });
});

describe('describeUnavailableDate', () => {
  // 2026-11-11 is a Wednesday, so 11-15 is a Sunday and 11-16 a Monday.
  it('is null when nothing is picked or the day is bookable', () => {
    expect(describeUnavailableDate(weekdays9to5, '', 60, wednesdayNoon)).toBeNull();
    expect(describeUnavailableDate(weekdays9to5, '2026-11-16', 60, wednesdayNoon)).toBeNull();
  });
  it('explains a closed day by name', () => {
    expect(describeUnavailableDate(weekdays9to5, '2026-11-15', 60, wednesdayNoon)).toMatch(/closed on Sundays/);
  });
  it('unknown hours: explains weekends', () => {
    expect(describeUnavailableDate({}, '2026-11-14', 60, wednesdayNoon)).toMatch(/Weekends/);
    expect(describeUnavailableDate({}, '2026-11-16', 60, wednesdayNoon)).toBeNull();
  });
  it('flags past and too-far dates', () => {
    expect(describeUnavailableDate(weekdays9to5, '2026-11-10', 60, wednesdayNoon)).toMatch(/today onward/);
    expect(describeUnavailableDate(weekdays9to5, '2027-06-01', 60, wednesdayNoon)).toMatch(/next 60 days/);
  });
  it('says so when today has no times left', () => {
    const late = new Date(2026, 10, 11, 23, 0);
    expect(describeUnavailableDate({}, '2026-11-11', 60, late)).toMatch(/No times are left today/);
  });
});
