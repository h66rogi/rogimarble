"use client";

import { Button } from "./button";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Accessible board hit target. Geometry and artwork are supplied by the board renderer. */
export function BoardCellButton({
  selected,
  previewing,
  dimmed,
  className,
  ...props
}: ComponentProps<"button"> & {
  selected?: boolean;
  previewing?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      aria-pressed={selected}
      className={cn(
        "h-auto whitespace-normal absolute flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-center outline-none transition-[opacity,box-shadow] focus-visible:ring-4 focus-visible:ring-ring hover:ring-2 hover:ring-primary/40 disabled:pointer-events-none disabled:opacity-50",
        selected &&
          "z-20 ring-3 ring-primary ring-offset-2 ring-offset-background",
        previewing && "z-30 ring-4 ring-primary",
        dimmed && "opacity-30",
        className,
      )}
      {...props}
    />
  );
}
