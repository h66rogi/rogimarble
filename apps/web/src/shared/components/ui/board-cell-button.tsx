"use client";

import { Button } from "./button";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Accessible board hit target. Geometry and artwork are supplied by the board renderer. */
export function BoardCellButton({
  selected,
  previewing,
  dimmed,
  layout = "board",
  className,
  ...props
}: ComponentProps<"button"> & {
  selected?: boolean;
  previewing?: boolean;
  dimmed?: boolean;
  layout?: "board" | "grid";
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      aria-pressed={selected}
      className={cn(
        "h-auto whitespace-normal flex flex-col items-center justify-center gap-0.5 rounded-xl text-center outline-none transition-[opacity,box-shadow] focus-visible:ring-4 focus-visible:ring-ring hover:ring-2 hover:ring-primary/40 disabled:pointer-events-none disabled:opacity-50",
        layout === "grid" ? "relative h-12 min-w-0 gap-0 px-0.5 py-1 leading-tight" : "absolute px-1 py-1",
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
