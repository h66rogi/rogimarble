"use client";

import { Button } from "./button";
import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const selectionVariants = cva(
  "h-auto whitespace-normal justify-start relative cursor-pointer rounded-lg border text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      layout: {
        row: "flex w-full items-center gap-4 p-4",
        tile: "flex min-h-20 flex-col items-center justify-center gap-2 p-2 text-center text-xs",
        chip: "inline-flex items-center gap-2 px-3 py-2",
      },
      selected: {
        true: "border-primary bg-primary/5 text-foreground ring-1 ring-primary",
        false: "border-border bg-card text-card-foreground hover:bg-accent",
      },
    },
    defaultVariants: { layout: "row", selected: false },
  },
);
/** A selectable option with shared, theme-driven states for editors and pickers. */
export function SelectionButton({
  className,
  layout,
  selected,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof selectionVariants>) {
  return (
    <Button
      variant="outline"
      type="button"
      aria-pressed={selected ?? false}
      className={cn(selectionVariants({ layout, selected }), className)}
      {...props}
    />
  );
}
