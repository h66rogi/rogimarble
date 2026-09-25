"use client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { ConsoleCheck } from "@/shared/components/common/console-ui";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  BoardDefinition,
  BoardEffect,
  BoardPassEffect,
} from "@rogimarble/game-core/board";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Field,
  ItemPicker,
  NumberField,
  Options,
  ShieldFields,
  Toggle,
  arrivalOptions,
  selectionOptions,
} from "./editor-fields";
import {
  describeEffect,
  effectNames,
  newEffect,
  passTypes,
  type NamedItem,
} from "./editor-model";

type Props = {
  value: BoardEffect;
  board: BoardDefinition;
  items: readonly NamedItem[];
  change: (value: BoardEffect) => void;
};
export function EffectFields({ value, board, items, change }: Props) {
  switch (value.type) {
    case "mission":
      return (
        <>
          <Field label="미션 문구">
            <Input
              value={value.message}
              onChange={(e) => change({ ...value, message: e.target.value })}
            />
          </Field>
          <NumberField
            label="미션 시간 (초)"
            min={0}
            value={value.durationSeconds ?? 0}
            help="0이면 시간 제한 없이 운영자가 완료해요."
            change={(n) => change({ ...value, durationSeconds: n || null })}
          />
          <ShieldFields
            value={value.shield}
            items={items}
            change={(shield) => change({ ...value, shield })}
          />
        </>
      );
    case "choice_mission":
      return (
        <>
          <Field label="선택 안내 문구">
            <Input
              value={value.prompt}
              onChange={(e) => change({ ...value, prompt: e.target.value })}
            />
          </Field>
          <Options
            label="누가 선택하나요?"
            value={value.selection}
            options={selectionOptions}
            change={(selection) => change({ ...value, selection })}
          />
          {value.choices.map((choice, i) => (
            <Card className="space-y-3" key={choice.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-semibold">선택 {i + 1}</strong>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`선택 ${i + 1} 삭제`}
                    onClick={() =>
                      change({
                        ...value,
                        choices: value.choices.filter((_, j) => i !== j),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Field label={`선택 ${i + 1} 이름`}>
                  <Input
                    value={choice.label}
                    onChange={(e) =>
                      change({
                        ...value,
                        choices: value.choices.map((c, j) =>
                          j === i ? { ...c, label: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`선택 ${i + 1} 미션 문구`}>
                  <Input
                    value={choice.message}
                    onChange={(e) =>
                      change({
                        ...value,
                        choices: value.choices.map((c, j) =>
                          j === i ? { ...c, message: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </Field>
              </CardContent>
            </Card>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              change({
                ...value,
                choices: [
                  ...value.choices,
                  {
                    id: crypto.randomUUID(),
                    label: "새 선택",
                    message: "새 미션",
                  },
                ],
              })
            }
          >
            <Plus />
            선택지 추가
          </Button>
        </>
      );
    case "move_steps":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="이동할 칸 수"
              value={value.steps}
              change={(steps) => change({ ...value, steps })}
            />
            <Options
              label="이동 방향"
              value={value.direction}
              options={[
                ["with_current", "현재 방향으로"],
                ["against_current", "현재 방향의 반대로"],
                ["forward", "정방향 고정"],
                ["reverse", "역방향 고정"],
              ]}
              change={(direction) => change({ ...value, direction })}
            />
          </div>
          <Options
            label="이동을 마치면"
            value={value.onArrival}
            options={arrivalOptions}
            change={(onArrival) => change({ ...value, onArrival })}
          />
          <Toggle
            label="지나가는 칸의 동작도 실행"
            checked={value.onPass === "trigger"}
            change={(v) => change({ ...value, onPass: v ? "trigger" : "skip" })}
          />
        </>
      );
    case "choose_destination":
      return (
        <>
          <Options
            label="언제 이동하나요?"
            value={value.timing}
            options={[
              ["next_turn", "다음 차례의 주사위 대신 여행"],
            ]}
            help={value.timing === "immediate" ? "기존의 즉시 이동 설정은 실행할 수 없어요. 다음 차례로 바꿔주세요." : undefined}
            change={(timing) => change({ ...value, timing })}
          />
          <Options
            label="누가 목적지를 고르나요?"
            value={value.selection}
            options={selectionOptions.filter(([selection]) => selection !== "donor_chat")}
            change={(selection) => change({ ...value, selection })}
          />
          <Options
            label="도착하면"
            value={value.onArrival}
            options={arrivalOptions}
            change={(onArrival) => change({ ...value, onArrival })}
          />
          <Toggle
            label="현재 칸은 목적지에서 제외"
            checked={value.excludeCurrentCell}
            change={(excludeCurrentCell) =>
              change({ ...value, excludeCurrentCell })
            }
          />
          <Toggle
            label="갈 수 있는 칸을 직접 지정"
            checked={value.allowedCellIds !== null}
            change={(limited) =>
              change({
                ...value,
                allowedCellIds: limited ? [...board.path] : null,
              })
            }
          />
          {value.allowedCellIds !== null && (
            <div className="grid max-h-52 gap-3 overflow-auto p-1">
              {board.path.map((id, i) => (
                <ConsoleCheck
                  key={id}
                  checked={value.allowedCellIds!.includes(id)}
                  onCheckedChange={(checked) =>
                    change({
                      ...value,
                      allowedCellIds: checked
                        ? [...value.allowedCellIds!, id]
                        : value.allowedCellIds!.filter((x) => x !== id),
                    })
                  }
                >
                  <span>
                    {i + 1}. {board.cells.find((c) => c.id === id)?.label}
                  </span>
                </ConsoleCheck>
              ))}
            </div>
          )}
        </>
      );
    case "set_direction":
      return (
        <Options
          label="다음 이동부터"
          value={value.direction}
          options={[
            ["toggle", "지금 방향의 반대로"],
            ["forward", "정방향으로 고정"],
            ["reverse", "역방향으로 고정"],
          ]}
          change={(direction) => change({ ...value, direction })}
        />
      );
    case "movement_lock":
      return (
        <>
          <Options
            label="어떻게 탈출하나요?"
            value={value.release.type}
            options={[
              ["skip_rolls_or_doubles", "몇 회 쉬기 · 더블이면 바로 탈출"],
              ["skip_rolls", "정해진 횟수만큼 쉬기"],
              ["dice_faces", "특정 주사위 눈이 나오면 탈출"],
              ["operator", "운영자가 직접 해제"],
            ]}
            change={(type) =>
              change({
                ...value,
                release:
                  type === "operator"
                    ? { type }
                    : type === "dice_faces"
                      ? { type, faces: [1] }
                      : type === "skip_rolls"
                        ? { type, count: 3 }
                        : { type, count: 3, onDoubles: "move_sum" },
              })
            }
          />
          {(value.release.type === "skip_rolls" ||
            value.release.type === "skip_rolls_or_doubles") && (
            <NumberField
              label="쉬는 차례 수"
              value={value.release.count}
              change={(count) => {
                if (
                  value.release.type === "skip_rolls" ||
                  value.release.type === "skip_rolls_or_doubles"
                )
                  change({ ...value, release: { ...value.release, count } });
              }}
            />
          )}
          {value.release.type === "skip_rolls_or_doubles" && (
            <>
              <Options
                label="더블로 탈출한 차례에는"
                value={value.release.onDoubles}
                options={[
                  ["move_sum", "두 주사위의 합만큼 이동"],
                  ["release_only", "탈출만 하고 이동은 다음 차례에"],
                ]}
                change={(onDoubles) => {
                  if (value.release.type === "skip_rolls_or_doubles")
                    change({
                      ...value,
                      release: { ...value.release, onDoubles },
                    });
                }}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                탈출 판정에만 주사위 2개를 사용해요.
              </p>
            </>
          )}
          {value.release.type === "dice_faces" && (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: board.dice.sides }, (_, i) => i + 1).map(
                (face) => (
                  <ConsoleCheck
                    key={face}
                    checked={
                      value.release.type === "dice_faces" &&
                      value.release.faces.includes(face)
                    }
                    onCheckedChange={(checked) => {
                      if (value.release.type === "dice_faces")
                        change({
                          ...value,
                          release: {
                            type: "dice_faces",
                            faces: checked
                              ? [...value.release.faces, face]
                              : value.release.faces.filter((x) => x !== face),
                          },
                        });
                    }}
                  >
                    {face}
                  </ConsoleCheck>
                ),
              )}
            </div>
          )}
        </>
      );
    case "modify_roll":
      return (
        <>
          <Options
            label="무엇을 바꾸나요?"
            value={value.modifier.type}
            options={[
              ["movement_multiplier", "나온 눈에 따른 이동 거리"],
            ]}
            change={(type) =>
              change({
                ...value,
                modifier:
                  type === "movement_multiplier"
                    ? { type, factor: 2 }
                    : { type, count: 2 },
              })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={
                value.modifier.type === "movement_multiplier"
                  ? "이동 거리 배수"
                  : value.modifier.type === "dice_count"
                    ? "주사위 개수"
                    : "굴리는 횟수"
              }
              value={
                "factor" in value.modifier
                  ? value.modifier.factor
                  : value.modifier.count
              }
              change={(n) =>
                change({
                  ...value,
                  modifier:
                    value.modifier.type === "movement_multiplier"
                      ? { ...value.modifier, factor: n }
                      : { ...value.modifier, count: n },
                })
              }
            />
            <NumberField
              label="적용할 차례 수"
              value={value.uses}
              change={(uses) => change({ ...value, uses })}
            />
          </div>
        </>
      );
    case "counter_add":
    case "counter_settle":
      return (
        <>
          <Options
            label="어떤 수량인가요?"
            value={value.counterId}
            options={[
              ["", "적립 항목 선택"],
              ...(!board.counters.some((c) => c.id === value.counterId) &&
              value.counterId
                ? [
                    [
                      value.counterId,
                      `등록되지 않은 항목 (${value.counterId})`,
                    ] as const,
                  ]
                : []),
              ...board.counters.map(
                (c) => [c.id, `${c.label} (${c.unit})`] as const,
              ),
            ]}
            help={
              !board.counters.length
                ? "판 설정의 적립 항목에서 먼저 만들어주세요."
                : undefined
            }
            change={(counterId) => change(value.type === "counter_settle"
              ? { ...value, counterId, settleOn: "creation" }
              : { ...value, counterId })}
          />
          {value.type === "counter_add" ? (
            <NumberField
              label="도착할 때 적립할 수량"
              value={value.quantity}
              change={(quantity) => change({ ...value, quantity })}
            />
          ) : (
            <>
              <Field label="청산 미션 문구">
                <Input
                  value={value.message}
                  onChange={(e) =>
                    change({ ...value, message: e.target.value, settleOn: "creation" })
                  }
                />
              </Field>
              <p className="text-xs leading-relaxed text-muted-foreground">
                적립 전량으로 한 번의 미션을 보여줘요. 이후 새로 적립한
                수량은 다음 청산까지 남아요.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                청산 수량은 이 칸의 효과가 발생할 때 바로 차감돼요. 이전에 저장된 차감 시점도 실행 시 이 규칙으로 처리합니다.
              </p>
              <ShieldFields
                value={value.shield}
                items={items}
                change={(shield) => change({ ...value, shield, settleOn: "creation" })}
              />
            </>
          )}
        </>
      );
    case "grant_item":
      return (
        <>
          <ItemPicker
            value={value.itemId}
            items={items}
            change={(itemId) => change({ ...value, itemId })}
          />
          <NumberField
            label="지급할 개수"
            value={value.quantity}
            change={(quantity) => change({ ...value, quantity })}
          />
        </>
      );
    case "unconfigured":
      return (
        <Field
          label="나중에 정할 내용"
          help="게임판을 저장하려면 이 칸의 동작을 정해주세요."
        >
          <Input
            value={value.question}
            onChange={(e) => change({ ...value, question: e.target.value })}
          />
        </Field>
      );
    default:
      return (
        <p className="text-xs leading-relaxed text-muted-foreground">
          이 칸에서는 미션이나 추가 이동 없이 쉬어가요.
        </p>
      );
  }
}
export function EffectList({
  effects,
  trigger,
  board,
  items,
  change,
}: {
  effects: readonly BoardEffect[];
  trigger: "onLand" | "onPass";
  board: BoardDefinition;
  items: readonly NamedItem[];
  change: (effects: BoardEffect[]) => void;
}) {
  const types =
    trigger === "onPass"
      ? passTypes.filter((type) => type !== "unconfigured")
      : (Object.keys(effectNames) as BoardEffect["type"][]).filter((type) => type !== "choice_mission" && type !== "unconfigured");
  const update = (index: number, effect: BoardEffect) =>
    change(effects.map((e, i) => (i === index ? effect : e)));
  const move = (index: number, delta: number) => {
    const next = [...effects];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next);
  };
  return (
    <div className="space-y-4">
      {!effects.length && (
        <p className="py-4 text-sm text-muted-foreground">
          {trigger === "onPass"
            ? "지나갈 때는 아무 동작도 하지 않아요."
            : "아직 설정한 동작이 없어요."}
        </p>
      )}
      {effects.map((value, i) => (
        <div className="space-y-4" key={i}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {effects.length > 1
                ? `동작 ${i + 1}`
                : trigger === "onLand"
                  ? "이 칸에 도착하면"
                  : "이 칸을 지나가면"}
            </span>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {effects.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`동작 ${i + 1} 위로`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`동작 ${i + 1} 아래로`}
                    disabled={i === effects.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`동작 ${i + 1} 삭제`}
                onClick={() => change(effects.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <Options
            label="할 일"
            value={value.type}
            options={types.map((t) => [t, effectNames[t]] as const)}
            change={(type) => update(i, newEffect(type, items, board))}
          />
          <div className="grid gap-4">
            <EffectFields
              value={value}
              board={board}
              items={items}
              change={(effect) => update(i, effect)}
            />
          </div>
          <p className="text-sm leading-relaxed">
            {describeEffect(value, board, items)}
          </p>
        </div>
      ))}
      <Button
        variant="outline"
        className="w-full"
        disabled={effects.length >= 16}
        onClick={() => change([...effects, newEffect("mission", items, board)])}
      >
        <Plus />
        {effects.length ? "동작 하나 더 추가" : "동작 추가"}
      </Button>
    </div>
  );
}
