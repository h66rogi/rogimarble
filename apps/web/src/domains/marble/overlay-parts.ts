import type { OverlayWidgetId } from '@rogimarble/contracts';

export const OVERLAY_PARTS: readonly { id: OverlayWidgetId; label: string; width: number; height: number }[] = [
  { id: 'board', label: '주루마블 보드', width: 1920, height: 1080 },
  { id: 'dice', label: '주사위 결과', width: 480, height: 240 },
  { id: 'current_mission', label: '현재 미션', width: 640, height: 180 },
  { id: 'inventory', label: '보유 아이템', width: 640, height: 180 },
  { id: 'direction', label: '이동 방향', width: 480, height: 180 },
  { id: 'menu', label: '후원 메뉴', width: 480, height: 640 },
  { id: 'dice_price', label: '주사위 가격', width: 480, height: 160 },
];

export function isOverlayPartId(value: string): value is OverlayWidgetId {
  return OVERLAY_PARTS.some((part) => part.id === value);
}

export function overlayPartUrl(baseUrl: string, partId: OverlayWidgetId): string {
  const url = new URL(baseUrl);
  url.pathname = `/overlay/${partId}`;
  return url.href;
}
