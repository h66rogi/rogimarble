import type { CollectorChat, CollectorDonation } from './donation-ingestion.service.ts';

/** Only display fields cross the OBS token room; collector payloads stay server-side. */
export function overlayChatMessage(event: CollectorChat) {
  return {
    id: `chat:${event.eventId}`, type: 'chat' as const, sessionId: 0,
    platform: 'soop' as const, channelId: event.collectorChannelId,
    userId: event.userId, nickname: event.userDisplayName || event.userId,
    message: event.message, emotes: event.emotes, timestamp: event.occurredAt ?? event.observedAt,
  };
}

export function overlayDonationMessage(event: CollectorDonation) {
  if (event.donationKind !== 'balloon') return null;
  return {
    id: `donation:${event.eventId}`, type: 'donation' as const, sessionId: 0,
    platform: 'soop' as const, channelId: event.collectorChannelId,
    userId: event.donorId, nickname: event.donorDisplayName || event.donorId,
    message: event.message, timestamp: event.occurredAt ?? event.observedAt,
    amount: event.nativeBalloonCount, currency: '별풍선',
  };
}
