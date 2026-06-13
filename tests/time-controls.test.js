import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock, formatDate, toLocalInputValue,
  scrubFraction, scrubInstant, startOfDay, dayFraction, instantOnDay, MAX_DAY_FRACTION,
} from '../js/ui/time-controls.js';

test('formatClock is zero-padded 24h local HH:MM', () => {
  assert.equal(formatClock(new Date(2026, 5, 7, 20, 5)), '20:05');
  assert.equal(formatClock(new Date(2026, 5, 7, 9, 0)), '09:00');
});

test('formatDate is a short, deterministic local date', () => {
  assert.equal(formatDate(new Date(2026, 5, 7, 20, 5)), 'Sun Jun 7'); // 2026-06-07 is a Sunday
  assert.equal(formatDate(new Date(2026, 0, 1, 0, 0)), 'Thu Jan 1');
});

test('toLocalInputValue matches the datetime-local format', () => {
  assert.equal(toLocalInputValue(new Date(2026, 5, 7, 9, 4)), '2026-06-07T09:04');
});

test('scrubFraction / scrubInstant round-trip and clamp', () => {
  const start = new Date('2026-06-07T01:00:00Z');
  const end = new Date('2026-06-07T11:00:00Z');
  const mid = new Date('2026-06-07T06:00:00Z');
  assert.ok(Math.abs(scrubFraction(mid, start, end) - 0.5) < 1e-9);
  assert.equal(scrubInstant(0.5, start, end).getTime(), mid.getTime());
  assert.equal(scrubFraction(new Date('2026-06-07T00:00:00Z'), start, end), 0); // before -> 0
  assert.equal(scrubFraction(new Date('2026-06-07T20:00:00Z'), start, end), 1); // after -> 1
});

test('startOfDay zeroes the local time-of-day', () => {
  const s = startOfDay(new Date(2026, 5, 7, 13, 37, 12, 500));
  assert.equal(s.getHours(), 0);
  assert.equal(s.getMinutes(), 0);
  assert.equal(s.getSeconds(), 0);
  assert.equal(s.getDate(), 7);
});

test('MAX_DAY_FRACTION keeps the scrubber inside the shown day (no next-day runaway)', () => {
  const ref = new Date(2026, 5, 7, 22, 0, 0);
  // Unclamped 1.0 is exactly midnight of the NEXT day — the runaway trigger.
  assert.equal(instantOnDay(1, ref).getDate(), 8);
  // The clamped top end is 23:59 of the SAME day, and round-trips stably: re-deriving the
  // fraction from the landed instant and scrubbing again stays put instead of walking forward.
  const top = instantOnDay(MAX_DAY_FRACTION, ref);
  assert.equal(top.getDate(), 7);
  assert.equal(top.getHours(), 23);
  assert.equal(top.getMinutes(), 59);
  const again = instantOnDay(Math.min(dayFraction(top), MAX_DAY_FRACTION), top);
  assert.equal(again.getTime(), top.getTime());
});

test('dayFraction maps midnight->0, noon->0.5, and instantOnDay inverts it', () => {
  const noon = new Date(2026, 5, 7, 12, 0, 0);
  assert.ok(Math.abs(dayFraction(noon) - 0.5) < 1e-9);
  assert.equal(dayFraction(new Date(2026, 5, 7, 0, 0, 0)), 0);
  // instantOnDay keeps the day of the reference but applies the fraction's time-of-day
  const ref = new Date(2026, 5, 7, 22, 0, 0);
  const back = instantOnDay(0.5, ref);
  assert.equal(back.getDate(), 7);
  assert.equal(back.getHours(), 12);
});
