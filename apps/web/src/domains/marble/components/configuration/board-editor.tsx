"use client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { SelectionButton } from "@/shared/components/ui/selection-button";
import { Disclosure } from "./editor-fields";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Dice5,
  Flag,
  Grip,
  MapPin,
  MessageCircle,
  MousePointer2,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Route,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import type {
  BoardCell,
  BoardDefinition,
  BoardPassEffect,
} from "@rogimarble/game-core/board";
import { assetManifest } from "@rogimarble/asset-manifest";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Field, NumberField, Options, Toggle } from "./editor-fields";
import { EffectList } from "./effect-editor";
import {
  artworkNames,
  cellRect,
  describeEffect,
  effectNames,
  moveCell,
  resizeBoard,
  type NamedItem,
} from "./editor-model";
import { BoardSettings } from "./board-settings";
import { BoardCanvas, CellArt, PaletteSwatches } from "./board-preview";

export function BoardEditor({
  value,
  items,
  change,
}: {
  value: BoardDefinition;
  items: readonly NamedItem[];
  change: (board: BoardDefinition) => void;
}) {
  const [selectedId, setSelectedId] = useState(value.startCellId);
  const [panel, setPanel] = useState<"cell" | "settings">("cell");
  const [cellTab, setCellTab] = useState<"action" | "appearance" | "pass">(
    "action",
  );
  const [arrange, setArrange] = useState(false);
  const [search, setSearch] = useState("");
  const [fit, setFit] = useState(true);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const revealInspector = () => {
    if (window.matchMedia("(max-width: 1279px)").matches)
      requestAnimationFrame(() =>
        inspectorRef.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        }),
      );
  };
  const [showPath, setShowPath] = useState(false);
  const [steps, setSteps] = useState(3);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [history, setHistory] = useState<BoardDefinition[]>([]);
  const [future, setFuture] = useState<BoardDefinition[]>([]);
  const last = useRef(value);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPreview = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPreviewing(false);
    setPreview(null);
  };
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (JSON.stringify(value) !== JSON.stringify(last.current)) {
      setHistory([]);
      setFuture([]);
      stopPreview();
    }
    last.current = value;
  }, [value]);
  const edit = (next: BoardDefinition) => {
    stopPreview();
    setHistory((h) => [...h.slice(-49), value]);
    setFuture([]);
    last.current = next;
    change(next);
  };
  const undo = () => {
    const next = history.at(-1);
    if (!next) return;
    stopPreview();
    setHistory(history.slice(0, -1));
    setFuture([value, ...future]);
    last.current = next;
    change(next);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    stopPreview();
    setFuture(future.slice(1));
    setHistory([...history, value]);
    last.current = next;
    change(next);
  };
  const selected =
    value.cells.find((c) => c.id === selectedId) ??
    value.cells.find((c) => c.id === value.startCellId) ??
    value.cells[0];
  const index = value.path.indexOf(selected.id);
  const patch = (patch: Partial<BoardCell>) =>
    edit({
      ...value,
      cells: value.cells.map((c) =>
        c.id === selected.id ? { ...c, ...patch } : c,
      ),
    });
  const select = (id: string) => {
    stopPreview();
    setSelectedId(id);
    setPanel("cell");
    revealInspector();
  };
  const play = () => {
    stopPreview();
    setPreview(selected.id);
    setPreviewing(true);
    let progress = 0;
    const advance = () => {
      progress++;
      const sign = value.defaultDirection === "forward" ? 1 : -1;
      setPreview(
        value.path[
          (((index + sign * progress) % value.path.length) +
            value.path.length) %
            value.path.length
        ],
      );
      if (progress >= steps) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setPreviewing(false);
      }
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress = steps - 1;
      advance();
    } else timer.current = setInterval(advance, 350);
  };
  const visible = value.path.filter((id) => {
    const c = value.cells.find((c) => c.id === id)!;
    return (
      !search ||
      `${value.path.indexOf(id) + 1} ${c.label} ${c.onLand.map((e) => effectNames[e.type]).join(" ")}`.includes(
        search,
      )
    );
  });
  const unconfigured = value.cells.filter((c) =>
    [...c.onLand, ...c.onPass].some((e) => e.type === "unconfigured"),
  );
  return (
    <div className="min-w-0">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]">
        <div className="min-w-0 space-y-4" ref={boardRef}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1" aria-label="편집 모드">
              <Button
                variant={!arrange ? "secondary" : "ghost"}
                type="button"
                aria-pressed={!arrange}
                onClick={() => setArrange(false)}
              >
                <MousePointer2 size={15} />칸 편집
              </Button>
              <Button
                variant={arrange ? "secondary" : "ghost"}
                type="button"
                aria-pressed={arrange}
                onClick={() => setArrange(true)}
              >
                <Grip size={15} />
                순서 바꾸기
              </Button>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="편집 되돌리기"
                title="편집 되돌리기"
                disabled={!history.length}
                onClick={undo}
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="편집 다시 실행"
                title="편집 다시 실행"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 />
              </Button>
              <Button
                variant={panel === "settings" ? "secondary" : "ghost"}
                onClick={() => {
                  setPanel(panel === "settings" ? "cell" : "settings");
                  revealInspector();
                }}
              >
                <Settings2 />판 설정
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setFit(!fit)}>
              {fit ? "크게 보기" : "전체 판 보기"}
            </Button>
          </div>
          <Card className="overflow-x-auto">
            <CardContent className="space-y-4">
              <div className={fit ? "p-1" : "min-w-[1000px] p-1"}>
                <BoardCanvas
                  board={value}
                  selectedId={selected.id}
                  highlightedIds={search ? visible : null}
                  previewId={preview}
                  showPath={showPath || arrange}
                  arrange={arrange}
                  select={select}
                  move={(id, slot) => edit(moveCell(value, id, slot))}
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              <span className="text-primary">●</span>
              {arrange
                ? "칸을 끌어 순서를 바꾸세요. 칸의 이름과 동작이 함께 이동해요."
                : "바꾸고 싶은 칸을 누르세요. 오른쪽에서 수정하면 판에 바로 보여요."}
            </span>
            <Button
              variant="outline"
              type="button"
              aria-pressed={showPath}
              onClick={() => setShowPath(!showPath)}
            >
              <Route size={14} />
              이동 경로 {showPath ? "숨기기" : "보기"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <strong className="font-semibold">
                <Play size={15} />
                이동 미리보기
              </strong>
              <p className="text-sm leading-relaxed text-muted-foreground">
                선택한 칸에서 경로만 확인해요. 실제 게임에는 영향이 없어요.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Input
                className="w-20"
                aria-label="미리보기 이동 칸 수"
                type="number"
                min={1}
                max={100}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
              />
              <span>칸</span>
              <Button
                variant="outline"
                disabled={
                  previewing ||
                  !Number.isSafeInteger(steps) ||
                  steps < 1 ||
                  steps > 100
                }
                onClick={play}
              >
                <Play />
                이동
              </Button>
              {preview && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="미리보기 초기화"
                  onClick={stopPreview}
                >
                  <RotateCcw />
                </Button>
              )}
            </div>
          </div>
          <Card className="space-y-4">
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  전체 칸 <span>{value.path.length}</span>
                </h4>
                <div className="flex w-56 max-w-full items-center gap-2">
                  <Search size={15} />
                  <Input
                    aria-label="칸 검색"
                    placeholder="칸 이름·번호 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                {visible.map((id) => {
                  const cell = value.cells.find((c) => c.id === id)!;
                  return (
                    <SelectionButton
                      layout="chip"
                      type="button"
                      key={id}
                      selected={selected.id === id}
                      onClick={() => select(id)}
                    >
                      <span>{value.path.indexOf(id) + 1}</span>
                      {cell.label}
                      {cell.onLand.some((e) => e.type === "unconfigured") && (
                        <span className="text-destructive">●</span>
                      )}
                    </SelectionButton>
                  );
                })}
                {!visible.length && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    검색한 칸이 없어요.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          {!!unconfigured.length && (
            <div className="text-sm text-muted-foreground">
              동작을 정하지 않은 칸이 {unconfigured.length}개 있어요.{" "}
              {unconfigured.map((c) => (
                <Button
                  variant="outline"
                  type="button"
                  key={c.id}
                  onClick={() => select(c.id)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <Card
          className="min-w-0 self-start xl:sticky xl:top-0"
          ref={inspectorRef}
          aria-label={panel === "settings" ? "판 설정" : "선택한 칸 편집"}
        >
          <CardContent className="space-y-4">
            <div className="xl:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  boardRef.current?.scrollIntoView({ block: "start" })
                }
              >
                <ArrowLeft />
                판으로 돌아가기
              </Button>
            </div>
            {panel === "settings" ? (
              <BoardSettings
                value={value}
                change={edit}
                close={() => setPanel("cell")}
              />
            ) : (
              <>
                <header className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center text-xl font-bold text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      선택한 칸 {selected.id === value.startCellId && "· 출발"}
                    </span>
                    <h3 className="text-lg font-semibold">
                      {selected.label || "이름 없는 칸"}
                    </h3>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="이전 칸 선택"
                      onClick={() =>
                        select(
                          value.path[
                            (index - 1 + value.path.length) % value.path.length
                          ],
                        )
                      }
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="다음 칸 선택"
                      onClick={() =>
                        select(value.path[(index + 1) % value.path.length])
                      }
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </header>
                <div className="space-y-5 xl:max-h-[calc(100vh-310px)] xl:overflow-y-auto">
                  <Field
                    label="칸 이름"
                    help="판에 보이는 이름이에요. 아래 동작은 따로 설정해요."
                  >
                    <Input
                      value={selected.label}
                      onChange={(e) => patch({ label: e.target.value })}
                    />
                  </Field>
                  {arrange && (
                    <Card className="space-y-3">
                      <CardContent className="space-y-4">
                        <strong className="font-semibold">
                          이동 순서 {index + 1} / {value.path.length}
                        </strong>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            disabled={index === 0}
                            onClick={() =>
                              edit(moveCell(value, selected.id, index - 1))
                            }
                          >
                            <ArrowLeft />한 칸 앞으로
                          </Button>
                          <Button
                            variant="outline"
                            disabled={index === value.path.length - 1}
                            onClick={() =>
                              edit(moveCell(value, selected.id, index + 1))
                            }
                          >
                            한 칸 뒤로
                            <ArrowRight />
                          </Button>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          터치 화면에서도 버튼으로 순서를 바꿀 수 있어요.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label="칸 편집 항목"
                  >
                    {(
                      [
                        ["action", "도착 동작"],
                        ["appearance", "꾸미기"],
                        ["pass", "지나갈 때"],
                      ] as const
                    ).map(([id, label]) => (
                      <Button
                        variant={cellTab === id ? "secondary" : "ghost"}
                        aria-pressed={cellTab === id}
                        key={id}
                        onClick={() => setCellTab(id)}
                      >
                        {label}
                        {id === "pass" && !!selected.onPass.length && (
                          <span>{selected.onPass.length}</span>
                        )}
                      </Button>
                    ))}
                  </div>
                  {cellTab === "action" && (
                    <EffectList
                      key={`${selected.id}-land`}
                      effects={selected.onLand}
                      trigger="onLand"
                      board={value}
                      items={items}
                      change={(onLand) => patch({ onLand })}
                    />
                  )}
                  {cellTab === "pass" && (
                    <>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        도착하지 않고 지나갈 때만 실행해요.
                      </p>
                      <EffectList
                        key={`${selected.id}-pass`}
                        effects={selected.onPass}
                        trigger="onPass"
                        board={value}
                        items={items}
                        change={(onPass) =>
                          patch({ onPass: onPass as BoardPassEffect[] })
                        }
                      />
                    </>
                  )}
                  {cellTab === "appearance" && (
                    <div className="grid gap-4">
                      <Options
                        label="칸 모양"
                        value={selected.appearance.shape}
                        options={[
                          ["rounded_rectangle", "둥근 사각형"],
                          ["circle", "원형"],
                        ]}
                        change={(shape) =>
                          patch({
                            appearance: { ...selected.appearance, shape },
                          })
                        }
                      />
                      <div className="grid grid-cols-3 gap-3">
                        {(
                          [
                            ["fill", "바탕"],
                            ["textColor", "글자"],
                            ["borderColor", "테두리"],
                          ] as const
                        ).map(([key, label]) => (
                          <Field label={label} key={key}>
                            <Input
                              type="color"
                              value={selected.appearance[key]}
                              onChange={(e) =>
                                patch({
                                  appearance: {
                                    ...selected.appearance,
                                    [key]: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                      <Field label="추천 색상">
                        <PaletteSwatches
                          value={selected.appearance.fill}
                          change={(fill) =>
                            patch({
                              appearance: { ...selected.appearance, fill },
                            })
                          }
                        />
                      </Field>
                      <div>
                        <p className="mb-2 text-sm font-medium">칸 일러스트</p>
                        <div className="grid grid-cols-4 gap-2">
                          <SelectionButton
                            layout="tile"
                            type="button"
                            selected={!selected.appearance.artwork}
                            onClick={() =>
                              patch({
                                appearance: {
                                  ...selected.appearance,
                                  artwork: null,
                                },
                              })
                            }
                          >
                            <span className="flex size-10 items-center justify-center text-xl text-muted-foreground">
                              —
                            </span>
                            없음
                          </SelectionButton>
                          {assetManifest
                            .filter((a) => a.kind === "atlas-image" || a.kind === "image")
                            .map((asset) => (
                              <SelectionButton
                                layout="tile"
                                type="button"
                                key={asset.id}
                                selected={
                                  selected.appearance.artwork?.assetId ===
                                  asset.id
                                }
                                onClick={() =>
                                  patch({
                                    appearance: {
                                      ...selected.appearance,
                                      artwork: {
                                        type: "image",
                                        assetId: asset.id,
                                      },
                                    },
                                  })
                                }
                              >
                                <span className="size-10">
                                  <CellArt assetId={asset.id} />
                                </span>
                                {artworkNames[asset.id] ?? asset.id}
                              </SelectionButton>
                            ))}
                        </div>
                      </div>
                      {selected.position.type === "freeform" && (
                        <div className="grid grid-cols-2 gap-3">
                          {(["x", "y", "width", "height"] as const).map(
                            (key) => (
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
                                value={
                                  selected.position.type === "freeform"
                                    ? Math.round(selected.position[key] * 100)
                                    : 0
                                }
                                change={(n) => {
                                  if (selected.position.type === "freeform")
                                    patch({
                                      position: {
                                        ...selected.position,
                                        [key]: n / 100,
                                      },
                                    });
                                }}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <Disclosure title={<>칸 정보</>}>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      고유 번호: {selected.id}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selected.id === value.startCellId}
                      onClick={() =>
                        edit({ ...value, startCellId: selected.id })
                      }
                    >
                      <Flag />이 칸을 출발점으로
                    </Button>
                  </Disclosure>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
