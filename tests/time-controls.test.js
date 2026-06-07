import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, presetInstants, scrubFraction, scrubInstant } from '../js/ui/time-controls.js';

test('formatClock is zero-padded 24h local HH:MM', () => {
  assert.equal(formatClock(new Date(2026, 5, 7, 20, 5)), '20:05');
  assert.equal(formatClock(new Date(2026, 5, 7, 9, 0)), '09:00');
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

test('presetInstants: now=null, tonight=sunset+2h, midnight=next local 00:00', () => {
  const sunset = new Date(2026, 5, 7, 20, 30);
  const sunrise = new Date(2026, 5, 8, 6, 15);
  const ref = new Date(2026, 5, 7, 21, 0);
  const p = presetInstants({ sunset, sunrise, ref });
  assert.equal(p.now, null);
  assert.equal(p.sunset.getTime(), sunset.getTime());
  assert.equal(p.sunrise.getTime(), sunrise.getTime());
  assert.equal(p.tonight.getTime(), sunset.getTime() + 2 * 3.6e6);
  assert.equal(p.midnight.getTime(), new Date(2026, 5, 8, 0, 0, 0, 0).getTime());
});
