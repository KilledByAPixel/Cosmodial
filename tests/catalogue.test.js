import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogue } from '../js/core/catalogue.js';

const okResponse = (data) => ({ ok: true, status: 200, json: async () => data });

test('loadCatalogue fetches, checks, and parses — passing a timeout signal to fetch', async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return okResponse([1, 2, 3]); };
  const fakeSignal = { fake: true };
  const data = await loadCatalogue('./data/stars.json', {
    fetchImpl, timeoutMs: 1234, signalFactory: (ms) => ({ ...fakeSignal, ms }),
  });
  assert.deepEqual(data, [1, 2, 3]);
  assert.equal(seen.url, './data/stars.json');
  assert.equal(seen.opts.signal.ms, 1234, 'the timeout reaches the fetch as an abort signal');
});

test('an HTTP error becomes a labelled throw, not a parsed body', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(
    loadCatalogue('./data/dso.json', { fetchImpl }),
    /dso\.json: HTTP 404/,
  );
});

test('a timed-out fetch is relabelled with the url and the waited duration', async () => {
  const timeoutErr = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
  const fetchImpl = async () => { throw timeoutErr; };
  await assert.rejects(
    loadCatalogue('./data/stars.json', { fetchImpl, timeoutMs: 60000 }),
    /stars\.json: no response after 60s/,
  );
});

test('other network errors propagate untouched', async () => {
  const netErr = new TypeError('Failed to fetch');
  const fetchImpl = async () => { throw netErr; };
  await assert.rejects(loadCatalogue('./x.json', { fetchImpl }), (e) => e === netErr);
});
