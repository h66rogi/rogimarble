"use client";

import { useState } from "react";
import type { OperatorCommand, OperatorSnapshot } from "../../../../lib/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { ConsoleField } from "@/shared/components/common/console-ui";

export function AccumulationRewardsPanel({
  state,
  disabled,
  reason,
  onReasonChange,
  send,
}: {
  state: OperatorSnapshot | null;
  disabled: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  send: (command: OperatorCommand) => Promise<boolean>;
}) {
  const [counterValues, setCounterValues] = useState<Record<string, string>>({});
  const [inventoryValues, setInventoryValues] = useState<Record<string, string>>({});
  if (!state?.session) return <p className="text-sm text-muted-foreground">게임을 시작하면 적립과 보상 현황이 표시됩니다.</p>;
  return <div className="space-y-6">
    <ConsoleField label="수량 조정 사유">
      <Input value={reason} onChange={(event) => onReasonChange(event.target.value)} />
    </ConsoleField>
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">현재 적립</h3>
      {state.counters?.length ? state.counters.map((counter) => <div key={counter.counterId} className="space-y-3 border-b pb-3 last:border-b-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <strong className="text-sm">{counter.label}</strong>
          <div className="text-right text-sm">
            <strong>총 {counter.value} {counter.unit}</strong>
          </div>
        </div>
        {state.capabilities?.manualRoll && <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={disabled || counter.value >= 100000}
              onClick={() => void send({ type: "adjust_counter", counterId: counter.counterId,
                quantity: counter.value + 1, expectedCounterRevision: counter.revision,
                expectedRevision: state.revision, reason })}>+1 {counter.unit}</Button>
            <Button size="sm" variant="outline" disabled={disabled || counter.value <= counter.reserved}
              onClick={() => void send({ type: "adjust_counter", counterId: counter.counterId,
                quantity: counter.value - 1, expectedCounterRevision: counter.revision,
                expectedRevision: state.revision, reason })}>−1 {counter.unit}</Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><ConsoleField label={`${counter.label} 최종 총량`}>
              <Input type="number" min={counter.reserved} max="100000" value={counterValues[counter.counterId] ?? ""}
                onChange={(event) => setCounterValues((current) => ({ ...current, [counter.counterId]: event.target.value }))} />
            </ConsoleField></div>
            <Button size="sm" disabled={disabled || !/^\d+$/.test(counterValues[counter.counterId] ?? "") ||
              Number(counterValues[counter.counterId]) < counter.reserved || Number(counterValues[counter.counterId]) > 100000}
              onClick={() => void send({ type: "adjust_counter", counterId: counter.counterId,
                quantity: Number(counterValues[counter.counterId]), expectedCounterRevision: counter.revision,
                expectedRevision: state.revision, reason }).then((ok) => {
                  if (ok) setCounterValues((current) => ({ ...current, [counter.counterId]: "" }));
                })}>총량 설정</Button>
          </div>
        </>}
      </div>) : <p className="text-sm text-muted-foreground">적립 중인 항목이 없습니다.</p>}
    </div>
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">보상 현황</h3>
      {state.inventory.length ? state.inventory.map((item) => <div key={item.itemId} className="space-y-3 border-b pb-3 last:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">{item.name}</strong>
          <Badge variant={item.quantity > 0 ? "default" : "secondary"}>
            {item.quantity > 0 ? `사용 가능 ${item.quantity}개` : "보유 수량 없음"}
          </Badge>
        </div>
        {state.capabilities?.inventory && <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" aria-label={`${item.name} 1개 추가`} disabled={disabled}
              onClick={() => void send({ type: "adjust_inventory", itemId: item.itemId, mode: "delta", quantity: 1,
                expectedInventoryRevision: item.revision, expectedRevision: state.revision, reason })}>+1</Button>
            <Button size="sm" variant="outline" aria-label={`${item.name} 1개 차감`} disabled={disabled || item.quantity < 1}
              onClick={() => void send({ type: "adjust_inventory", itemId: item.itemId, mode: "delta", quantity: -1,
                expectedInventoryRevision: item.revision, expectedRevision: state.revision, reason })}>−1</Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><ConsoleField label={`${item.name} 최종 수량`}>
              <Input type="number" min="0" inputMode="numeric" value={inventoryValues[item.itemId] ?? ""}
                onChange={(event) => setInventoryValues((current) => ({ ...current, [item.itemId]: event.target.value }))} />
            </ConsoleField></div>
            <Button size="sm" disabled={disabled || !/^\d+$/.test(inventoryValues[item.itemId] ?? "")}
              onClick={() => void send({ type: "adjust_inventory", itemId: item.itemId, mode: "set",
                quantity: Number(inventoryValues[item.itemId]), expectedInventoryRevision: item.revision,
                expectedRevision: state.revision, reason }).then((ok) => {
                  if (ok) setInventoryValues((current) => ({ ...current, [item.itemId]: "" }));
                })}>설정</Button>
          </div>
        </>}
      </div>) : <p className="text-sm text-muted-foreground">등록된 보상 아이템이 없습니다.</p>}
    </div>
  </div>;
}
