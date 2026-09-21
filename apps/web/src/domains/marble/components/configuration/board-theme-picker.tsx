"use client";

import { Board, BOARD_FONTS, BOARD_THEMES } from "@rogimarble/overlay-ui";
import type { BoardFontId, BoardThemeId } from "@rogimarble/contracts";
import type { BoardDefinition } from "@rogimarble/game-core/board";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export function BoardThemePicker({ board, selected, change, fontSelected, changeFont }: {
  board: BoardDefinition;
  selected: BoardThemeId;
  change: (theme: BoardThemeId) => void;
  fontSelected: BoardFontId;
  changeFont: (font: BoardFontId) => void;
}) {
  return <section className="space-y-3" aria-label="방송 게임판 테마">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">방송 게임판 테마</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">칸의 내용과 게임 규칙은 그대로 두고 판의 모습을 바꿔요. 선택 후 저장·검증·게시하면 운영 화면과 OBS에 함께 반영돼요.</p>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      {BOARD_THEMES.map(theme => <Card key={theme.id}>
        <CardContent className="space-y-3">
          <div className="pointer-events-none aspect-video overflow-hidden bg-muted" aria-hidden="true">
            <Board board={board} tokenCellId={board.startCellId} themeId={theme.id} fontId={fontSelected} fit reducedMotion />
          </div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{theme.name}</h4>
            {selected === theme.id && <Badge variant="secondary">선택한 초안</Badge>}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{theme.description}</p>
          <Button className="w-full" variant={selected === theme.id ? "default" : "outline"} aria-pressed={selected === theme.id} onClick={() => change(theme.id)}>
            {selected === theme.id ? `${theme.name} 선택됨` : `${theme.name} 선택`}
          </Button>
        </CardContent>
      </Card>)}
    </div>
    <div className="space-y-2 pt-2">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">게임판 글꼴</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">운영 콘솔 글꼴은 유지하고 방송 게임판과 방송 패널의 한글 글꼴만 바꿔요.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BOARD_FONTS.map(font => <Button key={font.id} variant={fontSelected === font.id ? "default" : "outline"} aria-pressed={fontSelected === font.id} onClick={() => changeFont(font.id)}>
          <span className="space-y-1">
            <span className="block text-base">{font.name}</span>
            <span className="block text-xs font-normal opacity-75">{font.description}</span>
          </span>
        </Button>)}
      </div>
    </div>
  </section>;
}
