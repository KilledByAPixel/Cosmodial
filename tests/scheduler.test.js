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

test('renderFn may request another render from inside the frame', () => {
  const queue = [];
  const fakeRaf = (cb) => { queue.push(cb); };
  let renders = 0;
  let again = true;
  const requestRender = createRenderScheduler(() => {
    renders++;
    if (again) { again = false; requestRender(); } // re-request during render
  }, fakeRaf);

  requestRender();
  assert.equal(queue.length, 1);
  queue.shift()();                 // first frame: renders once and schedules a second
  assert.equal(renders, 1);
  assert.equal(queue.length, 1, 're-request inside render scheduled a new frame');
  queue.shift()();
  assert.equal(renders, 2);
});
