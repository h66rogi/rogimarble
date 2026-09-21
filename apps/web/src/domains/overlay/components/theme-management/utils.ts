import { isEqual } from "es-toolkit";
import {
  VALID_WIDGET_TYPES,
  type UnifiedThemeConfig,
  type WidgetType,
} from "@/domains/channel/apis/overlay-theme";

/**
 * `default`와 4개 위젯을 각각 하나의 섹션으로 간주하고, 서버 스냅샷 대비
 * 로컬 draft가 다른 섹션 수를 계산한다.
 *
 * `original`/`current` 중 하나라도 null이면 0을 반환한다 (초기 로딩 상태).
 *
 * - `default`: `themeId` 또는 `options`가 한 자라도 달라지면 +1
 * - 각 widget: `themeId`와 `options` 쌍(혹은 `null`)이 달라지면 +1
 */
export function countChanges(
  original: UnifiedThemeConfig | null,
  current: UnifiedThemeConfig | null,
): number {
  if (!original || !current) return 0;
  let count = 0;

  if (!isEqual(original.default, current.default)) {
    count += 1;
  }

  for (const widgetType of VALID_WIDGET_TYPES) {
    const originalEntry = original.widgets[widgetType] ?? null;
    const currentEntry = current.widgets[widgetType] ?? null;
    if (!isEqual(originalEntry, currentEntry)) {
      count += 1;
    }
  }

  return count;
}

/**
 * `WidgetType`을 한국어 레이블로 매핑. 탭 바와 미리보기 셀렉터에서 공용.
 */
export const WIDGET_LABELS: Record<WidgetType, string> = {
  "now-playing": "재생중",
  queue: "대기열",
  chatbox: "채팅",
  setlist: "셋리스트",
  lyrics: "가사",
  "songbook-qr": "노래책 QR",
};

/**
 * 위젯별 forced default. 백엔드 `WIDGET_DEFAULT_THEME_OVERRIDE`
 * (overlay-theme.service.ts) 와 동기화 — 위젯 override 가 명시되지 않은 경우
 * 채널 default 보다 이 값이 우선 적용된다.
 *
 * 백엔드가 `getThemeConfig` 응답에서 `themeId: null` 만 내려주기 때문에
 * 관리 UI 미리보기/안내 일관성을 위해 프론트도 동일 매핑을 갖는다.
 */
export const WIDGET_FORCED_DEFAULT_THEME: Partial<Record<WidgetType, string>> =
  {
    lyrics: "spotify",
  };

/**
 * 위젯에 실제로 적용되는 effective theme id 계산.
 * - widget override 가 명시되어 있으면 그대로 사용 (사용자 선택 우선)
 * - override 가 null 이면 forced default 우선, 없으면 채널 default
 *
 * 백엔드 `resolveDefaultThemeForWidget` (overlay-theme.service.ts) 와 동치.
 */
export function resolveEffectiveThemeIdForWidget(
  rawOverrideThemeId: string | null,
  channelDefaultThemeId: string,
  widgetType: WidgetType,
): string {
  if (rawOverrideThemeId !== null) return rawOverrideThemeId;
  return WIDGET_FORCED_DEFAULT_THEME[widgetType] ?? channelDefaultThemeId;
}
