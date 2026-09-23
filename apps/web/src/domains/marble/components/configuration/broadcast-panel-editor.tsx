"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { BroadcastPanel } from "@rogimarble/overlay-ui";
import { DEFAULT_BROADCAST_MENU, DEFAULT_DICE_PRICE, type BroadcastDonationRule, type OverlayLayoutDto } from "@rogimarble/contracts";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { PillTabs } from "@/shared/components/ui/pill-tabs";
import { Field, NumberField, Options } from "./editor-fields";

export function BroadcastPanelEditor({ value, rules, change }: {
  value: OverlayLayoutDto; rules: readonly BroadcastDonationRule[]; change: (value: OverlayLayoutDto) => void;
}) {
  const idPrefix = useId();
  const [selectedPanel, setSelectedPanel] = useState<"dice-price" | "menu">("dice-price");
  const menu = value.menu ?? DEFAULT_BROADCAST_MENU;
  const dice = value.dicePrice ?? DEFAULT_DICE_PRICE;
  const diceRules = rules.filter(rule => rule.rollCount === 1);
  return <Card>
    <CardHeader className="space-y-3">
      <CardTitle>방송 패널 내용</CardTitle>
      <p className="text-sm text-muted-foreground">표시할 문구와 가격을 편집해 게시합니다. 패널의 표시 여부·위치·크기와 개별 스타일은 오버레이 설정에서 바꿀 수 있어요.</p>
    </CardHeader>
    <CardContent>
      <PillTabs ariaLabel="방송 패널 내용" idPrefix={idPrefix} activeTab={selectedPanel} onTabChange={setSelectedPanel} tabs={[{ id: "dice-price", label: "주사위 가격" }, { id: "menu", label: "후원 메뉴" }]} />
      <div id={`${idPrefix}-panel-dice-price`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-dice-price`} hidden={selectedPanel !== "dice-price"} className={selectedPanel === "dice-price" ? "grid min-w-0 gap-6 pt-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" : "hidden"}>
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="가격 패널 문구"><Input value={dice.label} maxLength={60} onChange={e => change({ ...value, dicePrice: { ...dice, label: e.target.value } })} /></Field>
            <Field label="가격 패널 단위"><Input value={dice.currencyLabel} maxLength={12} onChange={e => change({ ...value, dicePrice: { ...dice, currencyLabel: e.target.value } })} /></Field>
            <Options label="주사위 가격 가져오기" value={dice.source} options={[["rules", "게시한 주사위 1회 규칙"], ["custom", "표시 가격 직접 입력"]]} change={source => change({ ...value, dicePrice: { ...dice, source, ...(source === 'custom' ? { amount: dice.amount ?? diceRules[0]?.amount ?? 1 } : {}) } })} />
            {dice.source === 'custom' ? <NumberField label="주사위 표시 가격" value={dice.amount ?? 1} max={1000000000} change={amount => change({ ...value, dicePrice: { ...dice, amount } })} /> : <Options label="표시할 주사위 규칙" value={dice.ruleId ?? "auto"} options={[["auto", "규칙이 하나일 때 자동 선택"], ...diceRules.map(rule => [rule.id, `${rule.label} · ${rule.amount.toLocaleString()}${dice.currencyLabel}`] as const)]} change={id => { const { ruleId: _, ...rest } = dice; change({ ...value, dicePrice: id === "auto" ? rest : { ...rest, ruleId: id } }); }} />}
          </div>
          {dice.source === 'rules' && diceRules.length !== 1 && !dice.ruleId && <p className="text-sm text-muted-foreground">주사위 1회 규칙이 없거나 여러 개이면 가격을 자동 선택하지 않아요. 표시할 규칙을 선택해 주세요.</p>}
        </div>
        <div className="min-w-0 space-y-2">
          <h4 className="text-sm font-semibold">주사위 가격 미리보기</h4>
          <div className="h-20"><BroadcastPanel kind="dice_price" layout={value} rules={rules} /></div>
        </div>
      </div>
      <div id={`${idPrefix}-panel-menu`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-menu`} hidden={selectedPanel !== "menu"} className={selectedPanel === "menu" ? "grid min-w-0 gap-6 pt-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" : "hidden"}>
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="메뉴판 제목"><Input value={menu.title} maxLength={60} onChange={e => change({ ...value, menu: { ...menu, title: e.target.value } })} /></Field>
            <Field label="메뉴판 단위"><Input value={menu.currencyLabel} maxLength={12} onChange={e => change({ ...value, menu: { ...menu, currencyLabel: e.target.value } })} /></Field>
          </div>
          <Options label="메뉴 가져오기" value={menu.source} options={[["rules", "게시한 후원 규칙 자동 표시"], ["custom", "메뉴 직접 입력"]]} change={source => change({ ...value, menu: { ...menu, source } })} />
          {menu.source === 'rules' ? <p className="text-sm text-muted-foreground">활성화된 후원 규칙 {rules.length}개를 표시해요. 규칙을 게시하면 이름과 가격도 함께 바뀝니다.</p> : <div className="space-y-3">
            {menu.rows.map((row, index) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Field label={`메뉴 ${index + 1} 이름`}><Input value={row.label} maxLength={80} onChange={e => change({ ...value, menu: { ...menu, rows: menu.rows.map(r => r.id === row.id ? { ...r, label: e.target.value } : r) } })} /></Field>
              <NumberField label={`메뉴 ${index + 1} 가격`} value={row.amount} max={1000000000} change={amount => change({ ...value, menu: { ...menu, rows: menu.rows.map(r => r.id === row.id ? { ...r, amount } : r) } })} />
              <Button variant="ghost" size="icon" aria-label={`메뉴 ${index + 1} 삭제`} onClick={() => change({ ...value, menu: { ...menu, rows: menu.rows.filter(r => r.id !== row.id) } })}><Trash2 /></Button>
            </div>)}
            <Button variant="outline" disabled={menu.rows.length >= 20} onClick={() => change({ ...value, menu: { ...menu, rows: [...menu.rows, { id: crypto.randomUUID(), label: "새 메뉴", amount: 1 }] } })}><Plus />메뉴 추가</Button>
          </div>}
          <p className="text-xs text-muted-foreground">직접 입력한 메뉴·가격은 방송에 표시할 안내 문구예요. 실제 후원 동작은 후원 규칙에서 설정하세요.</p>
        </div>
        <div className="min-w-0 space-y-2">
          <h4 className="text-sm font-semibold">후원 메뉴 미리보기</h4>
          <div className="h-80"><BroadcastPanel kind="menu" layout={value} rules={rules} /></div>
        </div>
      </div>
    </CardContent>
  </Card>;
}
