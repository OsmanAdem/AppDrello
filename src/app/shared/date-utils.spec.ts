import { addDays, daysBetween, parseDateKey, startOfWeek, toDateKey } from './date-utils';

describe('date-utils', () => {
  it('formats a date as YYYY-MM-DD with leading zeros', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('turns a date key back into the same local date', () => {
    const date = parseDateKey('2026-11-02');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10); // months start at 0
    expect(date.getDate()).toBe(2);
  });

  it('adds and subtracts days across months and years', () => {
    expect(toDateKey(addDays(new Date(2026, 0, 30), 3))).toBe('2026-02-02');
    expect(toDateKey(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('does not change the date it was given', () => {
    const original = new Date(2026, 5, 10);
    addDays(original, 5);
    expect(toDateKey(original)).toBe('2026-06-10');
  });

  it('finds the Monday of the week', () => {
    // 2026-11-04 is a Wednesday, 2026-11-08 a Sunday
    expect(toDateKey(startOfWeek(new Date(2026, 10, 4)))).toBe('2026-11-02');
    expect(toDateKey(startOfWeek(new Date(2026, 10, 8)))).toBe('2026-11-02');
    expect(toDateKey(startOfWeek(new Date(2026, 10, 2)))).toBe('2026-11-02');
  });

  it('counts whole days, also across a daylight saving change', () => {
    expect(daysBetween(new Date(2026, 10, 2), new Date(2026, 10, 9))).toBe(7);
    // Clocks go back in late October in Europe
    expect(daysBetween(new Date(2026, 9, 20), new Date(2026, 10, 3))).toBe(14);
  });
});
