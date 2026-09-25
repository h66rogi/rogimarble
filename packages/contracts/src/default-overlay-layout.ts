import type { OverlayLayoutDto } from './index.ts';

/** The published preview-channel layout captured on 2026-09-25. */
export const DEFAULT_MARBLE_OVERLAY_LAYOUT = {
  schemaVersion: 1,
  boardThemeId: 'lavender-dream',
  fontId: 'nanum-square-neo',
  showPathArrows: true,
  width: 1920,
  height: 1080,
  aspectRatio: '16:9',
  background: 'transparent',
  widgetStyles: {
    chatbox: { showNickname: false, showPlatformBadge: false },
  },
  widgets: [
    { id: 'board', bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 0 },
    { id: 'inventory', bounds: { x: 0.1276543134524499, y: 0.2018801539307312, width: 0.2200000075352044, height: 0.07036833424958769 }, z: 3 },
    { id: 'menu', bounds: { x: 0.1276543134524499, y: 0.2822484881803189, width: 0.21975308641975308, height: 0.3364485981308411 }, z: 5 },
    { id: 'chatbox', bounds: { x: 0.12790123456790126, y: 0.6342385550525701, width: 0.21975308641975308, height: 0.17152281473336997 }, z: 4 },
  ],
} as const satisfies OverlayLayoutDto;
