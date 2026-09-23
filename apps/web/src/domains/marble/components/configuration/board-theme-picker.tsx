"use client";

import { BOARD_FONTS, BOARD_THEMES } from "@rogimarble/overlay-ui";
import type { BoardFontId, BoardThemeId } from "@rogimarble/contracts";
import { Button } from "@/shared/components/ui/button";

export function BoardThemePicker({ selected, change, fontSelected, changeFont }: {
  selected: BoardThemeId;
  change: (theme: BoardThemeId) => void;
  fontSelected: BoardFontId;
  changeFont: (font: BoardFontId) => void;
}) {
  return <section className="space-y-5" aria-label="기본 방송 스타일">
    <div className="space-y-1">
      <h3 className="text-base font-semibold">기본 테마</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">게임판과 방송 패널에 공통으로 적용해요. 오버레이 설정에서 지정한 파츠별 스타일이 있으면 그 설정이 우선합니다.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="기본 테마 선택">
      {BOARD_THEMES.map(theme => <Button key={theme.id} type="button" size="tile" className="min-w-0" variant={selected === theme.id ? "default" : "outline"} aria-pressed={selected === theme.id} aria-label={`${theme.name} ${selected === theme.id ? "선택됨" : "선택"}`} onClick={() => change(theme.id)}>
        <span className="font-semibold">{theme.name}</span>
        <span className="text-xs font-normal opacity-75">{theme.description}</span>
      </Button>)}
    </div>
    <div className="space-y-3 border-t pt-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">기본 글꼴</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">운영 콘솔은 유지하고 방송 화면의 한글 글꼴만 바꿔요.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BOARD_FONTS.map(font => <Button key={font.id} type="button" size="tile" className="min-w-0" variant={fontSelected === font.id ? "default" : "outline"} aria-pressed={fontSelected === font.id} onClick={() => changeFont(font.id)}>
          <span className="space-y-1">
            <span className="block text-base">{font.name}</span>
            <span className="block text-xs font-normal opacity-75">{font.description}</span>
          </span>
        </Button>)}
      </div>
    </div>
  </section>;
}
