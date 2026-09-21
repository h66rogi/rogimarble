"use client";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import { SelectionButton } from "@/shared/components/ui/selection-button";
import { Disclosure } from "./editor-fields";

import { useState } from "react";
import {
  ArrowRight,
  Coins,
  Copy,
  Dice5,
  Gift,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  resolveDonationTrigger,
  validateDonationTriggerConfig,
  type DonationAction,
  type DonationRule,
  type DonationTriggerConfig,
} from "@rogimarble/game-core";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Field,
  ItemPicker,
  NumberField,
  Options,
  ShieldFields,
  Toggle,
  selectionOptions,
} from "./editor-fields";
import {
  actionNames,
  describeAction,
  newAction,
  type NamedItem,
} from "./editor-model";

export function RulesEditor({
  value,
  items,
  change,
}: {
  value: DonationTriggerConfig;
  items: readonly NamedItem[];
  change: (config: DonationTriggerConfig) => void;
}) {
  const [selectedId, setSelectedId] = useState(value.rules[0]?.id);
  const [search, setSearch] = useState("");
  const [testAmount, setTestAmount] = useState(33);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selected =
    value.rules.find((r) => r.id === selectedId) ?? value.rules[0];
  const itemOptions = [
    ...items,
    ...value.items.filter((item) => !items.some((i) => i.id === item.id)),
  ];
  const commit = (rules: readonly DonationRule[]) => {
    // Keep stable references in the rules subdocument; publishing still checks active item definitions.
    const ids = rules.flatMap((r) =>
      r.action.type === "grant_item"
        ? [r.action.itemId]
        : r.action.type === "mission" && r.action.shield
          ? [r.action.shield.itemId]
          : [],
    );
    change({
      ...value,
      rules,
      items: [
        ...value.items,
        ...items
          .filter(
            (item) =>
              ids.includes(item.id) &&
              !value.items.some((i) => i.id === item.id),
          )
          .map(({ id, label }) => ({ id, label })),
      ],
    });
  };
  const update = (patch: Partial<DonationRule>) =>
    commit(
      value.rules.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)),
    );
  const add = (source?: DonationRule) => {
    let amount = 1;
    while (value.rules.some((r) => r.amount === amount)) amount++;
    const rule: DonationRule = {
      id: `rule-${crypto.randomUUID()}`,
      amount,
      label: source ? `${source.label} 복사` : "새 후원 규칙",
      enabled: false,
      action: source
        ? structuredClone(source.action)
        : newAction("roll_dice", items),
    };
    commit([...value.rules, rule]);
    setSelectedId(rule.id);
    setSearch("");
  };
  const duplicates = new Set(
    value.rules
      .filter((r) =>
        value.rules.some(
          (other) => other.id !== r.id && other.amount === r.amount,
        ),
      )
      .map((r) => r.id),
  );
  let testText = "후원 개수를 입력하면 어떤 규칙이 실행되는지 보여요.";
  try {
    validateDonationTriggerConfig(value);
    const result = resolveDonationTrigger(testAmount, value);
    testText = result.matched
      ? `${result.label} · ${describeAction(result.action, itemOptions)}`
      : {
          "invalid-amount": "1 이상의 정수로 입력하세요.",
          "no-exact-match": "등록된 개수가 아니어서 아무 동작도 하지 않아요.",
          "rule-disabled": "이 개수의 규칙은 꺼져 있어요.",
          "multi-roll-disabled": "연속 주사위가 꺼져 있어 실행하지 않아요.",
        }[result.reason];
  } catch {
    testText = "규칙 입력을 완성하면 결과를 확인할 수 있어요.";
  }
  const filtered = value.rules.filter((r) =>
    `${r.amount} ${r.label} ${actionNames[r.action.type]}`.includes(search),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Coins />
          <span>
            <strong className="font-semibold">
              별풍선 몇 개를 받으면, 무엇을 할까요?
            </strong>
            <p className="text-sm leading-relaxed text-muted-foreground">
              등록한 개수와 정확히 같을 때만 한 가지 규칙이 실행돼요.
            </p>
          </span>
        </div>
        <Button onClick={() => add()}>
          <Plus />
          후원 규칙 추가
        </Button>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              전체 {value.rules.length}개 · 사용 중{" "}
              {value.rules.filter((r) => r.enabled).length}개
            </span>
            <div className="flex w-56 max-w-full items-center gap-2">
              <Search size={15} />
              <Input
                aria-label="후원 규칙 검색"
                placeholder="개수·이름 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            {filtered.map((rule) => {
              const Icon = actionIcons[rule.action.type];
              return (
                <SelectionButton
                  key={rule.id}
                  selected={selected?.id === rule.id}
                  onClick={() => {
                    setSelectedId(rule.id);
                    setDeleteId(null);
                  }}
                >
                  <div className="flex w-16 shrink-0 items-baseline gap-1 sm:w-20">
                    <strong className="text-2xl font-bold">
                      {rule.amount.toLocaleString()}
                    </strong>
                    <span>개</span>
                  </div>
                  <ArrowRight size={17} />
                  <span className="min-w-0 flex-1 space-y-1">
                    <strong className="block truncate font-semibold">
                      {rule.label}
                    </strong>
                    <small className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon size={14} />
                      {describeAction(rule.action, itemOptions)}
                    </small>
                  </span>
                  <Badge variant="secondary">
                    {duplicates.has(rule.id)
                      ? "개수 중복"
                      : rule.enabled
                        ? "사용 중"
                        : "꺼짐"}
                  </Badge>
                </SelectionButton>
              );
            })}
            {!filtered.length && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
                <Dice5 />
                <h3 className="text-lg font-semibold">
                  {search
                    ? "찾는 규칙이 없어요"
                    : "첫 후원 규칙을 만들어보세요"}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {search
                    ? "다른 개수나 이름으로 검색해보세요."
                    : "주사위, 미션, 아이템, 목적지 선택을 연결할 수 있어요."}
                </p>
                {!search && (
                  <Button variant="outline" onClick={() => add()}>
                    <Plus />
                    규칙 추가
                  </Button>
                )}
              </div>
            )}
          </div>
          <Card className="">
            <CardContent className="space-y-4">
              <Toggle
                label="연속 주사위 허용"
                help="여러 번 굴리는 규칙을 사용할 때 켜주세요. 후원 개수와 횟수는 규칙마다 직접 등록해요."
                checked={value.multiRollEnabled}
                change={(multiRollEnabled) =>
                  change({ ...value, multiRollEnabled })
                }
              />
            </CardContent>
          </Card>
          <Card className="space-y-4">
            <CardContent className="space-y-4">
              <span className="text-xs font-medium text-muted-foreground">
                이 설정으로 후원을 받으면?
              </span>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Input
                  className="w-24"
                  aria-label="후원 미리보기 개수"
                  type="number"
                  min={1}
                  value={testAmount}
                  onChange={(e) => setTestAmount(Number(e.target.value))}
                />
                <span>개 후원</span>
                <ArrowRight size={18} />
                <strong className="font-semibold" role="status">
                  {testText}
                </strong>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                설정 확인용이에요. 후원 기록이나 게임 결과를 만들지 않아요.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card
          className="min-w-0 self-start xl:sticky xl:top-0"
          aria-label="후원 규칙 편집"
        >
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <header className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center text-xl font-bold text-primary">
                    <Coins size={22} />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      후원 규칙 편집
                    </span>
                    <h3 className="text-lg font-semibold">{selected.label}</h3>
                  </div>
                </header>
                <div className="space-y-5 xl:max-h-[calc(100vh-310px)] xl:overflow-y-auto">
                  <Toggle
                    label="이 규칙 사용"
                    checked={selected.enabled}
                    change={(enabled) => update({ enabled })}
                  />
                  <Field label="규칙 이름">
                    <Input
                      value={selected.label}
                      onChange={(e) => update({ label: e.target.value })}
                    />
                  </Field>
                  <NumberField
                    label="정확히 이 개수의 별풍선을 받으면"
                    value={selected.amount}
                    change={(amount) => update({ amount })}
                  />
                  {duplicates.has(selected.id) && (
                    <p role="alert" className="text-sm text-destructive">
                      같은 개수가 다른 규칙에 있어요. 꺼진 규칙도 서로 다른
                      개수를 사용해야 해요.
                    </p>
                  )}
                  <Options
                    label="이 동작을 실행해요"
                    value={selected.action.type}
                    options={
                      Object.entries(actionNames) as [
                        DonationAction["type"],
                        string,
                      ][]
                    }
                    change={(type) =>
                      update({ action: newAction(type, items) })
                    }
                  />
                  <DonationFields
                    action={selected.action}
                    items={itemOptions}
                    change={(action) => update({ action })}
                  />
                  {selected.action.type === "roll_dice" &&
                    selected.action.rollCount > 1 &&
                    !value.multiRollEnabled && (
                      <p className="text-sm text-muted-foreground">
                        왼쪽의 ‘연속 주사위 허용’을 켜야 실행돼요.
                      </p>
                    )}
                  <p className="text-sm leading-relaxed">
                    {selected.amount}개 →{" "}
                    {describeAction(selected.action, itemOptions)}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="outline" onClick={() => add(selected)}>
                      <Copy />
                      규칙 복사
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDeleteId(selected.id)}
                    >
                      <Trash2 />
                      삭제
                    </Button>
                  </div>
                  {deleteId === selected.id && (
                    <Card className="space-y-3">
                      <CardContent className="space-y-4">
                        <strong className="font-semibold">
                          ‘{selected.label}’ 규칙을 삭제할까요?
                        </strong>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          게시하면 {selected.amount}개 후원에 이 규칙이 실행되지
                          않아요.
                        </p>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Button
                            variant="destructive"
                            onClick={() => {
                              commit(
                                value.rules.filter((r) => r.id !== selected.id),
                              );
                              setDeleteId(null);
                            }}
                          >
                            규칙 삭제
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setDeleteId(null)}
                          >
                            취소
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Disclosure title={<>규칙 정보</>}>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      고유 번호: {selected.id}
                    </p>
                  </Disclosure>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
                <MessageCircle />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  규칙을 추가하면 여기에서 편집할 수 있어요.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function DonationFields({
  action,
  items,
  change,
}: {
  action: DonationAction;
  items: readonly NamedItem[];
  change: (action: DonationAction) => void;
}) {
  switch (action.type) {
    case "roll_dice":
      return (
        <NumberField
          label="주사위 굴리는 횟수"
          value={action.rollCount}
          change={(rollCount) => change({ ...action, rollCount })}
          help="2회 이상이면 한 번씩 순서대로 굴려요."
        />
      );
    case "mission":
      return (
        <>
          <Field label="미션 문구">
            <Input
              value={action.message}
              onChange={(e) => change({ ...action, message: e.target.value })}
            />
          </Field>
          <ShieldFields
            value={action.shield}
            items={items}
            change={(shield) => change({ ...action, shield })}
          />
        </>
      );
    case "grant_item":
      return (
        <>
          <ItemPicker
            items={items}
            value={action.itemId}
            change={(itemId) => change({ ...action, itemId })}
          />
          <NumberField
            label="지급할 개수"
            value={action.quantity}
            change={(quantity) => change({ ...action, quantity })}
          />
        </>
      );
    case "choose_destination":
      return (
        <>
          <Options
            label="목적지를 고를 사람"
            value={action.selection}
            options={selectionOptions}
            change={(selection) => change({ ...action, selection })}
          />
          {action.selection !== "operator" && (
            <Field label="후원자 채팅 명령어" help="예: !이동 5 → 5번 칸 선택">
              <Input
                value={action.chatCommand}
                onChange={(e) =>
                  change({ ...action, chatCommand: e.target.value })
                }
              />
            </Field>
          )}
        </>
      );
  }
}
const actionIcons = {
  roll_dice: Dice5,
  mission: MessageCircle,
  grant_item: Gift,
  choose_destination: MapPin,
};
