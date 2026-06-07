import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScheduler } from '../js/core/scheduler.js';

test('multiple requests coalesce into one render per frame', () => {
  let renders = 0;
  const queue = [];
  const fakeRaf = (cb) => { queue.push(cb); };
  const requestRender = createRenderScheduler(() => { renders++; }, fakeRaf);

  requestRender(); requestRender(); requestRender();
  assert.equal(renders, 0, 'nothing renders before the frame fires');
  assert.equal(queue.length, 1, 'only one frame is scheduled');

  queue.shift()();                 // fire the frame
  assert.equal(renders, 1, 'exactly one render per frame');

  requestRender();                 // a new request after the frame schedules again
  assert.equal(queue.length, 1);
  queue.shift()();
  assert.equal(renders, 2);
});
