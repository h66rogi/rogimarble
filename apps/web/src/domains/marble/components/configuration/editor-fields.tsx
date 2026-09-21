"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Button } from "@/shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { ConsoleSelect } from "@/shared/components/common/console-ui";
import type { ShieldCost } from "@rogimarble/game-core";
import type { NamedItem } from "./editor-model";

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-labelledby"?: string;
            }>,
            { id, "aria-labelledby": `${id}-label` },
          )
        : children}
      {help && (
        <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
      )}
    </div>
  );
}
export function NumberField({
  label,
  value,
  change,
  min = 1,
  max,
  step = 1,
  help,
}: {
  label: string;
  value: number;
  change: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) =>
          change(e.target.value === "" ? 0 : Number(e.target.value))
        }
      />
    </Field>
  );
}
export function Options<T extends string>({
  label,
  value,
  options,
  change,
  help,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  change: (value: T) => void;
  help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <ConsoleSelect
        value={value}
        options={options.map(([value, label]) => ({ value, label }))}
        onValueChange={(v) => change(v as T)}
      />
    </Field>
  );
}
export function Toggle({
  label,
  help,
  checked,
  change,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  change: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {help && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {help}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={change}
      />
    </div>
  );
}
export function ItemPicker({
  label = "아이템",
  value,
  items,
  change,
}: {
  label?: string;
  value: string;
  items: readonly NamedItem[];
  change: (id: string) => void;
}) {
  const missing = value && !items.some((item) => item.id === value);
  return (
    <Options
      label={label}
      value={value}
      change={change}
      options={[
        ["", "아이템을 선택하세요"],
        ...(missing
          ? [[value, `등록되지 않은 아이템 (${value})`] as const]
          : []),
        ...items.map((item) => [item.id, item.label] as const),
      ]}
      help={
        !items.length
          ? "아이템 탭에서 먼저 아이템을 등록하고 게시하세요."
          : undefined
      }
    />
  );
}
export function ShieldFields({
  value,
  items,
  change,
}: {
  value: ShieldCost | null;
  items: readonly NamedItem[];
  change: (value: ShieldCost | null) => void;
}) {
  return (
    <div className="space-y-3">
      <Toggle
        label="실드로 이 미션 방어 가능"
        help={
          value
            ? "지정한 아이템을 사용하면 미션을 방어해요."
            : "실드를 가지고 있어도 이 미션에는 사용할 수 없어요."
        }
        checked={value !== null}
        change={(enabled) =>
          change(enabled ? { itemId: items[0]?.id ?? "", quantity: 1 } : null)
        }
      />
      {value && (
        <div className="grid grid-cols-2 gap-3">
          <ItemPicker
            label="사용할 실드"
            value={value.itemId}
            items={items}
            change={(itemId) => change({ ...value, itemId })}
          />
          <NumberField
            label="필요한 개수"
            value={value.quantity}
            change={(quantity) => change({ ...value, quantity })}
          />
        </div>
      )}
    </div>
  );
}
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="space-y-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" type="button">
          <ChevronDown />
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
export const selectionOptions = [
  ["both", "운영자 또는 후원자 채팅"],
  ["operator", "운영자만"],
  ["donor_chat", "후원자 채팅만"],
] as const;
export const arrivalOptions = [
  ["trigger", "도착한 칸의 동작 실행"],
  ["skip", "이동만 하고 동작 생략"],
] as const;
