import assert from 'node:assert/strict';
import test from 'node:test';
import { apiClient } from '../src/shared/lib/api-client.ts';
import { getDefaultBase, melomingUrl } from '../src/shared/lib/service-routes.ts';

test('imported console transport never reaches fetch and fails token reads closed', async () => {
  let fetchCalls = 0;
  const priorFetch = globalThis.fetch;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error('network attempted'); }) as typeof fetch;
  try {
    await assert.rejects(
      apiClient.get('/console-api/sessions/active', { params: { token: 'untrusted' } }),
      (error: any) => error?.response?.status === 501 && error?.response?.data?.code === 'unsupported_imported_console_request',
    );
    await assert.rejects(
      apiClient.post('/auth/login', { token: 'untrusted' }),
      (error: any) => error?.response?.status === 501,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test('only explicit empty resources use 404 and never synthetic success', async () => {
  await assert.rejects(apiClient.get('/song-live/sessions/active'), (error: any) => error?.response?.status === 404);
  await assert.rejects(apiClient.get('/song-requests'), (error: any) => error?.response?.status === 501);
});

test('imported service links remain local unavailable routes', () => {
  assert.equal(getDefaultBase('rental'), '/unavailable/imported-service/rental');
  assert.equal(melomingUrl('media'), '/unavailable/imported-service/media');
});
