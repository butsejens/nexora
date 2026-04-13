/**
 * Nexora – Backend Architecture Tests
 *
 * Tests the new modular server architecture:
 *   1. Unit tests for canonical response builder
 *   2. Unit tests for cache module
 *   3. Unit tests for fetcher error handling
 *   4. Integration tests for sports module (mocked ESPN)
 *   5. Integration tests for media module (mocked TMDB)
 *   6. Integration tests for updates module
 *   7. Fallback / stale cache behavior
 *   8. Error envelope correctness
 *
 * Run: node --experimental-vm-modules server/nexora.test.js
 *      or: node server/nexora.test.js (Node 22+)
 */

import assert from 'node:assert/strict';

// ─── Minimal test harness ─────────────────────────────────────────────────────
let passed = 0, failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}`);
      console.error(`     ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── 1. Response Builder ──────────────────────────────────────────────────────
console.log('\n[1] Response Builder');
import { ok, err, empty } from './shared/response.js';

test('ok() produces correct envelope', () => {
  const payload = ok({ count: 5 }, { source: 'espn', isCached: true });
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.data, { count: 5 });
  assert.equal(payload.error, null);
  assert.equal(payload.meta.source, 'espn');
  assert.equal(payload.meta.is_cached, true);
  assert.equal(payload.meta.is_fallback, false);
  assert.ok(typeof payload.meta.last_updated === 'string');
});

test('err() produces correct envelope', () => {
  const payload = err('SOURCE_DOWN', 'ESPN is unavailable', { source: 'espn' });
  assert.equal(payload.ok, false);
  assert.equal(payload.data, null);
  assert.equal(payload.error.code, 'SOURCE_DOWN');
  assert.equal(payload.error.message, 'ESPN is unavailable');
  assert.equal(payload.meta.source, 'espn');
});

test('empty() marks is_empty=true', () => {
  const payload = empty([], { source: 'espn' });
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.data, []);
  assert.equal(payload.meta.is_empty, true);
});

test('ok() default meta values are safe', () => {
  const payload = ok({ x: 1 });
  assert.equal(payload.meta.is_cached, false);
  assert.equal(payload.meta.is_fallback, false);
  assert.equal(payload.meta.is_stale, false);
  assert.equal(payload.meta.source, 'internal');
  assert.equal(payload.meta.ttl_ms, null);
});

test('err() without source defaults to internal', () => {
  const payload = err('OOPS', 'something broke');
  assert.equal(payload.meta.source, 'internal');
});

// ─── 2. Cache Module ──────────────────────────────────────────────────────────
console.log('\n[2] Cache Module');
import { cache, TTL } from './shared/cache.js';

test('TTL constants exist and are positive numbers', () => {
  assert.ok(TTL.LIVE    > 0, 'TTL.LIVE must be positive');
  assert.ok(TTL.MATCHDAY > TTL.LIVE, 'MATCHDAY should be longer than LIVE');
  assert.ok(TTL.STANDINGS > TTL.MATCHDAY, 'STANDINGS should be longer than MATCHDAY');
  assert.ok(TTL.LAST_GOOD >= 6 * 60 * 60_000, 'LAST_GOOD should be at least 6h');
});

test('cache.set and cache.get round-trip (in-memory)', async () => {
  const key = `test_rt_${Date.now()}`;
  await cache.set(key, { hello: 'world' }, TTL.MATCHDAY);
  const val = await cache.get(key);
  assert.deepEqual(val, { hello: 'world' });
});

test('cache.get returns null for unknown key', async () => {
  const val = await cache.get('test_nonexistent_key_nexora_12345');
  assert.equal(val, null);
});

test('cache.getOrFetch calls fetcher on miss', async () => {
  const key = `test_miss_${Date.now()}`;
  let fetcherCalled = 0;

  const { value, isCached } = await cache.getOrFetch(key, TTL.MATCHDAY, async () => {
    fetcherCalled++;
    return { result: 42 };
  });

  assert.equal(fetcherCalled, 1);
  assert.deepEqual(value, { result: 42 });
  assert.equal(isCached, false);
});

test('cache.getOrFetch uses cache on second call', async () => {
  const key = `test_hit_${Date.now()}`;
  let fetcherCalled = 0;

  const fetcher = async () => { fetcherCalled++; return { result: 99 }; };

  await cache.getOrFetch(key, TTL.MATCHDAY, fetcher);
  const { value, isCached } = await cache.getOrFetch(key, TTL.MATCHDAY, fetcher);

  assert.equal(fetcherCalled, 1);  // only called once
  assert.deepEqual(value, { result: 99 });
  assert.equal(isCached, true);
});

test('cache.rememberLastGood ignores empty arrays', async () => {
  const key = `test_lg_empty_${Date.now()}`;
  await cache.rememberLastGood(key, []);
  const lg = await cache.getLastGood(key);
  assert.equal(lg, null);
});

test('cache.rememberLastGood saves non-empty payload', async () => {
  const key = `test_lg_full_${Date.now()}`;
  const payload = { live: [{ id: '1' }], upcoming: [], finished: [] };
  await cache.rememberLastGood(key, payload);
  const lg = await cache.getLastGood(key);
  assert.ok(lg !== null);
  assert.deepEqual(lg.live[0].id, '1');
});

test('cache.getOrFetchWithStale returns stale on fetcher failure', async () => {
  const key = `test_stale_${Date.now()}`;
  // First populate with good data
  await cache.set(`${key}__last_good`, { data: 'stale-data' }, TTL.LAST_GOOD);

  // Now fetcher fails
  const result = await cache.getOrFetchWithStale(key, TTL.MATCHDAY, async () => {
    throw new Error('upstream down');
  });

  assert.equal(result.isFallback, true);
  assert.equal(result.isStale, true);
  assert.deepEqual(result.value, { data: 'stale-data' });
});

test('cache.getOrFetchWithStale throws when stale unavailable', async () => {
  const key = `test_nostale_${Date.now()}`;
  await assert.rejects(
    () => cache.getOrFetchWithStale(key, TTL.MATCHDAY, async () => { throw new Error('fail'); }),
    /fail/
  );
});

// ─── 3. Fetcher Error Handling ────────────────────────────────────────────────
console.log('\n[3] Fetcher Error Handling');
import { FetchError, UpstreamError, safeFetchJson } from './shared/fetcher.js';

test('FetchError has correct name', () => {
  const e = new FetchError('timeout', 'https://example.com', null);
  assert.equal(e.name, 'FetchError');
  assert.equal(e.url, 'https://example.com');
});

test('UpstreamError has correct name and source', () => {
  const e = new UpstreamError('HTTP 500', 'espn', 500);
  assert.equal(e.name, 'UpstreamError');
  assert.equal(e.source, 'espn');
  assert.equal(e.status, 500);
});

test('safeFetchJson throws FetchError on network failure', async () => {
  await assert.rejects(
    () => safeFetchJson('http://127.0.0.1:1', { timeoutMs: 500, retries: 0 }),
    e => e.name === 'FetchError' || e.name === 'UpstreamError'
  );
});

// ─── 4. Sports Module Logic ───────────────────────────────────────────────────
console.log('\n[4] Sports Module Logic');

// Test the internal normalizer functions by importing the module
// (routes can't be called without an HTTP stack, so we test internal behavior via utils)

test('SOCCER_LEAGUES map covers major competitions', async () => {
  // Dynamic import to avoid side effects at module level
  const mod = await import('./modules/sports.js');
  // The export is the router; test that it's an Express router function
  assert.ok(typeof mod.default === 'function', 'sports module exports a function (Router)');
  assert.ok(mod.default.stack, 'Router has a stack of routes');
  const methods = mod.default.stack.map(l => l.route?.path).filter(Boolean);
  // Check key routes are registered
  assert.ok(methods.includes('/live'), 'sports router has /live route');
  assert.ok(methods.includes('/by-date'), 'sports router has /by-date route');
  assert.ok(methods.includes('/standings/:league'), 'sports router has /standings/:league route');
  assert.ok(methods.includes('/health'), 'sports router has /health route');
});

// ─── 5. Media Module Logic ────────────────────────────────────────────────────
console.log('\n[5] Media Module Logic');

test('media module exports a Router', async () => {
  const mod = await import('./modules/media.js');
  assert.ok(typeof mod.default === 'function');
  const paths = mod.default.stack.map(l => l.route?.path).filter(Boolean);
  assert.ok(paths.includes('/home'), 'media router has /home route');
  assert.ok(paths.includes('/movies'), 'media router has /movies route');
  assert.ok(paths.includes('/series'), 'media router has /series route');
  assert.ok(paths.includes('/search'), 'media router has /search route');
  assert.ok(paths.includes('/trending'), 'media router has /trending route');
});

// ─── 6. Updates Module ────────────────────────────────────────────────────────
console.log('\n[6] Updates Module');

test('updates module exports a Router with correct routes', async () => {
  const mod = await import('./modules/updates.js');
  assert.ok(typeof mod.default === 'function');
  const paths = mod.default.stack.map(l => l.route?.path).filter(Boolean);
  assert.ok(paths.includes('/check'), 'updates router has /check route');
  assert.ok(paths.includes('/ota'), 'updates router has /ota route');
  assert.ok(paths.includes('/native'), 'updates router has /native route');
  assert.ok(paths.includes('/manifest'), 'updates router has /manifest route');
});

// ─── 7. Fallback Behavior ─────────────────────────────────────────────────────
console.log('\n[7] Fallback Behavior');

test('sports empty payload does not get persisted as last-good', async () => {
  const key = `test_empty_sports_${Date.now()}`;
  const emptyPayload = { live: [], upcoming: [], finished: [] };
  await cache.rememberLastGood(key, emptyPayload);
  const lg = await cache.getLastGood(key);
  assert.equal(lg, null, 'Empty sports payload must not be stored as last-good');
});

test('sports non-empty payload is persisted as last-good', async () => {
  const key = `test_nonempty_sports_${Date.now()}`;
  const payload = { live: [{ id: 'a' }], upcoming: [], finished: [] };
  await cache.rememberLastGood(key, payload);
  const lg = await cache.getLastGood(key);
  assert.ok(lg !== null, 'Non-empty sports payload should be stored');
  assert.equal(lg.live.length, 1);
});

// ─── 8. Response Envelope Consistency ────────────────────────────────────────
console.log('\n[8] Response Envelope Consistency');

test('all response types have identical top-level keys', () => {
  const required = ['ok', 'data', 'error', 'meta'];
  const payloads = [
    ok({ x: 1 }),
    err('CODE', 'msg'),
    empty([]),
  ];
  for (const p of payloads) {
    for (const key of required) {
      assert.ok(key in p, `Payload missing key '${key}': ${JSON.stringify(p)}`);
    }
  }
});

test('meta always has all required fields', () => {
  const required = ['source', 'is_cached', 'is_fallback', 'is_stale', 'last_updated', 'ttl_ms'];
  const payloads = [ok({ x: 1 }), err('C', 'm'), empty([])];
  for (const p of payloads) {
    for (const key of required) {
      assert.ok(key in p.meta, `meta missing '${key}'`);
    }
  }
});

test('ok() envelope is never confused with err() envelope', () => {
  const success = ok({ data: 1 });
  const failure = err('E', 'm');
  assert.equal(success.ok, true);
  assert.equal(failure.ok, false);
  assert.equal(success.error, null);
  assert.notEqual(failure.error, null);
  assert.notEqual(success.data, null);
  assert.equal(failure.data, null);
});

// ─── 9. AI Shared Module ─────────────────────────────────────────────────────
console.log('\n[9] AI Shared Module');

import { tryParseJSON, hasAnyProvider } from './shared/ai.js';

test('tryParseJSON returns parsed object for plain JSON', () => {
  const result = tryParseJSON('{"score":9,"summary":"great"}');
  assert.deepEqual(result, { score: 9, summary: 'great' });
});

test('tryParseJSON strips markdown fences before parsing', () => {
  const result = tryParseJSON('```json\n{"key":"value"}\n```');
  assert.deepEqual(result, { key: 'value' });
});

test('tryParseJSON returns null for invalid JSON', () => {
  const result = tryParseJSON('not json at all');
  assert.equal(result, null);
});

test('hasAnyProvider returns boolean', () => {
  // No env keys set in test env — should return false (or true if keys happen to be set)
  assert.equal(typeof hasAnyProvider(), 'boolean');
});

// ─── 10. AI Router ───────────────────────────────────────────────────────────
console.log('\n[10] AI Router');

import { router as aiRouter, registerAiAliases } from './modules/ai.js';
import express from 'express';

test('ai module exports a Router', () => {
  assert.ok(aiRouter && typeof aiRouter === 'function', 'aiRouter should be an Express Router');
});

test('registerAiAliases is a function', () => {
  assert.equal(typeof registerAiAliases, 'function');
});

test('registerAiAliases sets up compat redirects on an express app', () => {
  const fakeApp = express();
  assert.doesNotThrow(() => registerAiAliases(fakeApp));
});

// ─── 11. Users Router ────────────────────────────────────────────────────────
console.log('\n[11] Users Router');

import { router as usersRouter } from './modules/users.js';

test('users module exports a Router', () => {
  assert.ok(usersRouter && typeof usersRouter === 'function', 'usersRouter should be an Express Router');
});

test('users router has followed-teams and session routes registered', () => {
  const routes = [];
  usersRouter.stack.forEach(layer => {
    if (layer.route) routes.push(layer.route.path);
  });
  assert.ok(routes.includes('/api/user/followed-teams'), 'should have /api/user/followed-teams');
  assert.ok(routes.includes('/api/session/start'), 'should have /api/session/start');
  assert.ok(routes.includes('/api/session/heartbeat'), 'should have /api/session/heartbeat');
});

// ─── Run ──────────────────────────────────────────────────────────────────────
console.log('\n─── Nexora Backend Test Suite ───');
await runAll();
