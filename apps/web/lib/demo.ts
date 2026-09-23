import type { OperatorSnapshot } from './types';

export const demoSnapshot: OperatorSnapshot = {
  pawnAppearance: { revision: 0, styleId: 'star-medal', image: null },
  revision: 12,
  session: { id: 'preview-session', status: 'paused', channelName: '체험 채널', sessionEpoch: 1, presentationEpoch: 1, previewOnly: true },
  token: { cellId: 'cell-01', direction: 'forward' },
  dice: { values: [3, 4], total: 7 },
  inventory: [{ itemId: 'shield', name: '한잔 실드', quantity: 2, revision: 1, updatedAt: '체험 데이터' }],
  missions: [],
  donations: [
    { id: 'preview-1', donor: '체험 후원자', quantity: 33, createdAt: '체험 데이터', result: '주사위 1회 대기' },
    { id: 'preview-2', donor: '체험 후원자', quantity: 200, createdAt: '체험 데이터', result: '일치하는 규칙 없음' },
  ],
  queue: [{ id: 'preview-q1', label: '주사위 굴리기', status: '보류' }],
};
