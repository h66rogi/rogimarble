"use client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { ConsoleCheck } from "@/shared/components/common/console-ui";
import { Disclosure } from "./editor-fields";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from "lucide-react";
import type { BoardDefinition, BoardWidget } from "@rogimarble/game-core/board";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Field, NumberField, Options } from "./editor-fields";
import { artworkNames, cellRect, resizeBoard } from "./editor-model";
import { ResizePreview } from "./board-preview";

export function BoardSettings({
  value,
  change,
  close,
}: {
  value: BoardDefinition;
  change: (board: BoardDefinition) => void;
  close: () => void;
}) {
  const [rows, setRows] = useState(
    value.layout.type === "perimeter_grid" ? value.layout.rows : 6,
  );
  const [columns, setColumns] = useState(
    value.layout.type === "perimeter_grid" ? value.layout.columns : 9,
  );
  const [remove, setRemove] = useState<string[]>([]);
  const [replacement, setReplacement] = useState(value.startCellId);
  const [error, setError] = useState("");
  const [resizePreview, setResizePreview] = useState<BoardDefinition | null>(
    null,
  );
  const [widgetType, setWidgetType] = useState<BoardWidget["type"]>("text");
  const count = 2 * (rows + columns) - 4;
  const removeCount = Math.max(0, value.path.length - count);
  const previewResize = () => {
    try {
      setResizePreview(resizeBoard(value, rows, columns, remove, replacement));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "크기를 확인해주세요.");
    }
  };
  const updateWidget = (id: string, next: BoardWidget) =>
    change({
      ...value,
      widgets: value.widgets.map((w) => (w.id === id ? next : w)),
    });
  const addWidget = () => {
    const base = {
      id: `widget-${crypto.randomUUID()}`,
      bounds: { x: 0.3, y: 0.4, width: 0.4, height: 0.15 },
    };
    const widget: BoardWidget =
      widgetType === "text"
        ? { ...base, type: widgetType, text: "방송에 오신 걸 환영해요" }
        : widgetType === "image" || widgetType === "lottie"
          ? {
              ...base,
              type: widgetType,
              assetId:
                widgetType === "image"
                  ? Object.keys(artworkNames)[0]
                  : "token-bounce-v1",
            }
          : { ...base, type: widgetType };
    change({ ...value, widgets: [...value.widgets, widget] });
  };
  return (
    <>
      <header className="flex items-center gap-3">
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            게임판 전체 설정
          </span>
          <h3 className="text-lg font-semibold">판 설정</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="칸 편집으로 돌아가기"
          onClick={close}
        >
          <X />
        </Button>
      </header>
      <div className="space-y-5 xl:max-h-[calc(100vh-310px)] xl:overflow-y-auto">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">시작과 주사위</h4>
          <Options
            label="출발하는 칸"
            value={value.startCellId}
            options={value.path.map(
              (id, i) =>
                [
                  id,
                  `${i + 1}. ${value.cells.find((c) => c.id === id)?.label}`,
                ] as const,
            )}
            change={(startCellId) => change({ ...value, startCellId })}
          />
          <Options
            label="새 게임의 진행 방향"
            value={value.defaultDirection}
            options={[
              ["forward", "정방향 · 번호가 커지는 순서"],
              ["reverse", "역방향 · 번호가 작아지는 순서"],
            ]}
            change={(defaultDirection) =>
              change({ ...value, defaultDirection })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="주사위 개수"
              value={value.dice.count}
              max={10}
              change={(count) =>
                change({ ...value, dice: { ...value.dice, count } })
              }
            />
            <NumberField
              label="주사위 면 수"
              min={2}
              max={100}
              value={value.dice.sides}
              change={(sides) =>
                change({ ...value, dice: { ...value.dice, sides } })
              }
            />
          </div>
        </div>
        <Disclosure title={<>판 모양과 칸 수</>} defaultOpen>
          <p className="text-xs leading-relaxed text-muted-foreground">
            가로·세로를 바꾸면 외곽의 칸 수가 달라져요. 적용 전에 배치를
            확인하세요.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="가로 (칸)"
              min={3}
              max={64}
              value={columns}
              change={(n) => {
                setColumns(n);
                setRemove([]);
                setResizePreview(null);
              }}
            />
            <NumberField
              label="세로 (칸)"
              min={3}
              max={64}
              value={rows}
              change={(n) => {
                setRows(n);
                setRemove([]);
                setResizePreview(null);
              }}
            />
          </div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            현재 {value.path.length}칸 <ArrowRight size={16} /> 변경 후{" "}
            {Math.max(0, count)}칸
          </p>
          {removeCount > 0 && (
            <>
              <p className="mb-2 text-sm font-medium">
                제외할 칸 {remove.length} / {removeCount}개 선택
              </p>
              <div className="grid max-h-52 gap-3 overflow-auto p-1">
                {value.path.map((id, i) => (
                  <ConsoleCheck
                    key={id}
                    checked={remove.includes(id)}
                    onCheckedChange={(checked) => {
                      setRemove(
                        checked
                          ? [...remove, id]
                          : remove.filter((x) => x !== id),
                      );
                      setResizePreview(null);
                    }}
                  >
                    {i + 1}. {value.cells.find((c) => c.id === id)?.label}
                  </ConsoleCheck>
                ))}
              </div>
              <Options
                label="사라지는 출발점·여행 목적지를 대신할 칸"
                value={replacement}
                options={[
                  ["", "남아 있는 칸 선택"],
                  ...value.path
                    .filter((id) => !remove.includes(id))
                    .map(
                      (id, i) =>
                        [
                          id,
                          value.cells.find((c) => c.id === id)?.label ??
                            `칸 ${i + 1}`,
                        ] as const,
                    ),
                ]}
                change={(id) => {
                  setReplacement(id);
                  setResizePreview(null);
                }}
              />
            </>
          )}
          <Button variant="outline" onClick={previewResize}>
            변경 내용 확인
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {resizePreview && (
            <Card className="space-y-3">
              <CardContent className="space-y-4">
                <strong className="font-semibold">
                  {columns} × {rows} 외곽, {count}칸으로 바꿉니다
                </strong>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {removeCount
                    ? `선택한 ${removeCount}개 칸을 제외하고 출발점·여행 목적지 참조를 연결해요.`
                    : `기존 칸을 보존하고 ${Math.max(0, count - value.path.length)}개 칸을 추가해요.`}
                </p>
                <ResizePreview board={resizePreview} existingIds={value.path} />
                <Button
                  onClick={() => {
                    try {
                      change(
                        resizeBoard(value, rows, columns, remove, replacement),
                      );
                      setResizePreview(null);
                      setRemove([]);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "변경 내용을 다시 확인하세요.",
                      );
                    }
                  }}
                >
                  이 배치로 변경
                </Button>
              </CardContent>
            </Card>
          )}
          {value.layout.type === "perimeter_grid" && (
            <Disclosure title={<>자유 배치로 바꾸기</>}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                현재 위치를 유지하고 각 칸의 ‘꾸미기’에서 위치와 크기를
                조절해요.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  change({
                    ...value,
                    layout: { type: "freeform" },
                    cells: value.cells.map((cell) => {
                      const rect = cellRect(value, cell);
                      return {
                        ...cell,
                        position: {
                          type: "freeform",
                          x: rect.x / value.canvas.width,
                          y: rect.y / value.canvas.height,
                          width: rect.width / value.canvas.width,
                          height: rect.height / value.canvas.height,
                        },
                      };
                    }),
                  })
                }
              >
                자유 배치로 전환
              </Button>
            </Disclosure>
          )}
        </Disclosure>
        <Disclosure title={<>화면 크기와 배경</>}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            화면 크기는 칸 수나 동작을 바꾸지 않아요.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="너비 (px)"
              max={16384}
              value={value.canvas.width}
              change={(width) =>
                change({ ...value, canvas: { ...value.canvas, width } })
              }
            />
            <NumberField
              label="높이 (px)"
              max={16384}
              value={value.canvas.height}
              change={(height) =>
                change({ ...value, canvas: { ...value.canvas, height } })
              }
            />
          </div>
          <Field label="배경색">
            <Input
              type="color"
              value={value.canvas.backgroundColor}
              onChange={(e) =>
                change({
                  ...value,
                  canvas: { ...value.canvas, backgroundColor: e.target.value },
                })
              }
            />
          </Field>
          {value.layout.type === "perimeter_grid" && (
            <>
              <NumberField
                label="칸 사이 간격 (px)"
                min={0}
                max={1000}
                value={value.layout.gap}
                change={(gap) => {
                  if (value.layout.type === "perimeter_grid")
                    change({ ...value, layout: { ...value.layout, gap } });
                }}
              />
              <div className="grid grid-cols-2 gap-3">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <NumberField
                    key={side}
                    label={`${{ top: "위", right: "오른쪽", bottom: "아래", left: "왼쪽" }[side]} 여백`}
                    min={0}
                    value={
                      value.layout.type === "perimeter_grid"
                        ? value.layout.padding[side]
                        : 0
                    }
                    change={(n) => {
                      if (value.layout.type === "perimeter_grid")
                        change({
                          ...value,
                          layout: {
                            ...value.layout,
                            padding: { ...value.layout.padding, [side]: n },
                          },
                        });
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </Disclosure>
        <Disclosure
          title={
            <>
              적립 항목 <span>{value.counters.length}</span>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            칸에서 적립·청산할 수량을 만들어요. 현재 게임의 잔량은 운영 화면에서
            조절해요.
          </p>
          {value.counters.map((counter) => {
            const update = (patch: Partial<typeof counter>) =>
              change({
                ...value,
                counters: value.counters.map((c) =>
                  c.id === counter.id ? { ...c, ...patch } : c,
                ),
              });
            const used = value.cells.some((c) =>
              [...c.onLand, ...c.onPass].some(
                (e) => "counterId" in e && e.counterId === counter.id,
              ),
            );
            return (
              <Card className="space-y-3" key={counter.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="font-semibold">{counter.label}</strong>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${counter.label} 적립 항목 삭제`}
                      disabled={used}
                      title={
                        used
                          ? "사용 중인 칸의 동작을 먼저 변경하세요."
                          : "적립 항목 삭제"
                      }
                      onClick={() =>
                        change({
                          ...value,
                          counters: value.counters.filter(
                            (c) => c.id !== counter.id,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Field label="적립 이름">
                    <Input
                      value={counter.label}
                      onChange={(e) => update({ label: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="단위">
                      <Input
                        value={counter.unit}
                        onChange={(e) => update({ unit: e.target.value })}
                      />
                    </Field>
                    <NumberField
                      label="시작 수량"
                      min={0}
                      value={counter.initialValue}
                      change={(initialValue) => update({ initialValue })}
                    />
                  </div>
                  {used && (
                    <small className="text-xs leading-relaxed text-muted-foreground">
                      칸에서 사용 중인 항목이에요.
                    </small>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <Button
            variant="outline"
            onClick={() =>
              change({
                ...value,
                counters: [
                  ...value.counters,
                  {
                    id: `counter-${crypto.randomUUID()}`,
                    label: "새 적립",
                    unit: "개",
                    initialValue: 0,
                  },
                ],
              })
            }
          >
            <Plus />
            적립 항목 추가
          </Button>
        </Disclosure>
        <Disclosure
          title={
            <>
              판 안에 표시할 내용 <span>{value.widgets.length}</span>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            판 위의 제목·주사위·미션 표시를 배치해요.
          </p>
          {value.widgets.map((w) => (
            <Card className="space-y-3" key={w.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-semibold">
                    {widgetNames[w.type]}
                  </strong>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${widgetNames[w.type]} 표시 삭제`}
                    onClick={() =>
                      change({
                        ...value,
                        widgets: value.widgets.filter((x) => x.id !== w.id),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                {w.type === "text" && (
                  <Field label="표시 문구">
                    <Input
                      value={w.text}
                      onChange={(e) =>
                        updateWidget(w.id, { ...w, text: e.target.value })
                      }
                    />
                  </Field>
                )}
                {w.type === "image" && (
                  <Options
                    label="이미지"
                    value={w.assetId}
                    options={Object.entries(artworkNames)}
                    change={(assetId) => updateWidget(w.id, { ...w, assetId })}
                  />
                )}
                {w.type === "lottie" && (
                  <Options
                    label="애니메이션"
                    value={w.assetId}
                    options={[
                      [
                        w.assetId,
                        w.assetId === "token-bounce-v1" ? "말 점프" : w.assetId,
                      ],
                    ]}
                    change={(assetId) => updateWidget(w.id, { ...w, assetId })}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  {(["x", "y", "width", "height"] as const).map((k) => (
                    <NumberField
                      key={k}
                      label={widgetBounds[k]}
                      min={k === "x" || k === "y" ? 0 : 1}
                      max={100}
                      value={Math.round(w.bounds[k] * 100)}
                      change={(n) =>
                        updateWidget(w.id, {
                          ...w,
                          bounds: { ...w.bounds, [k]: n / 100 },
                        })
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          <Options
            label="추가할 내용"
            value={widgetType}
            options={
              Object.entries(widgetNames) as [BoardWidget["type"], string][]
            }
            change={setWidgetType}
          />
          <Button
            variant="outline"
            disabled={value.widgets.length >= 32}
            onClick={addWidget}
          >
            <Plus />
            표시 추가
          </Button>
        </Disclosure>
      </div>
    </>
  );
}
const widgetNames: Record<BoardWidget["type"], string> = {
  text: "안내 문구",
  dice: "주사위",
  current_mission: "현재 미션",
  inventory: "보유 아이템",
  donation_alert: "후원 알림",
  direction: "진행 방향",
  image: "이미지",
  lottie: "애니메이션",
};
const widgetBounds = {
  x: "가로 위치 (%)",
  y: "세로 위치 (%)",
  width: "너비 (%)",
  height: "높이 (%)",
};
