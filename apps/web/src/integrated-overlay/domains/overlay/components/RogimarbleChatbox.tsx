'use client';

import AppleChatbox from '../themes/apple/Chatbox';
import { useChatMessages } from '../contexts/chat-messages-context';
import type { OverlayData } from '../types/overlay';

// The imported chat widget does not read music data; these required theme props
// are kept here so Rogimarble only supplies chat events to the original UI.
const emptyData: OverlayData = {
  sessionId: null,
  channel: { id: 0, name: '', webPath: '', themeColor: '#0067ff' },
  settings: null, queue: [], startedAt: null, isLive: true,
};

export function RogimarbleChatbox() {
  const chatMessages = useChatMessages();
  return <AppleChatbox data={emptyData} options={{ theme: 'dark' }} animations={{}} fonts={{ roles: { heading: ['Pretendard', 'sans-serif'], body: ['Pretendard', 'sans-serif'] }, recommended: [], bundled: [] }} reducedMotion={false} chatMessages={chatMessages} />;
}
