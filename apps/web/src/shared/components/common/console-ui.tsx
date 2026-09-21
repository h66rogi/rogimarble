"use client";

import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Button } from "@/shared/components/ui/button";
import { ChevronDown } from "lucide-react";

/** Console compositions own visual styling; callers supply content and layout only. */
export function ConsolePanel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function ConsoleNotice({
  children,
  title,
  variant = "default",
}: {
  children: ReactNode;
  title?: string;
  variant?: "default" | "destructive" | "warning" | "success";
}) {
  return (
    <Alert
      variant={variant}
      role={variant === "destructive" ? "alert" : "status"}
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function ConsoleField({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string; "aria-labelledby"?: string }>;
}) {
  const generated = useId();
  const id = children.props.id ?? generated;
  return (
    <div className="grid gap-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {cloneElement(children, { id, "aria-labelledby": `${id}-label` })}
    </div>
  );
}

export function ConsoleCheck({
  children,
  checked,
  onCheckedChange,
  disabled,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id}>{children}</Label>
    </div>
  );
}

/** Prefix values so an explicit empty option never violates Radix's nonempty item contract. */
export function ConsoleSelect({
  value,
  options,
  onValueChange,
  placeholder = "선택",
  id,
  disabled,
  ...label
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <Select
      value={
        options.some((option) => option.value === value) ? `value:${value}` : ""
      }
      onValueChange={(next) => onValueChange(next.slice(6))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" {...label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={`value:${option.value}`}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ConsoleDetails({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <ChevronDown />
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {children}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
