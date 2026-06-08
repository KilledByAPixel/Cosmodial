import { test } from 'node:test';
import assert from 'node:assert/strict';
import { umbralVisibility, findEclipseContext } from '../js/guide/eclipses.js';

const MIN = 60 * 1000;

// Build a fake normalized eclipse (matches astro.js output shape).
function mkEclipse(kind, peakISO, sdPartialMin, sdTotalMin) {
  const peak = new Date(peakISO);
  const at = (m, s) => (m > 0 ? new Date(peak.getTime() + s * m * MIN) : null);
  return {
    kind, peak,
    contacts: {
      partialBegin: at(sdPartialMin, -1), totalBegin: at(sdTotalMin, -1), peak,
      totalEnd: at(sdTotalMin, +1), partialEnd: at(sdPartialMin, +1),
    },
    totalityMinutes: sdTotalMin > 0 ? sdTotalMin * 2 : null,
  };
}

// Walk a sorted list of eclipses as the injected getFirst/getNextAfter.
function iterator(list) {
  const sorted = [...list].sort((a, b) => a.peak - b.peak);
  return {
    getFirst: (d) => sorted.find((e) => e.peak >= d) || null,
    getNextAfter: (peak) => sorted.find((e) => e.peak > peak) || null,
  };
}

test('umbralVisibility classifies full / partial / none', () => {
  const e = mkEclipse('total', '2026-01-10T05:00:00Z', 90, 30);
  assert.equal(umbralVisibility(e, () => 40), 'full');       // up throughout
  assert.equal(umbralVisibility(e, () => -40), 'none');      // down throughout
  // up at partialBegin only -> partial
  const upAtStart = (d) => (d.getTime() === e.contacts.partialBegin.getTime() ? 20 : -20);
  assert.equal(umbralVisibility(e, upAtStart), 'partial');
  // penumbral (no umbral contacts) -> none
  assert.equal(umbralVisibility(mkEclipse('penumbral', '2026-01-10T05:00:00Z', 0, 0), () => 80), 'none');
});

test('findEclipseContext skips penumbral and picks the next visible eclipse', () => {
  const list = [
    mkEclipse('penumbral', '2026-06-15T00:00:00Z', 0, 0), // after `at`, so the kind-skip path runs
    mkEclipse('partial', '2026-07-01T00:00:00Z', 60, 0),
    mkEclipse('total', '2027-01-01T00:00:00Z', 90, 30),
  ];
  const { getFirst, getNextAfter } = iterator(list);
  const ctx = findEclipseContext({
    at: new Date('2026-06-01T00:00:00Z'), getFirst, getNextAfter, moonAltAt: () => 50,
  });
  assert.equal(ctx.inProgress, null);
  assert.ok(ctx.next, 'has a next');
  assert.equal(ctx.next.kind, 'partial');
  assert.equal(ctx.next.peak.toISOString(), '2026-07-01T00:00:00.000Z');
});

test('findEclipseContext flags an eclipse in progress at the set time', () => {
  const total = mkEclipse('total', '2026-07-01T05:00:00Z', 90, 30);
  const { getFirst, getNextAfter } = iterator([total]);
  // set time = peak (inside the partial window)
  const ctx = findEclipseContext({
    at: new Date('2026-07-01T05:00:00Z'), getFirst, getNextAfter, moonAltAt: () => 50,
  });
  assert.ok(ctx.inProgress, 'in progress at peak');
  assert.equal(ctx.inProgress.visibility, 'full');
  assert.equal(ctx.next, null, 'no future eclipse beyond it');
});

test('findEclipseContext skips eclipses not visible from here', () => {
  const list = [
    mkEclipse('total', '2026-07-01T00:00:00Z', 90, 30), // Moon down -> none
    mkEclipse('partial', '2026-12-01T00:00:00Z', 60, 0), // Moon up -> visible
  ];
  const { getFirst, getNextAfter } = iterator(list);
  const downFirst = (d) => (d < new Date('2026-09-01T00:00:00Z') ? -30 : 40);
  const ctx = findEclipseContext({
    at: new Date('2026-06-01T00:00:00Z'), getFirst, getNextAfter, moonAltAt: downFirst,
  });
  assert.equal(ctx.next.peak.toISOString(), '2026-12-01T00:00:00.000Z');
});

test('findEclipseContext stops searching once the next visible eclipse is found', () => {
  // Many future eclipses, but the search must stop at the first visible one rather than scanning
  // to the maxYears horizon (the per-frame cost guard).
  const list = [
    mkEclipse('partial', '2026-07-01T00:00:00Z', 60, 0),
    mkEclipse('total', '2027-01-01T00:00:00Z', 90, 30),
    mkEclipse('total', '2027-07-01T00:00:00Z', 90, 30),
    mkEclipse('total', '2028-01-01T00:00:00Z', 90, 30),
  ];
  const sorted = [...list].sort((a, b) => a.peak - b.peak);
  let nextCalls = 0;
  const getFirst = (d) => sorted.find((e) => e.peak >= d) || null;
  const getNextAfter = (peak) => { nextCalls++; return sorted.find((e) => e.peak > peak) || null; };
  const ctx = findEclipseContext({
    at: new Date('2026-06-01T00:00:00Z'), getFirst, getNextAfter, moonAltAt: () => 50,
  });
  assert.equal(ctx.next.peak.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.ok(nextCalls <= 1, `should stop early, made ${nextCalls} getNextAfter calls`);
});
