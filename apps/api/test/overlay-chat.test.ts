import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayChatMessage, overlayDonationMessage } from '../src/overlay-chat.ts';
import type { CollectorChat, CollectorDonation } from '../src/donation-ingestion.service.ts';

test('OBS chat adapter exposes display fields only and keeps stable event IDs', () => {
  const chat = {
    consumerId: 'consumer', collectorChannelId: 'soop-channel', eventId: 'event-1',
    userId: 'viewer', userDisplayName: '시청자', message: '안녕하세요', emotes: [],
    observedAt: '2026-09-23T00:00:00Z', occurredAt: null,
    cursor: { streamGeneration: 'generation', streamId: '1-0', gapBefore: false },
    payload: { privateCollectorField: 'not for OBS' },
  } satisfies CollectorChat;
  assert.deepEqual(overlayChatMessage(chat), {
    id: 'chat:event-1', type: 'chat', sessionId: 0, platform: 'soop',
    channelId: 'soop-channel', userId: 'viewer', nickname: '시청자',
    message: '안녕하세요', emotes: [], timestamp: '2026-09-23T00:00:00Z',
  });
  const donation = {
    consumerId: 'consumer', collectorChannelId: 'soop-channel', eventId: 'event-2',
    nativeBalloonCount: 33, donationKind: 'balloon', identityStatus: 'observed',
    cursor: { journalGeneration: 'generation', channelOffset: '2', recoveryRevision: '1' },
    donorId: 'donor', donorDisplayName: '후원자', message: '화이팅',
    observedAt: '2026-09-23T00:00:01Z', occurredAt: null,
    payload: { privateCollectorField: 'not for OBS' },
  } satisfies CollectorDonation;
  assert.deepEqual(overlayDonationMessage(donation), {
    id: 'donation:event-2', type: 'donation', sessionId: 0, platform: 'soop',
    channelId: 'soop-channel', userId: 'donor', nickname: '후원자',
    message: '화이팅', timestamp: '2026-09-23T00:00:01Z', amount: 33, currency: '별풍선',
  });
  assert.equal(overlayDonationMessage({ ...donation, donationKind: 'unsupported' }), null);
});
