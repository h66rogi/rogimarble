"use client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Disclosure } from "./editor-fields";

import { useEffect, useState } from "react";
import { validateBoardDefinition, type BoardDefinition } from "@rogimarble/game-core/board";
import initialBoard from "../../../../../../../presets/streamer-board.json";
import { api } from "@/lib/api";
import { BroadcastPanelEditor } from "./broadcast-panel-editor";
import { BoardThemePicker } from "./board-theme-picker";
import { Plus, Trash2 } from "lucide-react";
import type { BroadcastDonationRule, OverlayLayoutDto } from "@rogimarble/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Field, NumberField, Options } from "./editor-fields";
import type { NamedItem } from "./editor-model";
import { OverlayLayoutPreview } from "./board-preview";

export function ItemsEditor({
  value,
  change,
}: {
  value: readonly NamedItem[];
  change: (items: NamedItem[]) => void;
}) {
  const update = (id: string, patch: Partial<NamedItem>) =>
    change(
      value.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        후원으로 지급하거나 미션 방어에 쓸 아이템을 등록하세요. 게시한 뒤
        게임판과 후원 규칙에서 이름으로 선택할 수 있어요.
      </p>
      {value.map((item) => (
        <Card className="space-y-4" key={item.id}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="아이템 이름">
                <Input
                  value={item.label}
                  onChange={(e) => update(item.id, { label: e.target.value })}
                />
              </Field>
              <NumberField
                label="최대 보유 개수"
                max={100000}
                value={item.maxQuantity ?? 100000}
                change={(maxQuantity) => update(item.id, { maxQuantity })}
              />
            </div>
            <Disclosure title={<>아이템 연결 정보</>}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                고유 번호: {item.id}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                이름을 바꿔도 연결된 후원 규칙과 실드 정책은 유지돼요.
              </p>
            </Disclosure>
            <Button
              variant="ghost"
              onClick={() => change(value.filter((i) => i.id !== item.id))}
            >
              <Trash2 />
              아이템 삭제
            </Button>
          </CardContent>
        </Card>
      ))}
      {!value.length && (
        <p className="py-4 text-sm text-muted-foreground">
          아직 등록된 아이템이 없어요.
        </p>
      )}
      <Button
        variant="outline"
        onClick={() =>
          change([
            ...value,
            {
              id: `item-${crypto.randomUUID()}`,
              label: "새 아이템",
              maxQuantity: 100000,
            },
          ])
        }
      >
        <Plus />
        아이템 추가
      </Button>
    </div>
  );
}
export function LayoutEditor({
  value,
  change,
}: {
  value: OverlayLayoutDto;
  change: (layout: OverlayLayoutDto) => void;
}) {
  const [board, setBoard] = useState<BoardDefinition>(initialBoard as BoardDefinition);
  const [rules, setRules] = useState<BroadcastDonationRule[]>([]);
  const [boardSource, setBoardSource] = useState("기본 게임판 예시");
  useEffect(() => {
    let active = true;
    void api.snapshot().then(snapshot => {
      if (!active || !snapshot.boardDefinition) return;
      validateBoardDefinition(snapshot.boardDefinition);
      setBoard(snapshot.boardDefinition);
      setBoardSource("현재 게임판");
    }).catch(() => { /* A sample remains explicitly labelled when live state is unavailable. */ });
    void api.config("rules").then(state => {
      if (!active) return;
      const doc = state.published?.document as { multiRollEnabled?: boolean; rules?: Array<{id:string;label:string;amount:number;enabled:boolean;action:{type:string;rollCount?:number}}> } | undefined;
      setRules((doc?.rules ?? []).filter(rule => rule.enabled && (rule.action.type !== 'roll_dice' || (rule.action.rollCount ?? 1) === 1 || doc?.multiRollEnabled)).map(rule => ({id:rule.id,label:rule.label,amount:rule.amount,...(rule.action.type === 'roll_dice' ? {rollCount:rule.action.rollCount ?? 1} : {})})));
    }).catch(() => { /* Missing published rules are displayed as unconfigured prices. */ });
    return () => { active = false; };
  }, []);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BoardThemePicker board={board} selected={value.boardThemeId ?? "lime-clover"} fontSelected={value.fontId ?? "nanum-square-neo"} changeFont={fontId => change({ ...value, fontId })} change={boardThemeId => change({ ...value, boardThemeId })} />
      <p className="text-xs text-muted-foreground">{boardSource} · 저장 전 미리보기</p>
      <OverlayLayoutPreview value={value} board={board} rules={rules} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        OBS 탭에서 게임판과 패널을 끌어 위치와 크기를 바로 바꿀 수 있어요. 이곳에서는 방송 스타일과 패널 내용을 편집하고 게시해요.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="방송 화면 너비 (px)"
          value={value.width}
          change={(width) => change({ ...value, width, aspectRatio: "custom" })}
        />
        <NumberField
          label="방송 화면 높이 (px)"
          value={value.height}
          change={(height) =>
            change({ ...value, height, aspectRatio: "custom" })
          }
        />
        <Options
          label="화면 비율"
          value={value.aspectRatio}
          options={[
            ["16:9", "가로 방송 · 16:9"],
            ["9:16", "세로 방송 · 9:16"],
            ["4:3", "4:3"],
            ["custom", "직접 지정"],
          ]}
          change={(aspectRatio) => {
            const ratio =
              aspectRatio === "16:9"
                ? 16 / 9
                : aspectRatio === "9:16"
                  ? 9 / 16
                  : aspectRatio === "4:3"
                    ? 4 / 3
                    : null;
            change({
              ...value,
              aspectRatio,
              height: ratio ? Math.round(value.width / ratio) : value.height,
            });
          }}
        />
      </div>
      <Field
        label="방송 화면 배경"
        help="투명 배경은 transparent로 입력하세요."
      >
        <Input
          value={value.background}
          onChange={(e) => change({ ...value, background: e.target.value })}
        />
      </Field>
      <BroadcastPanelEditor value={value} rules={rules} change={change} />
    </div>
  );
}
