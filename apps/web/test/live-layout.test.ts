import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveLayoutError, liveLayoutApi } from '../lib/live-layout.ts';
import type { OverlayLayoutDto } from '@rogimarble/contracts';

const layout: OverlayLayoutDto = {
  schemaVersion: 1,
  width: 1920,
  height: 1080,
  aspectRatio: '16:9',
  background: 'transparent',
  widgets: [{ id: 'board', bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 1 }],
};

test('live layout write carries the immutable expected version and session credentials', async () => {
  let observed: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = (async (url, init) => {
    observed = { url: String(url), init };
    return new Response(JSON.stringify({ layout, layoutVersion: 8, layoutUpdatedAt: '2026-09-22T00:00:00Z' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const saved = await liveLayoutApi.put(layout, 7);
  assert.equal(saved.layoutVersion, 8);
  assert.match(observed!.url, /\/v1\/channels\/demo-channel\/overlay-layout\/live$/);
  assert.equal(observed!.init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(observed!.init?.body)), { layout, expectedVersion: 7 });
});

test('live layout conflict remains a conflict so the editor can reload instead of claiming saved', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'layout version conflict' }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  await assert.rejects(liveLayoutApi.put(layout, 2), (error: unknown) => {
    assert.ok(error instanceof LiveLayoutError);
    assert.equal(error.status, 409);
    return true;
  });
});
