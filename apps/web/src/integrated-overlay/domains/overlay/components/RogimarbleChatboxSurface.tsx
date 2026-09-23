import type { ReactNode } from 'react';
import type { BoardFontId, BoardThemeId, OverlayWidgetStyleDto } from '@rogimarble/contracts';

const PLATFORM_LABELS: Record<string, string> = { soop: 'SOOP', chzzk: 'CHZZK', cime: 'CIME', meloming: 'MELOMING' };

export interface ChatboxDisplayMessage {
  id: string;
  type: 'chat' | 'donation';
  platform: string;
  nickname: string;
  content: ReactNode;
  amount?: string | null;
}

export function RogimarbleChatboxSurface({ themeId, fontId, options, messages }: {
  themeId: BoardThemeId;
  fontId: BoardFontId;
  options?: OverlayWidgetStyleDto;
  messages: readonly ChatboxDisplayMessage[];
}) {
  const showPlatformBadge = options?.showPlatformBadge ?? false;
  const showNickname = options?.showNickname ?? true;
  const fontScale = options?.fontScale ?? 1;

  return <div className="rogimarble-chatbox" data-board-theme={themeId} data-board-font={fontId} data-font-scale={fontScale}>
    <ol className="rogimarble-chatbox__messages" aria-label="실시간 채팅">
      {messages.map((message) => {
        const showMeta = showPlatformBadge || showNickname || Boolean(message.amount);
        return <li className="rogimarble-chatbox__message" data-chat-kind={message.type} key={message.id}>
          {showMeta && <div className="rogimarble-chatbox__meta">
            {showPlatformBadge && <span className="rogimarble-chatbox__platform">{PLATFORM_LABELS[message.platform] ?? message.platform.toUpperCase()}</span>}
            {showNickname && <span className="rogimarble-chatbox__nickname">{message.nickname}</span>}
            {message.amount && <span className="rogimarble-chatbox__amount">{message.amount}</span>}
          </div>}
          {message.content && <p className="rogimarble-chatbox__body">{message.content}</p>}
        </li>;
      })}
    </ol>
  </div>;
}
