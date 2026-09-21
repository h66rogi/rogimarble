import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../lib/api.ts';
import { shouldAcceptSnapshot } from '../lib/snapshot-order.ts';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });

const state = { session: { id: 's1', channelId: 'preview', status: 'running', sessionEpoch: 1, revision: 2, boardVersionId: 'b1', currentCellId: 'cell-02', direction: 'forward', automaticMovementPaused: false, presentationEpoch: 1, previewOnly: true, createdAt: '', updatedAt: '' }, inventory: [], missions: [], capabilities: { manualRoll: true, setDirection: true, setPosition: true, arrivalEffects: false, donations: false, inventory: true, missions: true, sessionLifecycle: true } };

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
function command(commandId: string) { return { commandId, sessionId: 's1', sessionEpoch: 1, presentationEpoch: 1, type: 'roll_dice', status: 'completed', operatorId: 'o1', beforeRevision: 1, afterRevision: 2, result: { dice: [1, 1], distance: 2, direction: 'forward', path: ['cell-01', 'cell-02'], fromCellId: 'cell-26', toCellId: 'cell-02' }, rejectionCode: null, createdAt: '' }; }

test('response loss reconciles by the same command id without a second POST', async () => {
  sessionStorage.clear(); let posted = ''; let posts = 0;
  globalThis.fetch = (async (input, init) => { const url = String(input); if (init?.method === 'POST') { posts += 1; posted = String(init.body); throw new TypeError('lost response'); } if (url.includes('/commands/')) return response(command(JSON.parse(posted).commandId)); if (url.includes('/operator-state')) return response(state); throw new Error(url); }) as typeof fetch;
  const result = await api.command('s1', { type: 'roll', expectedRevision: 1, reason: 'test' }, 1);
  assert.equal(posts, 1); assert.equal(result.command.commandId, JSON.parse(posted).commandId); assert.equal(api.pending(), null);
});

test('drop before commit retries the byte-identical body and command id', async () => {
  sessionStorage.clear(); let firstBody = ''; let posts = 0; let committed = false;
  globalThis.fetch = (async (input, init) => { const url = String(input); if (init?.method === 'POST') { posts += 1; const body = String(init.body); if (!firstBody) { firstBody = body; throw new TypeError('dropped before commit'); } assert.equal(body, firstBody); committed = true; return response(command(JSON.parse(body).commandId)); } if (url.includes('/commands/')) return committed ? response(command(JSON.parse(firstBody).commandId)) : response({ message: 'missing' }, 404); if (url.includes('/operator-state')) return response(state); throw new Error(url); }) as typeof fetch;
  await assert.rejects(api.command('s1', { type: 'roll', expectedRevision: 1, reason: 'test' }, 1));
  const pendingId = api.pending()?.commandId; const result = await api.retryPending();
  assert.equal(posts, 2); assert.equal(result.command?.commandId, pendingId); assert.equal(api.pending(), null);
});

test('snapshot ordering rejects pre-mutation and older-revision responses', () => {
  const current = { revision: 7, session: { id: 's1', sessionEpoch: 2 } };
  assert.equal(shouldAcceptSnapshot(current, { ...current, revision: 6 }, 12, 10, 10), false);
  assert.equal(shouldAcceptSnapshot(current, { ...current, revision: 7 }, 8, 10, 9), false);
  assert.equal(shouldAcceptSnapshot(current, { ...current, revision: 8 }, 12, 10, 9), true);
  assert.equal(shouldAcceptSnapshot(current, { revision: 100, session: { id: 'old', sessionEpoch: 1 } }, 9, 10, 9, true), false);
});

test('successful POST with lost snapshot stays pending until lookup reconciliation', async () => {
  sessionStorage.clear(); let commandId = ''; let snapshotFails = true;
  globalThis.fetch = (async (input, init) => { const url = String(input); if (init?.method === 'POST') { commandId = JSON.parse(String(init.body)).commandId; return response(command(commandId)); } if (url.includes('/commands/')) return response(command(commandId)); if (url.includes('/operator-state')) { if (snapshotFails) throw new TypeError('snapshot lost'); return response(state); } throw new Error(url); }) as typeof fetch;
  await assert.rejects(api.command('s1', { type: 'roll', expectedRevision: 1, reason: 'test' }, 1));
  assert.equal(api.pending()?.commandId, commandId); snapshotFails = false;
  const result = await api.reconcilePending(); assert.equal(result.command.commandId, commandId); assert.equal(api.pending(), null);
});

test('snapshot authorization failure does not discard an acknowledged intent', async () => {
  sessionStorage.clear(); let commandId = '';
  globalThis.fetch = (async (input, init) => { const url = String(input); if (init?.method === 'POST') { commandId = JSON.parse(String(init.body)).commandId; return response(command(commandId)); } if (url.includes('/operator-state')) return response({ message: 'login' }, 401); throw new Error(url); }) as typeof fetch;
  await assert.rejects(api.command('s1', { type: 'roll', expectedRevision: 1, reason: 'test' }, 1));
  assert.equal(api.pending()?.commandId, commandId);
});

test('token auth bootstrap stores the API-issued CSRF token without retaining the bearer', async () => {
  sessionStorage.clear();
  globalThis.fetch = (async input => { const url = String(input); if (url.endsWith('/v1/auth/config')) return response({ mode: 'token', loginUrl: null, localLoginEnabled: false }); if (url.endsWith('/v1/auth/session')) return response({ operator: { id: 'o1', username: 'operator', role: 'operator' }, csrfToken: 'bound-token', authMode: 'token' }); throw new Error(url); }) as typeof fetch;
  assert.deepEqual(await api.authConfig(), { mode: 'token', loginUrl: null, localLoginEnabled: false });
  await api.bootstrapSession(); assert.equal(sessionStorage.getItem('rogimarble.csrf'), 'bound-token');
});

test('401 and 403 mutation responses preserve the immutable pending intent', async () => {
  for (const status of [401, 403]) {
    sessionStorage.clear();
    globalThis.fetch = (async (_input, init) => init?.method === 'POST' ? response({ message: 'reauthenticate' }, status) : response({ message: 'missing' }, 404)) as typeof fetch;
    await assert.rejects(api.command('s1', { type: 'roll', expectedRevision: 1, reason: 'test' }, 1));
    assert.ok(api.pending()?.commandId, `pending intent must survive ${status}`);
  }
});
