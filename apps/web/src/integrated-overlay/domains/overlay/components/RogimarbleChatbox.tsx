'use client';

import type { BoardFontId, BoardThemeId, OverlayWidgetStyleDto } from '@rogimarble/contracts';
import { useChatMessages } from '../contexts/chat-messages-context';
import { ChatMessageContent } from './shared/ChatMessageContent';
import type { OverlayChatEvent } from '../types/chat';
import { RogimarbleChatboxSurface } from './RogimarbleChatboxSurface';
import { orderChatForDisplay } from './rogimarble-chat-order';

function donationLabel(message: OverlayChatEvent): string | null {
  if (message.type !== 'donation') return null;
  if (message.currency === '별풍선') return `별풍선 ${message.amount.toLocaleString('ko-KR')}개`;
  if (message.amountKrw) return `${message.amountKrw.toLocaleString('ko-KR')}원`;
  return `${message.amount.toLocaleString('ko-KR')}${message.currency ?? ''}`;
}

export function RogimarbleChatbox({ themeId, fontId, options }: {
  themeId: BoardThemeId;
  fontId: BoardFontId;
  options?: OverlayWidgetStyleDto;
}) {
  const liveMessages = useChatMessages();
  const messages = orderChatForDisplay(liveMessages).slice(-30);
  const emoteHeight = 30 * (options?.fontScale ?? 1);
  const ogqHeight = 100 * (options?.fontScale ?? 1);
  return <RogimarbleChatboxSurface themeId={themeId} fontId={fontId} options={options} messages={messages.map(message => ({
    id: message.id,
    type: message.type,
    platform: message.platform,
    nickname: message.nickname,
    amount: donationLabel(message),
    content: message.message || message.emotes?.length ? <ChatMessageContent message={message.message} platform={message.platform} channelId={message.channelId} emotes={message.emotes} emoteHeight={emoteHeight} ogqHeight={ogqHeight} /> : null,
  }))} />;
}
