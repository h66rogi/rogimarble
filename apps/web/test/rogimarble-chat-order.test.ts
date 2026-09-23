import test from 'node:test';
import assert from 'node:assert/strict';
import { orderChatForDisplay } from '../src/integrated-overlay/domains/overlay/components/rogimarble-chat-order.ts';

test('a delayed SOOP donation appears before its later chat message', () => {
  const chat = { type: 'chat' as const, userId: 'donor', timestamp: '2026-09-23T00:00:00.101Z' };
  const donation = { type: 'donation' as const, userId: 'donor', timestamp: '2026-09-23T00:00:00.100Z' };
  assert.deepEqual(orderChatForDisplay([chat, donation]), [donation, chat]);
});

test('same-millisecond donation precedes chat from the same user', () => {
  const timestamp = '2026-09-23T00:00:00.100Z';
  const chat = { type: 'chat' as const, userId: 'donor', timestamp };
  const donation = { type: 'donation' as const, userId: 'donor', timestamp };
  assert.deepEqual(orderChatForDisplay([chat, donation]), [donation, chat]);
});
