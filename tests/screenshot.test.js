import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenshotName } from '../js/ui/screenshot.js';

test('screenshotName: cosmodial-YYYYMMDD-HHMMSS.png in local time, zero-padded', () => {
  assert.equal(screenshotName(new Date(2026, 5, 10, 9, 5, 3)), 'cosmodial-20260610-090503.png');
  assert.equal(screenshotName(new Date(2026, 11, 31, 23, 59, 59)), 'cosmodial-20261231-235959.png');
  assert.equal(screenshotName(new Date(2026, 0, 1, 0, 0, 0)), 'cosmodial-20260101-000000.png');
});
