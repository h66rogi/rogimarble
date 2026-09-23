'use client';

import AppleChatbox from '../themes/apple/Chatbox';
import { useChatMessages } from '../contexts/chat-messages-context';
import type { OverlayData } from '../types/overlay';
import type { BoardFontId, BoardThemeId } from '@rogimarble/contracts';
import { BOARD_FONT_FAMILIES } from '@rogimarble/overlay-ui';

const accents: Record<BoardThemeId, string> = {
  'lime-clover': '#789722',
  'pink-bunny': '#d45d91',
  'sky-soda': '#3699bd',
  'lavender-dream': '#8568b6',
  'midnight-pop': '#d84e8e',
  'peach-sorbet': '#d8735b',
};

// The imported chat widget does not read music data; these required theme props
// are kept here so Rogimarble only supplies chat events to the original UI.
const emptyData: OverlayData = {
  sessionId: null,
  channel: { id: 0, name: '', webPath: '', themeColor: '#0067ff' },
  settings: null, queue: [], startedAt: null, isLive: true,
};

export function RogimarbleChatbox({ themeId, fontId }: { themeId: BoardThemeId; fontId: BoardFontId }) {
  const chatMessages = useChatMessages();
  const fontFamily = BOARD_FONT_FAMILIES[fontId];
  return <div className="h-full w-full" data-board-theme={themeId} data-board-font={fontId}>
    <AppleChatbox data={emptyData} options={{ theme: themeId === 'midnight-pop' ? 'dark' : 'light', accentColor: accents[themeId] }} animations={{}} fonts={{ roles: { heading: [fontFamily], body: [fontFamily] }, recommended: [], bundled: [] }} reducedMotion={false} chatMessages={chatMessages} />
  </div>;
}
