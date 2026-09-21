"use client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Disclosure } from "./editor-fields";

import { Plus, Trash2 } from "lucide-react";
import type { OverlayLayoutDto } from "@rogimarble/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Field, NumberField, Options, Toggle } from "./editor-fields";
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
const widgetNames = {
  board: "게임판",
  dice: "주사위",
  current_mission: "현재 미션",
  inventory: "보유 아이템",
  direction: "진행 방향",
};
export function LayoutEditor({
  value,
  change,
}: {
  value: OverlayLayoutDto;
  change: (layout: OverlayLayoutDto) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        OBS 방송 화면에서 각 영역을 표시할 위치와 크기를 정해요. 게임판의 칸
        수는 바뀌지 않아요.
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
      <OverlayLayoutPreview value={value} />
      {(Object.keys(widgetNames) as (keyof typeof widgetNames)[]).map((id) => {
        const current = value.widgets.find((w) => w.id === id);
        return (
          <Card className="space-y-4" key={id}>
            <CardContent className="space-y-4">
              <Toggle
                label={`${widgetNames[id]} 표시`}
                checked={!!current}
                change={(on) =>
                  change({
                    ...value,
                    widgets: on
                      ? [
                          ...value.widgets,
                          {
                            id,
                            bounds: { x: 0, y: 0, width: 0.5, height: 0.5 },
                            z: value.widgets.length,
                          },
                        ]
                      : value.widgets.filter((w) => w.id !== id),
                  })
                }
              />
              {current && (
                <div className="grid grid-cols-3 gap-3">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={
                        {
                          x: "가로 위치 (%)",
                          y: "세로 위치 (%)",
                          width: "너비 (%)",
                          height: "높이 (%)",
                        }[key]
                      }
                      min={key === "x" || key === "y" ? 0 : 1}
                      max={100}
                      value={Math.round(current.bounds[key] * 100)}
                      change={(n) =>
                        change({
                          ...value,
                          widgets: value.widgets.map((w) =>
                            w.id === id
                              ? {
                                  ...w,
                                  bounds: { ...w.bounds, [key]: n / 100 },
                                }
                              : w,
                          ),
                        })
                      }
                    />
                  ))}
                  <NumberField
                    label="겹칠 때 표시 순서"
                    min={0}
                    value={current.z}
                    change={(z) =>
                      change({
                        ...value,
                        widgets: value.widgets.map((w) =>
                          w.id === id ? { ...w, z } : w,
                        ),
                      })
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
