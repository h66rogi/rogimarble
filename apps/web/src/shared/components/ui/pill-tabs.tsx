"use client";

import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { cn } from "@/shared/lib/utils";

export type PillTabItem<T extends string> = {
  id: T;
  label: string;
  panelId?: string;
  icon?: LucideIcon;
  badge?: string | number;
  badgeLabel?: string;
  disabled?: boolean;
};

type PillTabsProps<T extends string> = {
  tabs: readonly PillTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
  idPrefix: string;
  className?: string;
};

export function PillTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  idPrefix,
  className,
}: PillTabsProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next = event.key === "ArrowRight" ? (index + 1) % buttons.length
      : event.key === "ArrowLeft" ? (index + buttons.length - 1) % buttons.length
      : event.key === "Home" ? 0 : buttons.length - 1;
    event.preventDefault();
    buttons[next].focus();
    buttons[next].click();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <Button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-label={tab.label}
            aria-description={tab.badgeLabel}
            aria-controls={tab.panelId ?? `${idPrefix}-panel-${tab.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            variant={active ? "default" : "outline"}
            className="rounded-full transition-none"
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
          >
            {Icon && <Icon className="size-4" />}
            {tab.label}
            {tab.badge !== undefined && tab.badge !== 0 && (
              <Badge
                variant={active ? "secondary" : "default"}
                aria-label={tab.badgeLabel}
                className="ml-1 h-[18px] min-w-[18px] justify-center px-1.5 py-0 text-[10px]"
              >
                {tab.badge}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
