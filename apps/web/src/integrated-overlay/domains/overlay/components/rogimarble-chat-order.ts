import type { OverlayChatEvent } from '../types/chat';

type OrderedChatEvent = Pick<OverlayChatEvent, 'timestamp' | 'type'>;

/** The chat stream can reach OBS before the earlier, durable donation stream. */
export function orderChatForDisplay<T extends OrderedChatEvent>(messages: readonly T[]): T[] {
  return messages.map((message, arrivalIndex) => ({
    message,
    arrivalIndex,
    observedAt: Date.parse(message.timestamp),
  })).sort((left, right) => {
    const leftValid = Number.isFinite(left.observedAt);
    const rightValid = Number.isFinite(right.observedAt);
    if (leftValid && rightValid && left.observedAt !== right.observedAt) {
      return left.observedAt - right.observedAt;
    }
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (leftValid && left.message.type !== right.message.type) {
      return left.message.type === 'donation' ? -1 : 1;
    }
    return left.arrivalIndex - right.arrivalIndex;
  }).map(({ message }) => message);
}
