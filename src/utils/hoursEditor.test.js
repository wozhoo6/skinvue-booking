import { describe, expect, it } from 'vitest';
import {
  editorDaysToPeriods,
  emptyWeek,
  endOptions,
  periodsToEditorDays,
  sameWeek,
  startOptions,
  validateEditorDays,
} from './hoursEditor';

describe('periodsToEditorDays', () => {
  it('groups database periods by day and sorts them', () => {
    const { days, clipped } = periodsToEditorDays([
      { day_of_week: 1, open_time: '13:00', close_day_of_week: 1, close_time: '17:00' },
      { day_of_week: 1, open_time: '08:00', close_day_of_week: 1, close_time: '12:00' },
      { day_of_week: 0, open_time: '10:00', close_day_of_week: 0, close_time: '14:00' },
    ]);
    expect(days.Mon).toEqual([
      { open: '08:00', close: '12:00' },
      { open: '13:00', close: '17:00' },
    ]);
    expect(days.Sun).toEqual([{ open: '10:00', close: '14:00' }]);
    expect(days.Tue).toEqual([]);
    expect(clipped).toBe(false);
  });

  it('clips a period running past midnight and says so', () => {
    const { days, clipped } = periodsToEditorDays([
      { day_of_week: 5, open_time: '22:00', close_day_of_week: 6, close_time: '02:00' },
    ]);
    expect(days.Fri).toEqual([{ open: '22:00', close: '24:00' }]);
    expect(clipped).toBe(true);
  });

  it('handles no manual hours', () => {
    expect(periodsToEditorDays(undefined).days).toEqual(emptyWeek());
    expect(periodsToEditorDays(null).clipped).toBe(false);
  });
});

describe('editorDaysToPeriods', () => {
  it('uses 0 for Sunday and skips closed days', () => {
    const days = { ...emptyWeek(), Mon: [{ open: '09:00', close: '17:00' }], Sun: [{ open: '10:00', close: '12:00' }] };
    expect(editorDaysToPeriods(days)).toEqual([
      { day_of_week: 1, open_time: '09:00', close_time: '17:00' },
      { day_of_week: 0, open_time: '10:00', close_time: '12:00' },
    ]);
  });

  it('round-trips with the database shape', () => {
    const rows = [
      { day_of_week: 3, open_time: '08:00', close_day_of_week: 3, close_time: '12:00' },
      { day_of_week: 3, open_time: '13:00', close_day_of_week: 3, close_time: '24:00' },
    ];
    const periods = editorDaysToPeriods(periodsToEditorDays(rows).days);
    expect(periods).toEqual([
      { day_of_week: 3, open_time: '08:00', close_time: '12:00' },
      { day_of_week: 3, open_time: '13:00', close_time: '24:00' },
    ]);
  });
});

describe('validateEditorDays', () => {
  const week = (mon) => ({ ...emptyWeek(), Mon: mon });

  it('accepts a normal week, a lunch break and an all-closed week', () => {
    expect(validateEditorDays(emptyWeek())).toBeNull();
    expect(validateEditorDays(week([{ open: '09:00', close: '17:00' }]))).toBeNull();
    expect(
      validateEditorDays(week([{ open: '08:00', close: '12:00' }, { open: '12:00', close: '17:00' }]))
    ).toBeNull();
  });

  it('rejects closing at or before opening', () => {
    expect(validateEditorDays(week([{ open: '17:00', close: '09:00' }]))).toMatch(/Monday.*after opening/);
    expect(validateEditorDays(week([{ open: '09:00', close: '09:00' }]))).toMatch(/Monday/);
  });

  it('rejects overlapping periods', () => {
    expect(
      validateEditorDays(week([{ open: '08:00', close: '13:00' }, { open: '12:00', close: '17:00' }]))
    ).toMatch(/overlap/);
  });
});

describe('sameWeek', () => {
  it('ignores the order of periods inside a day', () => {
    const a = { ...emptyWeek(), Mon: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }] };
    const b = { ...emptyWeek(), Mon: [{ open: '13:00', close: '17:00' }, { open: '08:00', close: '12:00' }] };
    expect(sameWeek(a, b)).toBe(true);
    expect(sameWeek(a, emptyWeek())).toBe(false);
  });
});

describe('time options', () => {
  it('start options run 12:00 AM to 11:30 PM; end options 12:30 AM to midnight', () => {
    const starts = startOptions();
    const ends = endOptions();
    expect(starts[0]).toEqual(['00:00', '12:00 AM']);
    expect(starts[starts.length - 1]).toEqual(['23:30', '11:30 PM']);
    expect(ends[0]).toEqual(['00:30', '12:30 AM']);
    expect(ends[ends.length - 1]).toEqual(['24:00', '12:00 AM (midnight)']);
  });

  it('keeps an off-grid saved time selectable', () => {
    expect(startOptions('08:15').some(([v]) => v === '08:15')).toBe(true);
    expect(endOptions('17:10').map(([v]) => v)).toContain('17:10');
  });
});
